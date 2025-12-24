import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { trucks: [], jobs: [], receipts: [], logs: [], clients: [] };

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
auth = getAuth(app); db = getFirestore(app);
appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-logic-v700';

// --- 1. THE SWITCHBOARD (Navigation & Data Room Entry) ---
window.tab = (id) => {
    // A. Visual Switch
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // B. Activate Target
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        
        // C. SPREADSHEET ENGINE: Build the page registry dynamically
        if(id === 'dashboard') renderDashboard();
        if(['trucks', 'driverlog', 'clients', 'dispatch', 'inventory'].includes(id)) buildRegistry(id);

        // D. CALENDAR REFRESH: Force-renders the calendar to fix the "Void" issue
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.updateSize(); dashCal.render(); }, 100); 
        }
        if(id === 'calendar' && fullCal) { 
            setTimeout(() => { fullCal.updateSize(); fullCal.render(); }, 100); 
        }
    }

    const btn = document.querySelector(`[data-tab="${id}"]`);
    if(btn) btn.classList.add('active');
    
    document.getElementById('tab-title').innerText = id.toUpperCase() + '_OPERATIONS';
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

// --- 2. SPREADSHEET BUILDER (Universal Registry Implementation) ---
function buildRegistry(tabId) {
    const containerId = tabId === 'trucks' ? 'trucks-registry' : (tabId === 'driverlog' ? 'driverlog-registry' : (tabId === 'clients' ? 'clients-registry' : `${tabId}-registry`));
    const container = document.getElementById(containerId);
    if (!container) return;

    let headers = [];
    let rows = [];

    // DATA MAPPING
    if (tabId === 'trucks') {
        headers = ['Unit ID', 'Make/Model', 'Mileage', 'Status', 'Manage'];
        rows = fleetData.trucks.map(t => [t.truckId, t.make, Number(t.miles).toLocaleString() + ' mi', t.status, 'EDIT']);
    } else if (tabId === 'driverlog') {
        headers = ['Date', 'Driver', 'Unit', 'Route', 'Sync'];
        rows = fleetData.logs.map(l => [l.date, l.driver, l.truckId, l.route || 'OTR', 'LIVE']);
    } else if (tabId === 'clients') {
        headers = ['Company', 'POC', 'HQ', 'Rate', 'Sync'];
        rows = fleetData.clients.map(c => [c.name, c.contact, c.city, `$${c.rate}`, 'SETTLED']);
    }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-10">
            <h3 class="text-4xl font-black uppercase italic">${tabId} Registry</h3>
            ${tabId === 'trucks' ? '<button onclick="window.openTruckModal()" class="bg-blue-600 px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl">+ NEW UNIT</button>' : ''}
        </div>
        <div class="spreadsheet-container shadow-2xl">
            <table class="fleet-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="5" class="p-10 text-center opacity-20 italic">No Satellite Data Synced</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

// --- 3. GOOGLE STYLE CALENDAR ENGINE ---
function initCalendars() {
    const cfg = {
        initialView: 'dayGridMonth',
        editable: true,
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        dateClick: (i) => { 
            const dateIn = document.getElementById('ev-date');
            if(dateIn) dateIn.value = i.dateStr; 
            window.openEventModal(); 
        },
        eventClick: (i) => {
            const newTitle = prompt("Edit Task Details:", i.event.title);
            if (newTitle === "") i.event.remove();
            else if (newTitle) i.event.setProp('title', newTitle);
        },
        events: fleetData.jobs.map(j => ({ title: j.title, start: j.date, color: '#3b82f6' }))
    };

    const dEl = document.getElementById('dash-calendar');
    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, cfg); dashCal.render(); }
    
    const fEl = document.getElementById('full-page-calendar') || document.getElementById('full-calendar-render');
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, { ...cfg, height: '100%' }); fullCal.render(); }
}

// --- 4. DASHBOARD RENDERER ---
function renderDashboard() {
    // Tile Shortcut mapping
    const revTile = document.getElementById('tile-revenue') || document.getElementById('dash-revenue-tile');
    const truckTile = document.getElementById('tile-trucks') || document.getElementById('dash-trucks-tile');
    if(revTile) revTile.onclick = () => window.tab('clients');
    if(truckTile) truckTile.onclick = () => window.tab('trucks');

    let bal = fleetData.receipts.reduce((s, r) => s + (r.category === 'Inflow' ? r.amount : -r.amount), 0);
    const dBal = document.getElementById('total-display');
    const dTrk = document.getElementById('dash-truck-count');
    
    if(dBal) dBal.innerText = `$${bal.toLocaleString()}`;
    if(dTrk) dTrk.innerText = fleetData.trucks.length;

    const stream = document.getElementById('ledger-stream');
    if (stream) {
        stream.innerHTML = fleetData.receipts.slice(0, 5).map(r => `
            <div class="p-8 flex justify-between items-center group hover:bg-white/[0.02] cursor-pointer">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center"><i data-lucide="activity" size="18"></i></div>
                    <div><h4 class="text-sm font-black text-white">${r.vendor}</h4><p class="text-[9px] opacity-50 uppercase">${r.category}</p></div>
                </div>
                <h4 class="font-black text-white">$${Number(r.amount).toFixed(2)}</h4>
            </div>
        `).join('');
        lucide.createIcons();
    }
}

// --- 5. INITIALIZATION ---
window.addEventListener('load', async () => {
    setInterval(() => { 
        const clk = document.getElementById('live-clock');
        if(clk) clk.innerText = new Date().toLocaleTimeString(); 
    }, 1000);
    
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
    } else { await signInAnonymously(auth); }

    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            document.getElementById('user-id-tag').innerText = `NODE_${u.uid.slice(0, 6)}`;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        }
    });

    setTimeout(initCalendars, 500);
    lucide.createIcons();
});

window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.saveEvent = async () => { /* Logic */ window.closeModal(); };
window.saveTruckUnit = async () => { /* Logic */ window.closeModal(); };

