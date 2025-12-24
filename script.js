import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null;

// --- 1. CORE NAVIGATION (THE FLOW) ---
window.tab = (id) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Logical Refresh
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucksPage();
        if(id === 'clients') renderClientsPage();
        if(id === 'driverlog') renderLogsPage();

        // Calendar Wakeup
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); 
        }
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS_MASTER`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. TRUCK MODULE: SPREADSHEET & COUNTER LOGIC ---

function renderTrucksPage() {
    const vitals = document.getElementById('fleet-vitals-bar');
    const container = document.getElementById('trucks-spreadsheet-container');
    if (!container) return;

    // Calculate Counts for Descriptive View
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'Out of Service').length
    };

    // Inject Vitals (The Counters)
    if(vitals) {
        vitals.innerHTML = `
            <div class="vital-tile"><span class="vital-label">Total Fleet</span><span class="vital-num">${stats.total}</span></div>
            <div class="vital-tile border-green-500/20"><span class="vital-label text-green-500">Ready Units</span><span class="vital-num text-green-500">${stats.ready}</span></div>
            <div class="vital-tile border-blue-500/20"><span class="vital-label text-blue-500">In Transit</span><span class="vital-num text-blue-500">${stats.transit}</span></div>
            <div class="vital-tile border-red-500/20"><span class="vital-label text-red-500">In Shop</span><span class="vital-num text-red-500">${stats.shop}</span></div>
        `;
    }

    // Inject Spreadsheet
    container.innerHTML = `
        <table class="fleet-table">
            <thead><tr><th>Unit ID</th><th>Make/Model</th><th>Mileage</th><th>Status</th><th>Edit</th></tr></thead>
            <tbody>
                ${fleetData.trucks.map(t => `
                    <tr onclick="window.startEditTruck('${t.id}')">
                        <td class="font-black italic text-white uppercase">${t.truckId}</td>
                        <td class="text-slate-500">${t.make || 'Freightliner'}</td>
                        <td class="font-mono text-slate-400">${Number(t.miles).toLocaleString()} mi</td>
                        <td><span class="text-[9px] font-black uppercase text-blue-500 tracking-widest">${t.status}</span></td>
                        <td class="text-blue-500 font-black text-[10px]">EDIT UNIT</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    lucide.createIcons();
}

window.startEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if (!t) return;
    activeEditId = id;
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
    if(!val.truckId) return;

    if (activeEditId) {
        const idx = fleetData.trucks.findIndex(t => t.id === activeEditId);
        if (idx !== -1) fleetData.trucks[idx] = { ...val, id: activeEditId };
        if(user && db && !activeEditId.startsWith('local')) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
        }
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
        if(user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }
    renderTrucksPage(); window.closeModal();
};

// --- 3. DASHBOARD INTERACTIVITY (REMOTE CONTROL) ---

function renderDashboard() {
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    
    // Revenue Tile shortcut
    const revTile = document.getElementById('dash-revenue-tile');
    if (revTile) {
        document.getElementById('total-display').innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        revTile.onclick = () => window.tab('clients');
    }

    // Truck Stat shortcut
    const truckTile = document.getElementById('dash-trucks-tile');
    if (truckTile) {
        document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
        truckTile.onclick = () => window.tab('trucks');
    }
}

// --- 4. SYSTEM INITIALIZATION ---

window.addEventListener('load', () => {
    // DASHBOARD CALENDAR (GOOGLE-STYLE)
    const dEl = document.getElementById('dash-calendar');
    if (dEl) {
        dashCal = new FullCalendar.Calendar(dEl, { 
            initialView: 'dayGridMonth', 
            height: '100%',
            headerToolbar: { left: 'prev,next', center: 'title', right: 'dayGridMonth,timeGridWeek' },
            dateClick: (i) => {
                document.getElementById('ev-date').value = i.dateStr;
                document.getElementById('event-modal').classList.remove('hidden');
            }
        });
        dashCal.render();
    }

    lucide.createIcons();
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
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-master';
    
    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            document.getElementById('user-id-tag').innerText = `NODE_${u.uid.slice(0,6)}`;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTrucksPage(); renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        } else { signInAnonymously(auth); }
    });
}

// Placeholder Renderers for Toolbar Completeness
window.renderLogsPage = () => {};
window.renderClientsPage = () => {};
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');

