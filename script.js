 import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { trucks: [], jobs: [], receipts: [] };
let activeEditId = null;

// --- 1. THE NAVIGATION BRAIN (Fixes Scroll & Rendering) ---
window.tab = (id) => {
    // Hide all
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Show selected
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        // LIGHT UP BUTTON
        const btn = document.querySelector(`[data-tab="${id}"]`);
        if (btn) btn.classList.add('active');

        // CALENDAR REFRESH (Crucial for visibility)
        if (id === 'dashboard' && dashCal) {
            setTimeout(() => {
                dashCal.updateSize();
                dashCal.render();
            }, 100);
        }

        // Module Refresh
        if (id === 'trucks') renderTrucksModule();
        if (id === 'dashboard') renderDashboardModule();
    }
    
    document.getElementById('tab-title').innerText = id.toUpperCase();
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');

// --- 2. TRUCK MODULE (SPREADSHEET & COUNTERS) ---

function renderTrucksModule() {
    const vitals = document.getElementById('trucks-vitals-injection');
    const table = document.getElementById('trucks-table-injection');
    if (!vitals || !table) return;

    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance').length
    };

    vitals.innerHTML = `
        <div class="vital-card"><p class="tile-label">Fleet Size</p><h3>${stats.total}</h3></div>
        <div class="vital-card"><p class="tile-label text-green-500">Ready</p><h3>${stats.ready}</h3></div>
        <div class="vital-card"><p class="tile-label text-blue-500">Transit</p><h3>${stats.transit}</h3></div>
        <div class="vital-card"><p class="tile-label text-red-500">Maintenance</p><h3>${stats.shop}</h3></div>
    `;

    table.innerHTML = `
        <table class="w-full text-left border-collapse">
            <thead class="bg-white/5 uppercase text-[10px] font-black">
                <tr><th class="p-4">Unit ID</th><th class="p-4">Status</th><th class="p-4">Mileage</th></tr>
            </thead>
            <tbody>
                ${fleetData.trucks.map(t => `<tr class="border-b border-white/5 hover:bg-white/5">
                    <td class="p-4 font-black text-blue-500">${t.truckId}</td>
                    <td class="p-4">${t.status}</td>
                    <td class="p-4">${Number(t.miles).toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
}

// --- 3. DASHBOARD MODULE ---
function renderDashboardModule() {
    document.getElementById('dash-truck-count').innerText = fleetData.trucks.length;
}

// --- 4. BOOTUP ---
window.addEventListener('DOMContentLoaded', () => {
    // Initialize Calendar (Google-style)
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, {
            initialView: 'dayGridMonth',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
            height: '100%',
            events: fleetData.jobs
        });
        dashCal.render();
    }

    lucide.createIcons();
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    
    // Connect Firebase
    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v1';

    onAuthStateChanged(auth, u => {
        if(u) {
            user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => d.data());
                renderDashboardModule();
                renderTrucksModule();
            });
        } else {
            signInAnonymously(auth);
        }
    });
});

window.saveTruckUnit = async () => {
    const val = { truckId: document.getElementById('t-id').value, miles: document.getElementById('t-miles').value, status: document.getElementById('t-status').value };
    if (user) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), val);
    window.closeModal();
};

