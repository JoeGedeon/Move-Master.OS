import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { trucks: [], jobs: [], receipts: [], logs: [], clients: [] };

const config = JSON.parse(__firebase_config);
const app = initializeApp(config);
auth = getAuth(app); db = getFirestore(app);
appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v1000-stable';

// --- 1. THE SWITCHBOARD: NAVIGATION & ROOM ACTIVATION ---
window.tab = (id) => {
    // Hide all
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Activate target
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        
        // Logical Trigger: Build the room's spreadsheet
        if(id === 'dashboard') renderDashboard();
        if(['trucks', 'driverlog', 'clients', 'dispatch', 'inventory'].includes(id)) buildRoomRegistry(id);

        // CALENDAR REPAIR: Forced Render Fix for "Void" issue
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.updateSize(); dashCal.render(); }, 100); }
        if(id === 'calendar' && fullCal) { setTimeout(() => { fullCal.updateSize(); fullCal.render(); }, 100); }
    }

    const btn = document.querySelector(`[data-tab="${id}"]`);
    if(btn) btn.classList.add('active');
    
    document.getElementById('tab-title').innerText = id.toUpperCase() + '_TERMINAL';
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

// --- 2. THE SPREADSHEET ENGINE (Building every page) ---
function buildRoomRegistry(tabId) {
    const containerId = `${tabId}-room`;
    const container = document.getElementById(containerId);
    if (!container) return;

    let headers = [];
    let rows = [];

    // DEFINE SPREADSHEET DATA BY TAB
    if (tabId === 'trucks') {
        headers = ['Unit ID', 'Model', 'Mileage', 'Status', 'Log'];
        rows = fleetData.trucks.map(t => [t.truckId, t.make, Number(t.miles).toLocaleString(), t.status, 'OPEN']);
    } else if (tabId === 'driverlog') {
        headers = ['Date', 'Driver Name', 'Unit', 'Route', 'Sync'];
        rows = fleetData.logs.map(l => [l.date, l.driver, l.truckId, l.route || 'OTR', 'LIVE']);
    } else if (tabId === 'clients') {
        headers = ['Partner', 'Contact', 'Location', 'Base Rate', 'Balance'];
        rows = fleetData.clients.map(c => [c.name, c.contact, c.city, `$${c.rate}`, 'SETTLED']);
    } else if (tabId === 'inventory') {
        headers = ['Part Name', 'Stock', 'Threshold', 'Location'];
        rows = [['New Tires', '12', '4', 'Bay 1'], ['Synthetic Oil', '20 Gal', '5 Gal', 'Shelf 3']];
    }

    container.innerHTML = `
        <div class="flex justify-between items-center mb-10 px-2">
            <h3 class="text-4xl font-black uppercase italic italic">${tabId} Data Registry</h3>
            <button class="bg-blue-600 px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl">+ New Entry</button>
        </div>
        <div class="registry-box">
            <table class="fleet-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>
                    ${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="5" class="p-10 text-center opacity-20">DATA_EMPTY_SYNC_REQD</td></tr>'}
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
        dateClick: (i) => { window.openEventModal(); },
        eventClick: (i) => {
            const newTitle = prompt("Edit Assignment:", i.event.title);
            if (newTitle === "") i.event.remove();
            else if (newTitle) i.event.setProp('title', newTitle);
        },
        events: fleetData.jobs.map(j => ({ title: j.title, start: j.date, color: '#3b82f6' }))
    };

    const dEl = document.getElementById('dash-calendar');
    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, cfg); dashCal.render(); }
    const fEl = document.getElementById('full-page-calendar');
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, { ...cfg, height: '100%' }); fullCal.render(); }
}

// --- 4. DASHBOARD RENDERER ---
function renderDashboard() {
    let bal = fleetData.receipts.reduce((s, r) => s + (r.category === 'Inflow' ? r.amount : -r.amount), 0);
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('dash-truck-count').innerText = fleetData.trucks.length;

    const stream = document.getElementById('ledger-stream');
    if (stream) {
        stream.innerHTML = fleetData.receipts.slice(0, 5).map(r => `
            <div class="p-8 flex justify-between items-center group hover:bg-white/[0.02] cursor-pointer">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center"><i data-lucide="activity" size="18"></i></div>
                    <div><h4 class="text-sm font-black text-white">${r.vendor}</h4><p class="text-[9px] opacity-50 uppercase font-bold tracking-widest">${r.category} • ${r.truckId}</p></div>
                </div>
                <h4 class="font-black text-white">$${Number(r.amount).toFixed(2)}</h4>
            </div>
        `).join('');
        lucide.createIcons();
    }
}

// --- 5. INITIALIZATION ---
window.addEventListener('load', async () => {
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { await signInWithCustomToken(auth, __initial_auth_token); } else { await signInAnonymously(auth); }

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
window.saveEvent = async () => { /* Logic to handle Firebase addDoc */ window.closeModal(); };

