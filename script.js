import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };

// --- 1. CORE NAVIGATION & AUTO-AUDIT ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Refresh Visual Modules
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `TERMINAL_${id.toUpperCase()}`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');

// --- 2. THE TRUCK INTELLIGENCE HUB (The Counter Logic) ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE FLEET VITALS
    const stats = {
        total: fleetData.trucks.length,
        active: fleetData.trucks.filter(t => t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'In Shop' || t.status === 'Down').length
    };

    // B. BUILD THE COMMAND BAR (INJECTED DYNAMICALLY)
    const commandBarHtml = `
        <div class="col-span-full mb-10 grid grid-cols-2 md:grid-cols-4 gap-4 p-2 bg-white/5 rounded-[2.5rem] border border-white/5 shadow-2xl">
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-white/5">
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Fleet</p>
                <h4 class="text-4xl font-black text-white mt-1">${stats.total}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-green-500/20">
                <p class="text-[9px] font-black text-green-500 uppercase tracking-widest">Active Units</p>
                <h4 class="text-4xl font-black text-green-500 mt-1">${stats.active}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-blue-500/20">
                <p class="text-[9px] font-black text-blue-500 uppercase tracking-widest">In Transit</p>
                <h4 class="text-4xl font-black text-blue-500 mt-1">${stats.transit}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-red-500/20">
                <p class="text-[9px] font-black text-red-500 uppercase tracking-widest">In Maintenance</p>
                <h4 class="text-4xl font-black text-red-500 mt-1">${stats.shop}</h4>
            </div>
        </div>
    `;

    // C. RENDER THE INDIVIDUAL TRUCK CARDS
    const truckCardsHtml = fleetData.trucks.map(t => {
        let statusStyle = "text-green-500 bg-green-500/10 border-green-500/20";
        if(t.status === 'In Transit') statusStyle = "text-blue-400 bg-blue-400/10 border-blue-400/20";
        if(t.status === 'In Shop' || t.status === 'Down') statusStyle = "text-red-500 bg-red-500/10 border-red-500/20";

        return `
            <div class="truck-card group">
                <div class="flex justify-between items-start mb-6">
                    <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                        <i data-lucide="truck" size="20"></i>
                    </div>
                    <span class="px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${statusStyle}">
                        ${t.status}
                    </span>
                </div>
                <h4 class="text-2xl font-black italic tracking-tighter text-white uppercase">${t.truckId}</h4>
                <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make || 'Freightliner'} • ${Number(t.miles).toLocaleString()} mi</p>
                
                <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                    <p class="text-[9px] font-black text-slate-600 uppercase tracking-widest">Operational Ready</p>
                    <button onclick="window.delTruck('${t.id}')" class="p-2 text-slate-800 hover:text-red-500 transition-colors">
                        <i data-lucide="trash-2" size="14"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Inject everything into your existing trucks-grid
    grid.innerHTML = commandBarHtml + truckCardsHtml;
    
    // Update Dashboard counts too
    const dashCount = document.getElementById('truck-count-display');
    if(dashCount) dashCount.innerText = stats.total;

    lucide.createIcons();
}

// --- 3. PERSISTENCE ENGINE ---

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value, // This pulls from your modal dropdown
        timestamp: Date.now()
    };
    if (!val.truckId) return;

    // Instant local memory update
    fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    renderTrucks();
    window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
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

