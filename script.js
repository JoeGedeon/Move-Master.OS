import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };
let activeEditId = null;

// --- 1. THE NAVIGATION SHORTCUT ENGINE ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // Logical Triggers: Refresh the data views
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucksSpreadsheet();
        if(id === 'driverlog') renderDriverLogs();
        if(id === 'clients') renderCRM();

        // Refresh Calendar for visibility
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_LOGISTICS_LEDGER`;
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. SPREADSHEET LOGIC: TRUCK UNIT MANAGEMENT ---

function renderTrucksSpreadsheet() {
    const grid = document.getElementById('trucks-grid'); // Using your existing ID
    if (!grid) return;

    // A. CALCULATE DESCRIPTIVE COUNTS
    const stats = {
        total: fleetData.trucks.length,
        ready: fleetData.trucks.filter(t => t.status === 'Operational' || t.status === 'Active').length,
        transit: fleetData.trucks.filter(t => t.status === 'In Transit').length,
        shop: fleetData.trucks.filter(t => t.status === 'Maintenance' || t.status === 'In Shop').length
    };

    // B. GENERATE MASTER VITAL BAR (The Counter)
    const counterHtml = `
        <div class="fleet-vitals-bar col-span-full">
            <div class="vital-tile"><p class="vital-label">Fleet Size</p><h4 class="vital-value">${stats.total}</h4></div>
            <div class="vital-tile border-green-500/20"><p class="vital-label text-green-500">Ready Units</p><h4 class="vital-value">${stats.ready}</h4></div>
            <div class="vital-tile border-blue-500/20"><p class="vital-label text-blue-500">In Transit</p><h4 class="vital-value">${stats.transit}</h4></div>
            <div class="vital-tile border-red-500/20"><p class="vital-label text-red-500">Maintenance</p><h4 class="vital-value">${stats.shop}</h4></div>
        </div>
    `;

    // C. GENERATE SPREADSHEET VIEW
    const tableHtml = `
        <div class="spreadsheet-container col-span-full">
            <table class="fleet-table">
                <thead>
                    <tr>
                        <th>Unit ID</th>
                        <th>Model/Make</th>
                        <th>Mileage</th>
                        <th>Status</th>
                        <th>Last Updated</th>
                    </tr>
                </thead>
                <tbody>
                    ${fleetData.trucks.map(t => {
                        let sClass = t.status?.toLowerCase().includes('transit') ? 'transit' : (t.status?.toLowerCase().includes('shop') || t.status?.toLowerCase().includes('mainte') ? 'maintenance' : 'operational');
                        return `
                        <tr onclick="window.initEditTruck('${t.id}')">
                            <td class="font-black italic uppercase text-white">${t.truckId}</td>
                            <td>${t.make || 'Generic'}</td>
                            <td class="font-mono text-slate-400">${Number(t.miles).toLocaleString()} mi</td>
                            <td><span class="st-pill ${sClass}">${t.status}</span></td>
                            <td class="text-[10px] text-slate-600 font-mono">EDITING_READY</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    grid.innerHTML = counterHtml + tableHtml;
    lucide.createIcons();
}

window.initEditTruck = (id) => {
    const t = fleetData.trucks.find(x => x.id === id);
    if (!t) return;
    activeEditId = id;
    
    // Auto-fill modal for editing
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
        fleetData.trucks[idx] = { ...val, id: activeEditId };
        if(user && db && !activeEditId.startsWith('local')) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', activeEditId), { ...val, timestamp: Timestamp.now() });
        }
    } else {
        fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
        if(user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }

    renderTrucksSpreadsheet();
    window.closeModal();
};

// --- 3. DASHBOARD SHORTCUTS (The "Tile Logic") ---

function renderDashboard() {
    // A. Revenue Shortcut
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    const revEl = document.getElementById('total-display');
    if (revEl) {
        revEl.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        revEl.closest('.balance-card').onclick = () => window.tab('clients');
    }

    // B. Fleet Status Shortcut (The Counter on Dash)
    const countEl = document.getElementById('truck-count-display') || document.getElementById('truck-count');
    if (countEl) {
        countEl.innerText = fleetData.trucks.length;
        countEl.closest('.stat-card').onclick = () => window.tab('trucks');
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
    
    lucide.createIcons();
    setInterval(() => {
        const cl = document.getElementById('live-clock');
        if(cl) cl.innerText = new Date().toLocaleTimeString();
    }, 1000);

    initTerminalLink();
});

async function initTerminalLink() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v38-ledger';

    onAuthStateChanged(auth, u => {
        if(u){ user = u;
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderTrucksSpreadsheet(); renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => {
                fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
        }
    });
}

