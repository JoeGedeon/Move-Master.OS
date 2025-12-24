import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null; // CRITICAL: This tracks if we are ADDING or EDITING

// --- 1. CORE NAVIGATION LOGIC ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Logical Trigger: Refresh data visuals whenever a tab is opened
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucks();
        if(id === 'driverlog') renderLogs();
        
        // FullCalendar Fix: Re-renders calendar to prevent invisible/collapsed grids
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); 
        }
    }
    
    // UI Feedback: Set active button style
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null; // Reset edit state when closing
};

// --- 2. TRUCK INTELLIGENCE & EDITING LOGIC ---

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;

    // A. CALCULATE ACCURATE COUNTS
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop' || t.status === 'Out of Service').length
    };

    // B. GENERATE COMMAND BAR HTML (The descriptive view you requested)
    const counterBarHtml = `
        <div class="col-span-full mb-10 grid grid-cols-2 md:grid-cols-4 gap-4 p-2 bg-white/5 rounded-[2.5rem] border border-white/5">
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center">
                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fleet Size</p>
                <h4 class="text-4xl font-black text-white mt-1">${stats.total}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-green-500/10">
                <p class="text-[9px] font-black text-green-500 uppercase tracking-widest">Active/Ready</p>
                <h4 class="text-4xl font-black text-green-500 mt-1">${stats.ready}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-blue-500/10">
                <p class="text-[9px] font-black text-blue-500 uppercase tracking-widest">In Transit</p>
                <h4 class="text-4xl font-black text-blue-500 mt-1">${stats.transit}</h4>
            </div>
            <div class="bg-[#111827] p-8 rounded-[2rem] text-center border border-red-500/10">
                <p class="text-[9px] font-black text-red-500 uppercase tracking-widest">Maintenance</p>
                <h4 class="text-4xl font-black text-red-500 mt-1">${stats.shop}</h4>
            </div>
        </div>
    `;

    // C. GENERATE EDITABLE TRUCK TILES
    const cardsHtml = fleetData.trucks.map(t => {
        let statusStyle = "text-green-500 bg-green-500/10";
        if(t.status === 'In Transit') statusStyle = "text-blue-400 bg-blue-500/10";
        if(t.status === 'Maintenance' || t.status === 'In Shop') statusStyle = "text-red-500 bg-red-500/10";

        return `
            <div class="truck-card group bg-[#111827] border border-white/5 rounded-[2.5rem] p-10 cursor-pointer hover:border-blue-500 transition-all" 
                 onclick="window.startTruckEdit('${t.id}')">
                <div class="flex justify-between items-start mb-6">
                    <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <i data-lucide="truck" size="20"></i>
                    </div>
                    <span class="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${statusStyle}">
                        ${t.status}
                    </span>
                </div>
                <h4 class="text-2xl font-black italic uppercase text-white">${t.truckId}</h4>
                <p class="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">${t.make || 'Freightliner'} • ${Number(t.miles).toLocaleString()} mi</p>
                <div class="mt-8 pt-4 border-t border-white/5 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <p class="text-[9px] font-black text-blue-500 uppercase italic">Manage/Edit Unit</p>
                    <i data-lucide="edit-3" size="12" class="text-blue-500"></i>
                </div>
            </div>
        `;
    }).join('');

    // D. INJECT TO GRID
    grid.innerHTML = counterBarHtml + cardsHtml;
    lucide.createIcons();
}

// Logic to load existing data into the modal for editing
window.startTruckEdit = (id) => {
    const t = fleetData.trucks.find(item => item.id === id);
    if (!t) return;

    activeEditId = id; // Lock this ID for the save function
    
    // Fill the HTML inputs with current data
    document.getElementById('t-id').value = t.truckId;
    document.getElementById('t-make').value = t.make || '';
    document.getElementById('t-miles').value = t.miles || '';
    document.getElementById('t-status').value = t.status;
    
    // Show the modal
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

    // A. INSTANT UI FEEDBACK (Local Mode)
    if (activeEditId) {
        // Find and replace existing truck in local memory
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        if (idx !== -1) fleetData.trucks[idx] = { ...val, id: activeEditId };
    } else {
        // Add as new truck
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    }

    renderTrucks();
    window.closeModal();

    // B. BACKGROUND CLOUD SYNC (Rule 3)
    if (user && db) {
        try {
            if (activeEditId && !activeEditId.startsWith('local')) {
                // Update existing Firestore doc
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
            } else {
                // Add new Firestore doc
                await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
            }
        } catch(e) { console.error("Syncing logic paused."); }
    }
};

// --- 3. DASHBOARD & LEDGER LOGIC ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const totalEl = document.getElementById('total-display');
    if (totalEl) totalEl.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if(!rows) return;
    rows.innerHTML = fleetData.driverLogs.map(l => `
        <tr class="border-b border-white/5">
            <td class="p-8 text-xs font-mono text-slate-400">${l.date}</td>
            <td class="p-8 text-xs font-black uppercase text-white">${l.driver}</td>
            <td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td>
            <td class="p-8 text-xs font-black text-green-500">$0.00</td>
        </tr>
    `).join('');
}

// --- 4. SYSTEM INITIALIZATION ---

window.addEventListener('DOMContentLoaded', () => {
    // Initialize Integrated Calendar
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', 
            height: '100%',
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

    // Boot Command Center (Cloud Sync Rule 1 & 3)
    initTerminalLink();
});

async function initTerminalLink() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v34-logic';

    onAuthStateChanged(auth, async (u) => {
        if (u) {
            user = u;
            document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0, 6)}`;
            
            // Start Proactive Syncing
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTrucks();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        } else {
            await signInAnonymously(auth);
        }
    });
}

