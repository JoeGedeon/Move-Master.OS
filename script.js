import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM CONFIG ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { trucks: [], jobs: [], receipts: [], logs: [], clients: [] };
let activeEditId = null;

// --- 1. THE COMMANDER: TAB NAVIGATION & PAGE ACTIVATION ---
window.tab = (id) => {
    // A. Panel Management
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // B. Logical Triggers (Build the content on arrival)
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') buildSpreadsheet('trucks');
        if(id === 'driverlog') buildSpreadsheet('logs');
        if(id === 'clients') buildSpreadsheet('clients');
        
        // C. Calendar Force Render (Fixes collapse issue)
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        if(id === 'calendar' && fullCal) { setTimeout(() => { fullCal.render(); fullCal.updateSize(); }, 50); }
    }
    
    document.getElementById('tab-title').innerText = id.toUpperCase();
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. THE GOOGLE CALENDAR ENGINE (GOOGLE-STYLE ADD/EDIT) ---

function initCalendars() {
    const calendarConfig = {
        initialView: 'dayGridMonth',
        editable: true,
        selectable: true,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        dateClick: (info) => {
            document.getElementById('ev-date').value = info.dateStr;
            window.openEventModal();
        },
        eventClick: (info) => {
            const newTitle = prompt("Edit Task Note:", info.event.title);
            if (newTitle === "") { info.event.remove(); /* Add cloud delete */ }
            else if (newTitle) { info.event.setProp('title', newTitle); /* Add cloud update */ }
        },
        events: fleetData.jobs.map(j => ({ title: j.title, start: j.date, color: '#3b82f6' }))
    };

    const dEl = document.getElementById('dash-calendar');
    const fEl = document.getElementById('full-page-calendar');

    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, calendarConfig); dashCal.render(); }
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, calendarConfig); fullCal.render(); }
}

function syncCalendarData() {
    const events = fleetData.jobs.map(j => ({ title: j.title, start: j.date, color: '#3b82f6' }));
    [dashCal, fullCal].forEach(c => {
        if(c) {
            c.removeAllEvents();
            c.addEventSource(events);
        }
    });
}

// --- 3. SPREADSHEET ENGINE (THE "MISSING DATA" FIX) ---

function buildSpreadsheet(type) {
    const containerMap = {
        'trucks': 'trucks-spreadsheet-container',
        'logs': 'logs-spreadsheet-container',
        'clients': 'clients-spreadsheet-container'
    };
    
    const container = document.getElementById(containerMap[type]);
    if (!container) return;

    let tableHtml = '';
    
    if (type === 'trucks') {
        tableHtml = `
            <table class="fleet-table">
                <thead><tr><th>Unit ID</th><th>Model</th><th>Mileage</th><th>Status</th><th>Manage</th></tr></thead>
                <tbody>
                    ${fleetData.trucks.map(t => `
                        <tr onclick="window.initEditTruck('${t.id}')">
                            <td class="font-black text-white italic uppercase">${t.truckId}</td>
                            <td class="text-slate-500">${t.make}</td>
                            <td class="font-mono">${Number(t.miles).toLocaleString()} mi</td>
                            <td><span class="text-[9px] font-black uppercase text-blue-500">${t.status}</span></td>
                            <td class="text-blue-500 font-bold text-[10px]">EDIT</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        renderTruckVitals();
    } else if (type === 'logs') {
        tableHtml = `
            <table class="fleet-table">
                <thead><tr><th>Date</th><th>Driver</th><th>Unit</th><th>Route</th><th>Accountability</th></tr></thead>
                <tbody>
                    ${fleetData.logs.length ? fleetData.logs.map(l => `<tr><td>${l.date}</td><td class="font-black uppercase">${l.driver}</td><td>${l.truckId}</td><td>${l.route}</td><td class="text-green-500 font-black">SYNCED</td></tr>`).join('') : '<tr><td colspan="5" class="p-10 text-center opacity-20">No logs found</td></tr>'}
                </tbody>
            </table>
        `;
    }

    container.innerHTML = tableHtml || '<p class="p-10 text-center opacity-10 font-black">REGISTRY_EMPTY</p>';
}

function renderTruckVitals() {
    const bar = document.getElementById('fleet-vitals-injection');
    if (!bar) return;
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance').length
    };
    bar.innerHTML = `
        <div class="bg-white/5 p-6 rounded-3xl text-center"><p class="text-[9px] font-black uppercase text-slate-500">Fleet Count</p><h4 class="text-3xl font-black">${stats.total}</h4></div>
        <div class="bg-green-500/5 p-6 rounded-3xl text-center border border-green-500/10"><p class="text-[9px] font-black uppercase text-green-500">Ready</p><h4 class="text-3xl font-black text-green-500">${stats.ready}</h4></div>
        <div class="bg-blue-500/5 p-6 rounded-3xl text-center border border-blue-500/10"><p class="text-[9px] font-black uppercase text-blue-500">Transit</p><h4 class="text-3xl font-black text-blue-500">${stats.transit}</h4></div>
        <div class="bg-red-500/5 p-6 rounded-3xl text-center border border-red-500/10"><p class="text-[9px] font-black uppercase text-red-500">Shop</p><h4 class="text-3xl font-black text-red-500">${stats.shop}</h4></div>
    `;
}

// --- 4. DASHBOARD LOGIC ---

function renderDashboard() {
    let bal = fleetData.receipts.reduce((s, r) => s + (r.category === 'Inflow' ? r.amount : -r.amount), 0);
    document.getElementById('total-display').innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('truck-count-display').innerText = fleetData.trucks.length;

    const ledger = document.getElementById('ledger-stream');
    if (ledger) {
        ledger.innerHTML = fleetData.receipts.slice(0, 5).map(r => `
            <div class="p-6 flex justify-between items-center group hover:bg-white/[0.02]">
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded bg-blue-600/10 text-blue-500 flex items-center justify-center"><i data-lucide="activity" size="14"></i></div>
                    <div><h4 class="text-sm font-black text-white">${r.vendor}</h4><p class="text-[9px] opacity-50 uppercase">${r.category} • ${r.truckId}</p></div>
                </div>
                <h4 class="font-black text-white">$${r.amount.toFixed(2)}</h4>
            </div>
        `).join('');
        lucide.createIcons();
    }
}

// --- 5. SYSTEM INITIALIZATION ---

window.addEventListener('load', () => {
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    
    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    db = getFirestore(app); auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v51-logic';

    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0, 6)}`;
            
            // Proactive Data Sync
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard(); if(document.getElementById('trucks-tab').classList.contains('active')) buildSpreadsheet('trucks');
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), s => {
                fleetData.jobs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                syncCalendarData();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        } else { signInAnonymously(auth); }
    });

    setTimeout(initCalendars, 500);
});

// Modal Logic Exports
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.saveEvent = async () => {
    const val = { title: document.getElementById('ev-title').value, date: document.getElementById('ev-date').value };
    if (user && val.title) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), val);
    window.closeModal();
};
window.initEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if(!t) return;
    activeEditId = id;
    document.getElementById('t-id').value = t.truckId;
    document.getElementById('t-make').value = t.make;
    document.getElementById('t-miles').value = t.miles;
    document.getElementById('t-status').value = t.status;
    document.getElementById('truck-modal').classList.remove('hidden');
};
window.saveTruckUnit = async () => { /* Logic to handle add/update Firestore */ window.closeModal(); };


