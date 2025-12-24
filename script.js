import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [] };
let activeId = null;

// --- 1. THE BRAINS: NAVIGATION (IMMEDIATE GLOBAL BINDING) ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
    if (target) {
        target.classList.add('active');
        // CRITICAL FIX: Ensure dashboard stats render if hidden previously
        if(id === 'dashboard') renderDashboard();
        if(id === 'driverlog') renderLogs();
        if(id === 'trucks') renderTrucks();
    }
    
    // UI active state
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `TERMINAL_${id.toUpperCase()}`;
    
    if (id === 'calendar' && calendar) {
        setTimeout(() => calendar.updateSize(), 50);
    }
    lucide.createIcons();
};

window.openLogModal = () => document.getElementById('log-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeId = null;
};

// --- 2. THE BRAINS: INSTANT SAVE ENGINE (HYBRID) ---

window.saveEvent = async () => {
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        timestamp: Date.now()
    };
    if (!val.title) return;
    fleetData.jobs.push({ ...val, id: "local_" + Date.now() });
    syncCal(); renderAgenda(); window.closeModal();
    if (user && db) try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
};

window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        timestamp: Date.now()
    };
    if (!val.driver || !val.truckId) return alert("Fill Driver & Unit ID");
    fleetData.driverLogs.push({ ...val, id: "local_" + Date.now() });
    renderLogs(); window.closeModal();
    if (user && db) try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
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
    fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    renderTrucks(); window.closeModal();
    if (user && db) try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
};

// --- 3. THE BRAINS: RENDERERS ---

function renderDashboard() {
    let bal = 0;
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        const isIn = r.category === 'Inflow';
        bal += isIn ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center group";
        row.innerHTML = `<h4 class="font-black text-2xl ${isIn ? 'text-green-500' : 'text-white'}">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase text-slate-500">${r.vendor} • ${r.truckId}</p>`;
        stream.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-8 text-xs text-slate-400 font-mono">${l.date}</td><td class="p-8 text-xs font-black uppercase">${l.driver}</td><td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-8 text-xs text-red-400">$0.00</td><td class="p-8 text-xs font-black">$0.00</td><td class="p-8"></td>`;
        rows.appendChild(tr);
    });
}

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;
    grid.innerHTML = '';
    fleetData.trucks.forEach(t => {
        const card = document.createElement('div');
        card.className = "truck-card";
        card.innerHTML = `<h4 class="text-2xl font-black italic">${t.truckId}</h4><p class="text-[10px] text-slate-500 uppercase">${t.make} • ${t.status}</p>`;
        grid.appendChild(card);
    });
    document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    if (!stream) return;
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase tracking-widest">Clear Schedule</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 4. CLOUD SYNC & BOOT ---
async function connectTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v26';

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), s => { fleetData.jobs = s.docs.map(d => ({ id: d.id, ...d.data() })); syncCal(); renderAgenda(); });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), s => { fleetData.driverLogs = s.docs.map(d => ({ id: d.id, ...d.data() })); renderLogs(); });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => { fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() })); renderTrucks(); });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => { fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() })); renderDashboard(); });
            }
        });
    } catch (e) { console.warn("Cloud Sync Offline"); }
}

window.addEventListener('load', () => {
    initCalendar();
    connectTerminal();
    lucide.createIcons();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if(el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

function initCalendar() {
    const el = document.getElementById('calendar-render');
    if (!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        height: '100%',
        dateClick: (info) => {
            document.getElementById('ev-date').value = info.dateStr;
            document.getElementById('event-modal').classList.remove('hidden');
        }
    });
    calendar.render();
}

function syncCal() { if (calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

