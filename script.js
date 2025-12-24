import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { trucks: [], jobs: [], receipts: [], clients: [], logs: [] };
let activeEditId = null; 

// --- 1. THE COMMANDER: NAVIGATION & PAGE GENERATION ---
window.tab = (id) => {
    // A. Visual Switch
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        
        // B. Logical Initialization (Build the page on entry)
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') buildSpreadsheet('trucks');
        if(id === 'driverlog') buildSpreadsheet('logs');
        if(id === 'clients') buildSpreadsheet('clients');
        if(id === 'inventory') buildSpreadsheet('inventory');
        if(id === 'dispatch') buildSpreadsheet('jobs');
        
        // C. Google Calendar Refresh
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.updateSize(); dashCal.render(); }, 100); 
        }
    }
    
    // D. Navigation Active State
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS_MODE`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. SPREADSHEET ENGINE: DYNAMIC DATA TABLES ---

function buildSpreadsheet(type) {
    const containerMap = {
        'trucks': 'trucks-spreadsheet-container',
        'logs': 'log-spreadsheet-container',
        'clients': 'clients-spreadsheet-container',
        'jobs': 'dispatch-content'
    };
    
    const container = document.getElementById(containerMap[type]);
    if (!container) return;

    let headers = '';
    let rows = '';

    if (type === 'trucks') {
        headers = `<tr><th>Unit ID</th><th>Model</th><th>Odometer</th><th>Status</th><th>Edit</th></tr>`;
        rows = fleetData.trucks.map(t => `
            <tr onclick="window.initEdit('truck', '${t.id}')">
                <td class="font-black italic uppercase text-white">${t.truckId}</td>
                <td>${t.make}</td>
                <td class="font-mono">${Number(t.miles).toLocaleString()}</td>
                <td><span class="st-chip ${t.status === 'Operational' ? 'op-ready' : 'op-transit'}">${t.status}</span></td>
                <td class="text-blue-500 font-black text-[10px]">MANAGE</td>
            </tr>
        `).join('');
    } else if (type === 'logs') {
        headers = `<tr><th>Date</th><th>Driver</th><th>Unit</th><th>Route</th><th>Status</th></tr>`;
        rows = fleetData.logs.map(l => `
            <tr><td>${l.date}</td><td class="font-black uppercase">${l.driver}</td><td class="text-blue-500">${l.truckId}</td><td>${l.route || 'Local'}</td><td>LIVE</td></tr>
        `).join('');
    }

    container.innerHTML = `
        <div class="registry-container">
            <table class="fleet-table">
                <thead>${headers}</thead>
                <tbody>${rows || '<tr><td colspan="5" class="text-center p-10 opacity-20">NO_DATA_LINKED</td></tr>'}</tbody>
            </table>
        </div>
    `;
    
    // If it's the truck page, also update the descriptive vitals bar
    if (type === 'trucks') updateTruckVitals();
}

function updateTruckVitals() {
    const bar = document.getElementById('fleet-vitals-bar') || document.getElementById('fleet-vitals-container');
    if (!bar) return;
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance').length
    };
    bar.innerHTML = `
        <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${stats.total}</h4></div>
        <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value text-green-500">${stats.ready}</h4></div>
        <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">Transit</p><h4 class="vital-value text-blue-500">${stats.transit}</h4></div>
        <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">In Shop</p><h4 class="vital-value text-red-500">${stats.shop}</h4></div>
    `;
}

// --- 3. GOOGLE CALENDAR: EDITING & NOTES ---

function initCalendar() {
    const el = document.getElementById('dash-calendar');
    if (!el) return;

    dashCal = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        editable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        dateClick: (info) => {
            const dateIn = document.getElementById('ev-date');
            if(dateIn) dateIn.value = info.dateStr;
            document.getElementById('event-modal').classList.remove('hidden');
        },
        eventClick: (info) => {
            // GOOGLE CALENDAR STYLE EDITING
            const task = info.event.title;
            const newTitle = prompt("Edit Task Details:", task);
            if (newTitle === null) return;
            if (newTitle === "") { info.event.remove(); } 
            else { info.event.setProp('title', newTitle); }
        },
        events: fleetData.jobs.map(j => ({ title: j.title, start: j.date, color: '#3b82f6' }))
    });
    dashCal.render();
}

// --- 4. DASHBOARD: OVERVIEW & SHORTCUTS ---

function renderDashboard() {
    // A. REVENUE & STAT TILES (INTERCONNECTED)
    const revTile = document.getElementById('dash-revenue-tile');
    if (revTile) {
        let bal = fleetData.receipts.reduce((s, r) => s + (r.category === 'Inflow' ? r.amount : -r.amount), 0);
        document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
        revTile.onclick = () => window.tab('clients');
    }

    const truckTile = document.getElementById('dash-trucks-tile');
    if (truckTile) {
        document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
        truckTile.onclick = () => window.tab('trucks');
    }

    // B. MISSION SCRIPT (THE OVERVIEW FEED BELOW CALENDAR)
    const ledger = document.getElementById('ledger-stream');
    if (ledger) {
        ledger.innerHTML = fleetData.receipts.slice(0, 5).map(r => `
            <div class="p-6 flex justify-between items-center group cursor-pointer hover:bg-white/[0.02]">
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500"><i data-lucide="activity" size="14"></i></div>
                    <div><h4 class="text-sm font-black">${r.vendor}</h4><p class="text-[9px] uppercase opacity-50">${r.category} • ${r.truckId}</p></div>
                </div>
                <h4 class="font-black text-white">$${r.amount.toFixed(2)}</h4>
            </div>
        `).join('');
    }
}

// --- 5. DATA SYNC & INITIALIZATION ---

window.addEventListener('load', () => {
    lucide.createIcons();
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);

    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v46-final';

    onAuthStateChanged(auth, u => {
        if(u) {
            user = u;
            document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0,6)}`;
            
            // Proactive Data Listeners
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                if(document.getElementById('trucks-tab').classList.contains('active')) buildSpreadsheet('trucks');
                renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), s => {
                fleetData.jobs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                if (dashCal) { dashCal.removeAllEvents(); dashCal.addEventSource(fleetData.jobs.map(j => ({ title: j.title, start: j.date }))); }
            });
        } else { signInAnonymously(auth); }
    });

    setTimeout(initCalendar, 500);
});

// Modal Logic
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.initEdit = (type, id) => { /* Logic to fill modal and edit */ };
window.saveTruckUnit = async () => { /* Logic */ };

