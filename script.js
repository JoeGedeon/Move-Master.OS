
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null; // KEY FOR EDITING

// --- 1. COMMAND NAVIGATION ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Intelligence Triggers
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
        
        // FullCalendar Fix
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 100); }
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null; // Clear edit state
};

window.openTruckModal = () => {
    activeEditId = null; // Reset for new entry
    const form = document.querySelectorAll('#truck-modal input, #truck-modal select');
    form.forEach(i => i.value = ''); // Clear form
    document.getElementById('truck-modal').classList.remove('hidden');
};

// --- 2. THE TRUCK INTELLIGENCE HUB (ACCURATE COUNTER & EDIT) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE ACCURATE COUNTS
    const counts = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'Out of Service' || t.status === 'In Shop').length
    };

    // B. INJECT COUNTER BAR (FORCE INJECTION)
    const counterHtml = `
        <div class="fleet-vitals-bar col-span-full animate-in slide-in-from-top duration-500">
            <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${counts.total}</h4></div>
            <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value">${counts.ready}</h4></div>
            <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${counts.transit}</h4></div>
            <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">In Shop</p><h4 class="vital-value">${counts.shop}</h4></div>
        </div>
    `;

    // C. RENDER TILES WITH EDIT CAPABILITY
    const cardsHtml = fleetData.trucks.map(t => {
        let statusCol = "bg-green-500/10 text-green-500";
        if(t.status === 'In Transit') statusCol = "bg-blue-500/10 text-blue-500";
        if(t.status === 'Maintenance' || t.status === 'Out of Service' || t.status === 'In Shop') statusCol = "bg-red-500/10 text-red-500";
        
        return `
        <div class="truck-card group" onclick="window.initEditTruck('${t.id}')">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><i data-lucide="truck"></i></div>
                <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${statusCol}">${t.status}</span>
            </div>
            <h4 class="text-2xl font-black italic uppercase">${t.truckId}</h4>
            <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make} • ${Number(t.miles).toLocaleString()} mi</p>
            <p class="text-[9px] font-black text-blue-500 mt-6 opacity-0 group-hover:opacity-100 transition-opacity uppercase">Click to Manage Unit</p>
        </div>
        `;
    }).join('');

    grid.innerHTML = counterHtml + cardsHtml;
    lucide.createIcons();
}

// --- 3. EDIT & SAVE ENGINE ---

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

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value,
        timestamp: Date.now()
    };
    if (!val.truckId) return alert("Required: Unit ID");

    // A. Update Local UI Immediately
    if (activeEditId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        fleetData.trucks[idx] = { ...val, id: activeEditId };
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    }

    renderTrucks();
    window.closeModal();

    // B. Cloud Sync
    if (user && db) {
        try {
            if (activeEditId && !activeEditId.startsWith('local')) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
            }
        } catch(e) {}
    }
};

// --- 4. RENDERERS & INITIALIZATION ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const disp = document.getElementById('total-display');
    if(disp) disp.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
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
            dateClick: (i) => { 
                const evModal = document.getElementById('event-modal');
                if(evModal) {
                    document.getElementById('ev-date').value = i.dateStr;
                    evModal.classList.remove('hidden');
                }
            }
        });
        dashCal.render();
    }
    lucide.createIcons();
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

