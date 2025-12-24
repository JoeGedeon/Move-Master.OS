import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null; // Key for the Edit Engine

// --- 1. COMMAND NAVIGATION (THE SHORTCUT ENGINE) ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Refresh Visuals on entry
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
        
        // Fix Calendar visibility
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); 
        }
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
    activeEditId = null; 
};

// --- 2. TRUCK MODULE (ACCURATE COUNTS & EDITING) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE ACCURATE VITALS
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop').length
    };

    // B. INJECT COUNTER COMMAND BAR
    const counterHtml = `
        <div class="fleet-vitals-bar col-span-full animate-in slide-in-from-top duration-500">
            <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${stats.total}</h4></div>
            <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value">${stats.ready}</h4></div>
            <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${stats.transit}</h4></div>
            <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">In Shop</p><h4 class="vital-value">${stats.shop}</h4></div>
        </div>
    `;

    // C. RENDER INTERACTIVE TRUCK TILES
    const cardsHtml = fleetData.trucks.map(t => {
        let sStyle = "bg-green-500/10 text-green-500 border-green-500/20";
        if(t.status === 'In Transit') sStyle = "bg-blue-500/10 text-blue-500 border-blue-500/20";
        if(t.status === 'Maintenance' || t.status === 'In Shop') sStyle = "bg-red-500/10 text-red-500 border-red-500/20";
        
        return `
        <div class="truck-card group" onclick="window.initEditTruck('${t.id}')">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all"><i data-lucide="truck"></i></div>
                <span class="status-pill ${sStyle}">${t.status}</span>
            </div>
            <h4 class="text-2xl font-black italic uppercase text-white">${t.truckId}</h4>
            <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make} • ${Number(t.miles).toLocaleString()} mi</p>
            <p class="mt-6 text-[9px] font-black text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase italic">Click to Edit Unit</p>
        </div>
        `;
    }).join('');

    grid.innerHTML = counterHtml + cardsHtml;
    lucide.createIcons();
}

window.initEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if (!t) return;
    activeEditId = id; // Track that we are editing
    
    document.getElementById('t-id').value = t.truckId;
    document.getElementById('t-make').value = t.make || '';
    document.getElementById('t-miles').value = t.miles || '';
    document.getElementById('t-status').value = t.status || 'Operational';
    
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
    if (!val.truckId) return;

    // Local-First UI Update
    if (activeEditId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        if (idx !== -1) fleetData.trucks[idx] = { ...val, id: activeEditId };
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    }

    renderTrucks();
    window.closeModal();

    // Cloud Persistence
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

// --- 3. DASHBOARD SHORTCUTS ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    
    const revCard = document.getElementById('total-display');
    if (revCard) {
        revCard.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        // SHORTCUT: Click revenue to go to CRM
        revCard.closest('.balance-card').onclick = () => window.tab('clients');
    }

    const truckStat = document.getElementById('truck-count-display');
    if (truckStat) {
        truckStat.innerText = fleetData.trucks.length;
        // SHORTCUT: Click Truck Stat to go to Trucks Tab
        truckStat.closest('.stat-card').onclick = () => window.tab('trucks');
    }
}

// --- 4. INITIALIZATION ---

window.addEventListener('load', () => {
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
    
    // Connect "Schedule" Buttons
    const schedBtn = document.querySelector('[onclick*="dispatch"]');
    if(schedBtn) schedBtn.onclick = () => document.getElementById('event-modal').classList.remove('hidden');

    lucide.createIcons();
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// Other Renderers (Placeholder for your logic)
function renderLogs() { /* Driver log table logic */ }

