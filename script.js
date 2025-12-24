import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [] };
let activeId = null;

// --- 1. THE BRAINS: UI NAVIGATION (IMMEDIATE BINDING) ---
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

window.openLogModal = () => document.getElementById('log-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeId = null;
};

// --- 2. THE BRAINS: COMMIT HANDLERS (INSTANT + HYBRID) ---

window.saveEvent = async () => {
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        timestamp: Date.now()
    };
    if (!val.title) return;

    // Instant local push
    fleetData.jobs.push({ ...val, id: "temp_" + Date.now() });
    syncCal(); renderAgenda(); window.closeModal();

    // Background Cloud Sync
    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() });
    }
};

window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        timestamp: Date.now()
    };
    if (!val.driver) return;

    fleetData.driverLogs.push({ ...val, id: "temp_" + Date.now() });
    renderLogs(); window.closeModal();

    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() });
    }
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

    fleetData.trucks.push({ ...val, id: "temp_" + Date.now() });
    renderTrucks(); window.closeModal();

    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
    }
};

// --- 3. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initCalendar();
    connectToTerminal();
    lucide.createIcons();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 4. TERMINAL COMPONENTS ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    if (!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%',
        editable: true,
        selectable: true,
        dateClick: (info) => {
            const m = document.getElementById('event-modal');
            document.getElementById('ev-date').value = info.dateStr;
            m.classList.remove('hidden');
        },
        eventClick: (info) => {
            activeId = info.event.id;
            const m = document.getElementById('event-modal');
            document.getElementById('ev-title').value = info.event.title;
            m.classList.remove('hidden');
        }
    });
    calendar.render();
}

function syncCal() {
    if (!calendar) return;
    calendar.removeAllEvents();
    fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' }));
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td><td class="p-6 text-xs font-black uppercase">${l.driver}</td><td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-6">Pending</td><td class="p-6"></td>`;
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
        card.innerHTML = `<h4 class="text-2xl font-black italic tracking-tighter">${t.truckId}</h4><p class="text-[10px] text-slate-500 uppercase">${t.make} • ${t.status}</p>`;
        grid.appendChild(card);
    });
    document.getElementById('active-truck-count').innerText = fleetData.trucks.length;
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 5. CLOUD LINK ---
async function connectToTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v26';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                // Add onSnapshot listeners here for continuous cloud sync if environment permits
            } else { await signInAnonymously(auth); }
        });
    } catch (e) { console.warn("Cloud Sync Inactive"); }
}

