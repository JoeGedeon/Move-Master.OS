import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [] };
let activeId = null;

// --- 1. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initUIEngine();
    initTerminalCalendar();
    connectToTerminal();
    
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. THE BRAINS: NAVIGATION & TRUCKS UI ---
function initUIEngine() {
    window.tab = (id) => {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
        if (target) target.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === id);
        });

        document.getElementById('tab-title').innerText = `FLEET_${id.toUpperCase()}`;
        if (id === 'calendar' && calendar) setTimeout(() => calendar.updateSize(), 50);
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        activeId = null;
    };

    window.openTruckModal = () => {
        document.getElementById('truck-modal').classList.remove('hidden');
    };

    window.openLogModal = () => {
        const modal = document.getElementById('log-modal');
        modal.classList.remove('hidden');
        document.getElementById('l-date').value = new Date().toISOString().split('T')[0];
    };
}

// --- 3. THE BRAINS: CLOUD SYNC & TRUCK ENGINE ---
async function connectToTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v25-units';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                runLiveSync();
            } else { await signInAnonymously(auth); }
        });
    } catch (err) { console.error("Cloud Connection Failure"); }
}

function runLiveSync() {
    // Sync Units
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), snap => {
        fleetData.trucks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTruckUnits();
    });
    // Sync Receipts (for cost attribution)
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTruckUnits(); renderDashboard();
    });
    // Sync Calendar
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendarData();
    });
}

// --- 4. THE BRAINS: TRUCK RENDERER & ACTIONS ---
function renderTruckUnits() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;
    grid.innerHTML = '';

    fleetData.trucks.forEach(t => {
        // Intelligence: Calculate lifetime cost for THIS truck
        const truckExpenses = fleetData.receipts
            .filter(r => r.truckId === t.truckId && r.category !== 'Inflow')
            .reduce((sum, r) => sum + r.amount, 0);

        const card = document.createElement('div');
        card.className = "truck-card group";
        
        const statusColor = t.status === 'Active' ? 'bg-green-500/10 text-green-500' : (t.status === 'In Shop' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500');

        card.innerHTML = `
            <div class="status-ring ${statusColor}">
                <i data-lucide="truck" size="20"></i>
            </div>
            <h4 class="truck-id">${t.truckId}</h4>
            <p class="truck-meta">${t.make} • ${t.miles} mi</p>
            <div class="cost-pill">
                <span class="cost-label">MAINTENANCE BURN</span>
                <span class="cost-value">$${truckExpenses.toFixed(2)}</span>
            </div>
            <div class="mt-6 flex justify-between">
                <span class="text-[9px] font-black uppercase text-slate-500">${t.status}</span>
                <button onclick="window.delTruck('${t.id}')" class="text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <i data-lucide="trash-2" size="14"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
    
    document.getElementById('active-truck-count').innerText = fleetData.trucks.filter(t => t.status === 'Active').length;
    lucide.createIcons();
}

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: document.getElementById('t-status').value,
        timestamp: Timestamp.now()
    };

    if (!val.truckId) return alert("Enter Unit ID");

    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), val);
    }
    window.closeModal();
};

window.delTruck = async (id) => {
    if (confirm("Delete this vehicle unit?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'trucks', id));
    }
};

// --- 5. DASHBOARD & UTILS ---
function renderDashboard() {
    const display = document.getElementById('total-display');
    if (!display) return;
    let bal = 0;
    fleetData.receipts.forEach(r => bal += (r.category === 'Inflow' ? r.amount : -r.amount));
    display.innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}

function initTerminalCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar-render'), { initialView: 'dayGridMonth', height: '100%', dateClick: (i) => window.openTaskModal(null, i.dateStr) });
    calendar.render();
}

function syncCalendarData() { if (calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

