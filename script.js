import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null;

// --- 1. NAVIGATION & AUTO-BUILD ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Logical Triggers
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTruckSpreadsheet();
        if(id === 'clients') renderClientSpreadsheet();

        // CALENDAR REFRESH (FullCalendar fix for hidden tabs)
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); 
        }
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS_MODE`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. TRUCK SPREADSHEET & COUNTER LOGIC ---

function renderTruckSpreadsheet() {
    const vitals = document.getElementById('fleet-vitals-bar');
    const container = document.getElementById('trucks-spreadsheet-container');
    if (!vitals || !container) return;

    // Calculate Counts
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance').length
    };

    // Build Vital Tiles (The Descriptive View)
    vitals.innerHTML = `
        <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${stats.total}</h4></div>
        <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready</p><h4 class="vital-value text-green-500">${stats.ready}</h4></div>
        <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value text-blue-500">${stats.transit}</h4></div>
        <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">Maintenance</p><h4 class="vital-value text-red-500">${stats.shop}</h4></div>
    `;

    // Build Table
    container.innerHTML = `
        <table class="fleet-table">
            <thead><tr><th>Unit ID</th><th>Model</th><th>Mileage</th><th>Status</th><th>Edit</th></tr></thead>
            <tbody>
                ${fleetData.trucks.map(t => `
                    <tr onclick="window.initEditTruck('${t.id}')">
                        <td class="font-black text-white italic uppercase">${t.truckId}</td>
                        <td class="text-slate-500">${t.make}</td>
                        <td class="font-mono">${Number(t.miles).toLocaleString()}</td>
                        <td><span class="text-xs font-black uppercase">${t.status}</span></td>
                        <td class="text-blue-500 font-black text-[10px] uppercase">Click to Manage</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    lucide.createIcons();
}

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
    if (activeEditId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        fleetData.trucks[idx] = { ...val, id: activeEditId };
        if(user && db && !activeEditId.startsWith('local')) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
        if(user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }
    renderTruckSpreadsheet(); window.closeModal();
};

// --- 3. DASHBOARD INTERACTIVITY ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    
    // Revenue Shortcut
    const revEl = document.getElementById('total-display');
    if (revEl) {
        revEl.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        revEl.closest('.balance-card').onclick = () => window.tab('clients');
    }

    // Truck Integrity Shortcut
    const truckEl = document.getElementById('truck-count-display');
    if (truckEl) {
        truckEl.innerText = fleetData.trucks.length;
        truckEl.closest('.stat-card').onclick = () => window.tab('trucks');
    }
}

// --- 4. INITIALIZATION ---

window.addEventListener('load', () => {
    // DASHBOARD CALENDAR INIT
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', 
            height: '100%',
            headerToolbar: { left: 'prev,next', center: 'title', right: '' }
        });
        dashCal.render();
    }

    lucide.createIcons();
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);

    initTerminal();
});

async function initTerminal() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v42-final';
    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTruckSpreadsheet(); renderDashboard();
            });
        }
    });
}

