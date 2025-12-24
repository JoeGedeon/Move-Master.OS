import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };

// --- 1. PROACTIVE NAVIGATION ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Force Integrated Calendar to draw
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        
        // RE-CALCULATE ALL INTELLIGENCE
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');

// --- 2. TRUCK INTELLIGENCE HUB (The Counter Logic) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE FLEET VITALS
    const total = fleetData.trucks.length;
    const active = fleetData.trucks.filter(t => t.status === 'Active' || t.status === 'Operational').length;
    const transit = fleetData.trucks.filter(t => t.status === 'In Transit').length;
    const shop = fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop').length;

    // B. BUILD THE INTELLIGENCE COMMAND BAR
    const commandBar = `
        <div class="fleet-intelligence-bar col-span-full">
            <div class="vital-card"><p class="vital-label">Total Fleet</p><h4 class="vital-value">${total}</h4></div>
            <div class="vital-card border-green-500/20"><p class="vital-label text-green-500">Active Units</p><h4 class="vital-value">${active}</h4></div>
            <div class="vital-card border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${transit}</h4></div>
            <div class="vital-card border-red-500/20"><p class="vital-label text-red-500">In Shop</p><h4 class="vital-value">${shop}</h4></div>
        </div>
    `;

    // C. RENDER THE INDIVIDUAL CARDS
    const cards = fleetData.trucks.map(t => `
        <div class="truck-card">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500"><i data-lucide="truck"></i></div>
                <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-blue-600/10 text-blue-500">${t.status}</span>
            </div>
            <h4 class="text-2xl font-black italic uppercase">${t.truckId}</h4>
            <p class="text-[10px] font-bold text-slate-500 uppercase mt-1">${t.make} • ${Number(t.miles).toLocaleString()} mi</p>
        </div>
    `).join('');

    // Inject everything into your grid
    grid.innerHTML = commandBar + cards;
    lucide.createIcons();
}

// --- 3. PERSISTENT SAVING (LOCAL FIRST) ---

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value, // Maps to Active, In Transit, or Maintenance
        timestamp: Date.now()
    };
    if (!val.truckId) return;

    // Instant local memory update (Shows up on screen immediately)
    fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    renderTrucks();
    window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

// --- 4. RENDERERS & BOOT ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const display = document.getElementById('total-display');
    if (display) display.innerText = `$${bal.toLocaleString()}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if(!rows) return;
    rows.innerHTML = fleetData.driverLogs.map(l => `
        <tr><td class="p-8 text-xs font-mono text-slate-400">${l.date}</td><td class="p-8 text-xs font-black uppercase">${l.driver}</td><td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-8 text-xs font-black">$0.00</td></tr>
    `).join('');
}

window.addEventListener('load', () => {
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', 
            height: '100%',
            dateClick: (i) => { document.getElementById('ev-date').value = i.dateStr; document.getElementById('event-modal').classList.remove('hidden'); }
        });
        dashCal.render();
    }
    lucide.createIcons();
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

