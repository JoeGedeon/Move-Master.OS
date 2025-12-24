import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

let auth, db, user, appId, dashCal;
let fleetData = { trucks: [], receipts: [], jobs: [] };
let activeEditId = null;

// --- 1. NAVIGATION ENGINE ---
window.tab = (id) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        // FORCE CALENDAR REFRESH
        if (id === 'dashboard' && dashCal) {
            setTimeout(() => { dashCal.updateSize(); dashCal.render(); }, 100);
        }
        if (id === 'trucks') renderTrucksPage();
        if (id === 'dashboard') renderDashboard();
    }
    document.getElementById('tab-title').innerText = id.toUpperCase();
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. TRUCK PAGE (COUNTERS & SPREADSHEET) ---
function renderTrucksPage() {
    const vitals = document.getElementById('fleet-vitals-container');
    const table = document.getElementById('trucks-table-container');
    if (!vitals || !table) return;

    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance').length
    };

    // Inject 4-Column Counter
    vitals.innerHTML = `
        <div class="bg-white/5 p-6 rounded-3xl text-center"><p class="text-[9px] font-black uppercase text-slate-500">Fleet Size</p><h4 class="text-3xl font-black">${stats.total}</h4></div>
        <div class="bg-green-500/5 p-6 rounded-3xl text-center border border-green-500/10"><p class="text-[9px] font-black uppercase text-green-500">Ready</p><h4 class="text-3xl font-black text-green-500">${stats.ready}</h4></div>
        <div class="bg-blue-500/5 p-6 rounded-3xl text-center border border-blue-500/10"><p class="text-[9px] font-black uppercase text-blue-500">Transit</p><h4 class="text-3xl font-black text-blue-500">${stats.transit}</h4></div>
        <div class="bg-red-500/5 p-6 rounded-3xl text-center border border-red-500/10"><p class="text-[9px] font-black uppercase text-red-500">Shop</p><h4 class="text-3xl font-black text-red-500">${stats.shop}</h4></div>
    `;

    // Inject Spreadsheet
    table.innerHTML = `
        <table class="fleet-table">
            <thead><tr><th>Unit ID</th><th>Model</th><th>Miles</th><th>Status</th></tr></thead>
            <tbody>
                ${fleetData.trucks.map(t => `<tr onclick="window.initEditTruck('${t.id}')">
                    <td class="font-black italic uppercase text-blue-500">${t.truckId}</td>
                    <td>${t.make}</td>
                    <td class="font-mono text-slate-400">${Number(t.miles).toLocaleString()}</td>
                    <td><span class="text-[10px] font-black uppercase">${t.status}</span></td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
    lucide.createIcons();
}

window.initEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if (!t) return;
    activeEditId = id;
    document.getElementById('t-id').value = t.truckId;
    document.getElementById('t-make').value = t.make;
    document.getElementById('t-miles').value = t.miles;
    document.getElementById('t-status').value = t.status;
    document.getElementById('truck-modal').classList.remove('hidden');
};

// --- 3. DASHBOARD SHORTCUTS ---
function renderDashboard() {
    const revTile = document.getElementById('dash-revenue-tile');
    const truckTile = document.getElementById('dash-trucks-tile');
    
    if (revTile) revTile.onclick = () => window.tab('clients');
    if (truckTile) truckTile.onclick = () => window.tab('trucks');
    
    document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
}

// --- 4. BOOT ---
window.addEventListener('load', () => {
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', 
            height: '100%',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }
        });
        dashCal.render();
    }
    lucide.createIcons();
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    initSync();
});

async function initSync() {
    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    db = getFirestore(app); auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v44';
    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTrucksPage(); renderDashboard();
            });
        } else { signInAnonymously(auth); }
    });
}

// Modal Global Functions
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.saveTruckUnit = async () => { /* Add logic */ };
window.saveEvent = async () => { /* Add logic */ };

