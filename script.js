import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null;

// --- 1. THE MASTER CONTROLLER: NAVIGATION & PAGE SETUP ---
window.tab = (id) => {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    // Show Target
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // AUTO-GENERATE PAGE CONTENT
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') setupTrucksPage();
        if(id === 'clients') setupCRMPage();
        if(id === 'dispatch') setupDispatchPage();
        
        // FullCalendar Visibility Hack
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
    }
    
    // Active Sidebar State
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS_MASTER`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. TRUCKS PAGE: SPREADSHEET & EDIT LOGIC ---

function setupTrucksPage() {
    const container = document.getElementById('trucks-tab');
    if (!container) return;

    // Calculate Counts
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop').length
    };

    container.innerHTML = `
        <div class="p-10">
            <div class="flex justify-between items-center mb-8">
                <h3 class="text-3xl font-black uppercase italic italic">Unit Registry</h3>
                <button onclick="window.openTruckModal()" class="bg-blue-600 px-6 py-3 rounded-xl font-black text-[10px] uppercase">Add Unit</button>
            </div>
            
            <div class="vitals-grid">
                <div class="vital-box"><span class="vital-tag">Total Fleet</span><span class="vital-num">${stats.total}</span></div>
                <div class="vital-box border-green-500/20"><span class="vital-tag text-green-500">Ready</span><span class="vital-num">${stats.ready}</span></div>
                <div class="vital-box border-blue-500/20"><span class="vital-tag text-blue-500">Transit</span><span class="vital-num">${stats.transit}</span></div>
                <div class="vital-box border-red-500/20"><span class="vital-tag text-red-500">In Shop</span><span class="vital-num">${stats.shop}</span></div>
            </div>

            <div class="ledger-container">
                <table class="fleet-table">
                    <thead><tr><th>Unit ID</th><th>Model</th><th>Mileage</th><th>Status</th><th>Edit</th></tr></thead>
                    <tbody>
                        ${fleetData.trucks.map(t => `
                            <tr onclick="window.initEditTruck('${t.id}')">
                                <td class="font-black text-white italic uppercase">${t.truckId}</td>
                                <td>${t.make}</td>
                                <td class="font-mono text-slate-500">${Number(t.miles).toLocaleString()}</td>
                                <td><span class="st-pill operational">${t.status}</span></td>
                                <td class="text-blue-500 font-black text-[10px]">EDIT</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    lucide.createIcons();
}

window.openTruckModal = () => {
    activeEditId = null;
    document.querySelectorAll('#truck-modal input').forEach(i => i.value = '');
    document.getElementById('truck-modal').classList.remove('hidden');
};

window.initEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if(!t) return;
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

    if (activeEditId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        fleetData.trucks[idx] = { ...val, id: activeEditId };
        if(user && db && !activeEditId.startsWith('local')) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
        }
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
        if(user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }
    setupTrucksPage();
    window.closeModal();
};

// --- 3. DASHBOARD SHORTCUTS ---

function renderDashboard() {
    // Clickable Stats
    const revCard = document.querySelector('.balance-card');
    if(revCard) revCard.onclick = () => window.tab('clients');

    const truckCard = document.querySelector('.stat-card');
    if(truckCard) {
        truckCard.onclick = () => window.tab('trucks');
        const countDisplay = truckCard.querySelector('h3');
        if(countDisplay) countDisplay.innerText = fleetData.trucks.length;
    }

    // Button above calendar
    const schedHeader = document.querySelector('#dashboard-tab h3');
    if(schedHeader) {
        schedHeader.parentElement.innerHTML = `
            <h3 class="text-xl font-black uppercase italic tracking-tighter">Operational Schedule</h3>
            <button onclick="window.tab('dispatch')" class="bg-blue-600 px-4 py-2 rounded-lg text-[9px] font-black uppercase">Schedule Load</button>
        `;
    }
}

// --- 4. INITIALIZATION ---

window.addEventListener('load', () => {
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { initialView: 'dayGridMonth', height: '100%' });
        dashCal.render();
    }
    setInterval(() => {
        const cl = document.getElementById('live-clock');
        if(cl) cl.innerText = new Date().toLocaleTimeString();
    }, 1000);
    initSync();
});

async function initSync() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v40';
    
    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                if(document.getElementById('trucks-tab').classList.contains('active')) setupTrucksPage();
                renderDashboard();
            });
        }
    });
}

