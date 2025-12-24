import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditTruckId = null;

// --- 1. PROACTIVE NAVIGATION (TAB SYSTEM) ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Refresh specific data visuals
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
        
        // FullCalendar Refresh Logic
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); 
        }
    }
    
    // Sidebar Active State Sync
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditTruckId = null; 
};

// --- 2. TRUCK MODULE (ACCURATE COUNTS & EDITING) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE DESCRIPTIVE FLEET VITALS
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop').length
    };

    // B. INJECT THE COMMAND BAR (The actual "Counter" view you need)
    const counterHtml = `
        <div class="fleet-vitals-bar col-span-full">
            <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${stats.total}</h4></div>
            <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value">${stats.ready}</h4></div>
            <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${stats.transit}</h4></div>
            <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">In Maintenance</p><h4 class="vital-value">${stats.shop}</h4></div>
        </div>
    `;

    // C. RENDER INTERACTIVE TILES WITH EDIT TRIGGERS
    const cardsHtml = fleetData.trucks.map(t => {
        let sCol = "bg-green-500/10 text-green-500";
        if(t.status === 'In Transit') sCol = "bg-blue-500/10 text-blue-500";
        if(t.status === 'Maintenance' || t.status === 'In Shop') sCol = "bg-red-500/10 text-red-500";
        
        return `
        <div class="truck-card group" onclick="window.initEditTruck('${t.id}')">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><i data-lucide="truck"></i></div>
                <span class="status-pill ${sCol}">${t.status}</span>
            </div>
            <h4 class="text-2xl font-black italic uppercase">${t.truckId}</h4>
            <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make} • ${Number(t.miles).toLocaleString()} mi</p>
            <p class="mt-6 text-[9px] font-black text-blue-500 uppercase opacity-0 group-hover:opacity-100 transition-opacity italic">Manage Unit Data</p>
        </div>
        `;
    }).join('');

    grid.innerHTML = counterHtml + cardsHtml;
    lucide.createIcons();
}

window.initEditTruck = (id) => {
    const truck = fleetData.trucks.find(x => x.id === id);
    if (!truck) return;
    activeEditTruckId = id;
    
    // Fill Modal Inputs
    document.getElementById('t-id').value = truck.truckId;
    document.getElementById('t-make').value = truck.make || '';
    document.getElementById('t-miles').value = truck.miles || '';
    document.getElementById('t-status').value = truck.status || 'Operational';
    
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
    if(!val.truckId) return;

    if (activeEditTruckId) {
        // UPDATE Existing
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditTruckId);
        fleetData.trucks[idx] = { ...val, id: activeEditTruckId };
        if (user && db && !activeEditTruckId.startsWith('local')) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditTruckId), { ...val, timestamp: Timestamp.now() });
        }
    } else {
        // ADD New
        const newId = "local_" + Date.now();
        fleetData.trucks.push({ ...val, id: newId });
        if (user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }

    renderTrucks();
    window.closeModal();
};

// --- 3. DASHBOARD SHORTCUTS & VITALS ---

function renderDashboard() {
    // A. Revenue Display
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const totalEl = document.getElementById('total-display');
    if (totalEl) {
        totalEl.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        // SHORTCUT: Click balance to see ledger/CRM
        totalEl.closest('.balance-card').onclick = () => window.tab('clients');
    }

    // B. Dashboard Truck Count (Click to navigate)
    const countEl = document.getElementById('truck-count-display');
    if (countEl) {
        countEl.innerText = fleetData.trucks.length;
        countEl.closest('.stat-card').onclick = () => window.tab('trucks');
    }
}

// --- 4. INITIALIZATION ---

window.addEventListener('load', () => {
    // Connect Dashboard Calendar
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', height: '100%',
            dateClick: (i) => {
                document.getElementById('ev-date').value = i.dateStr;
                document.getElementById('event-modal').classList.remove('hidden');
            }
        });
        dashCal.render();
    }

    lucide.createIcons();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if(el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);

    // Boot Firebase Link
    initCommandCenter();
});

async function initCommandCenter() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v36-master';
    
    onAuthStateChanged(auth, u => {
        if(u){
            user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTrucks(); renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        }
    });
}

