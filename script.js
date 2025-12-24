import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeTruckId = null; // Used for editing

// --- 1. CORE NAVIGATION & FORCE REFRESH ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        
        // Dynamic Intelligence Triggers
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeTruckId = null; // Clear edit state
};

// --- 2. THE TRUCK INTELLIGENCE ENGINE (ACCCURATE COUNTS) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    const counterBar = document.getElementById('fleet-counters');
    if (!grid || !counterBar) return;

    // A. CALCULATE FLEET VITALS (STRICT MATCHING)
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'Out of Service').length
    };

    // B. INJECT COMMAND BAR
    counterBar.innerHTML = `
        <div class="vital-tile"><p class="vital-label">Total Fleet</p><h4 class="vital-value">${stats.total}</h4></div>
        <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value">${stats.ready}</h4></div>
        <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${stats.transit}</h4></div>
        <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">In Shop</p><h4 class="vital-value">${stats.shop}</h4></div>
    `;

    // C. RENDER INTERACTIVE TRUCK TILES (EDITABLE)
    grid.innerHTML = fleetData.trucks.map(t => {
        let statusCol = "bg-green-500/10 text-green-500";
        if(t.status === 'In Transit') statusCol = "bg-blue-500/10 text-blue-500";
        if(t.status === 'Maintenance' || t.status === 'Out of Service') statusCol = "bg-red-500/10 text-red-500";
        
        return `
        <div class="truck-card group" onclick="window.editTruck('${t.id}')">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><i data-lucide="truck"></i></div>
                <span class="status-pill ${statusCol}">${t.status}</span>
            </div>
            <h4 class="text-2xl font-black italic uppercase">${t.truckId}</h4>
            <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make} • ${Number(t.miles).toLocaleString()} mi</p>
            <div class="mt-6 pt-4 border-t border-white/5 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <p class="text-[9px] font-black text-blue-500 uppercase">Click to Edit Unit</p>
                <i data-lucide="edit-3" size="14" class="text-slate-600"></i>
            </div>
        </div>
        `;
    }).join('');
    lucide.createIcons();
}

// --- 3. EDIT & SAVE LOGIC (HYBRID) ---

window.editTruck = (id) => {
    const truck = fleetData.trucks.find(t => t.id === id);
    if (!truck) return;

    activeTruckId = id;
    document.getElementById('t-id').value = truck.truckId;
    document.getElementById('t-make').value = truck.make;
    document.getElementById('t-miles').value = truck.miles;
    document.getElementById('t-status').value = truck.status;
    
    document.getElementById('truck-modal').classList.remove('hidden');
};

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value,
        timestamp: Date.now()
    };

    if (!val.truckId) return alert("Unit ID Required");

    // A. Update Local UI (Instant Feedback)
    if (activeTruckId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeTruckId);
        fleetData.trucks[idx] = { ...val, id: activeTruckId };
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    }

    renderTrucks();
    window.closeModal();

    // B. Persist to Cloud
    if (user && db) {
        try {
            if (activeTruckId && !activeTruckId.startsWith('local')) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeTruckId), { ...val, timestamp: Timestamp.now() });
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
            }
        } catch(e) { console.error("Cloud update delayed."); }
    }
};

// --- 4. DATA RENDERERS ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const disp = document.getElementById('total-display');
    if(disp) disp.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits:2})}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if(!rows) return;
    rows.innerHTML = fleetData.driverLogs.map(l => `
        <tr><td class="p-8 text-xs font-mono text-slate-400">${l.date}</td><td class="p-8 text-xs font-black uppercase">${l.driver}</td><td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-8 text-xs font-black">$0.00</td></tr>
    `).join('');
}

// --- 5. INITIALIZATION ---

window.addEventListener('load', () => {
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { initialView: 'dayGridMonth', height: '100%' });
        dashCal.render();
    }
    lucide.createIcons();
    setInterval(() => {
        const cl = document.getElementById('live-clock');
        if(cl) cl.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

