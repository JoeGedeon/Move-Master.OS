import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };

// --- 1. NAVIGATION & AUTO-RENDER ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        
        // Intelligence Triggers
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_MISSION_CONTROL`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
window.openTruckModal = () => {
    // Ensure "In Transit" is an option in your HTML select if possible, 
    // otherwise the JS will handle the data entry.
    document.getElementById('truck-modal').classList.remove('hidden');
};

// --- 2. TRUCK INTELLIGENCE ENGINE ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // Calculate Fleet Vitals
    const total = fleetData.trucks.length;
    const active = fleetData.trucks.filter(t => t.status === 'Active').length;
    const transit = fleetData.trucks.filter(t => t.status === 'In Transit').length;
    const shop = fleetData.trucks.filter(t => t.status === 'In Shop' || t.status === 'Down').length;

    // Create Intelligence Header
    const summaryHtml = `
        <div class="col-span-full mb-8 grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div class="bg-white/5 border border-white/5 p-6 rounded-3xl text-center">
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Fleet</p>
                <h4 class="text-3xl font-black text-white mt-1">${total}</h4>
            </div>
            <div class="bg-green-500/5 border border-green-500/10 p-6 rounded-3xl text-center">
                <p class="text-[9px] font-black text-green-500 uppercase tracking-widest text-opacity-70">Active Units</p>
                <h4 class="text-3xl font-black text-green-500 mt-1">${active}</h4>
            </div>
            <div class="bg-blue-500/5 border border-blue-500/10 p-6 rounded-3xl text-center">
                <p class="text-[9px] font-black text-blue-500 uppercase tracking-widest text-opacity-70">In Transit</p>
                <h4 class="text-3xl font-black text-blue-500 mt-1">${transit}</h4>
            </div>
            <div class="bg-red-500/5 border border-red-500/10 p-6 rounded-3xl text-center">
                <p class="text-[9px] font-black text-red-500 uppercase tracking-widest text-opacity-70">In Maintenance</p>
                <h4 class="text-3xl font-black text-red-500 mt-1">${shop}</h4>
            </div>
        </div>
    `;

    // Render Grid Items
    const truckCardsHtml = fleetData.trucks.map(t => {
        let statusColor = "text-green-500 bg-green-500/10";
        if(t.status === 'In Transit') statusColor = "text-blue-400 bg-blue-500/10";
        if(t.status === 'In Shop' || t.status === 'Down') statusColor = "text-red-500 bg-red-500/10";

        return `
            <div class="truck-card group animate-in zoom-in-95 duration-300">
                <div class="flex justify-between items-start mb-6">
                    <div class="p-3 bg-white/5 rounded-2xl group-hover:bg-blue-600 transition-all duration-500">
                        <i data-lucide="truck" size="20"></i>
                    </div>
                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${statusColor}">
                        ${t.status}
                    </span>
                </div>
                <h4 class="text-2xl font-black italic tracking-tighter text-white uppercase">${t.truckId}</h4>
                <p class="text-[10px] font-bold text-slate-500 uppercase mt-1">${t.make || 'Generic Unit'} • ${Number(t.miles).toLocaleString()} mi</p>
                
                <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                    <div>
                        <p class="text-[9px] font-black text-slate-500 uppercase">Operational Status</p>
                        <p class="text-xs font-bold text-slate-300">${t.status === 'Active' ? 'Verified Ready' : (t.status === 'In Transit' ? 'On Assignment' : 'Service Required')}</p>
                    </div>
                    <button onclick="window.delTruck('${t.id}')" class="p-2 text-slate-800 hover:text-red-500 transition-colors">
                        <i data-lucide="trash-2" size="14"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = summaryHtml + truckCardsHtml;
    lucide.createIcons();
}

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value, // Matches the new status options
        timestamp: Date.now()
    };
    if (!val.truckId) return;

    // Instant local push
    fleetData.trucks.push({ ...val, id: "cl_" + Date.now() });
    renderTrucks();
    window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

// --- 3. DASHBOARD & MISC ---
function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
}

window.delTruck = async (id) => {
    if(confirm("Purge unit record?")) {
        fleetData.trucks = fleetData.trucks.filter(t => t.id !== id);
        renderTrucks();
        // Cloud delete would happen here
    }
};

// --- 4. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    lucide.createIcons();
    setInterval(() => {
        const cl = document.getElementById('live-clock');
        if(cl) cl.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

