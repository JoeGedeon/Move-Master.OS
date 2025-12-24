import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [] };
let activeId = null;

// --- 1. THE BRAINS: NAVIGATION & MODALS (Global Export) ---
window.tab = (id) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
    document.getElementById('tab-title').innerText = `FLEET_${id.toUpperCase()}`;
    if (id === 'calendar' && calendar) setTimeout(() => calendar.updateSize(), 100);
    lucide.createIcons();
};

window.openLogModal = () => {
    document.getElementById('log-modal').classList.remove('hidden');
    document.getElementById('l-date').value = new Date().toISOString().split('T')[0];
};

window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');

window.closeModal = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    activeId = null;
};

// --- 2. THE BRAINS: INSTANT SAVE ENGINE ---

window.saveEvent = async () => {
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
    };
    if (!val.title) return;

    // A. INSTANT UI FEEDBACK
    const tempId = "temp_" + Date.now();
    fleetData.jobs.push({ ...val, id: tempId });
    syncCal(); renderAgenda(); window.closeModal();

    // B. PERSIST TO CLOUD
    if (user && db) {
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() });
        } catch (e) { console.error("Persistence delayed."); }
    }
};

window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
    };
    if (!val.driver || !val.truckId) return alert("Missing Info");

    // A. INSTANT UI FEEDBACK
    fleetData.driverLogs.push({ ...val, id: "temp_" + Date.now() });
    renderLogs(); window.closeModal();

    // B. PERSIST TO CLOUD
    if (user && db) {
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() });
        } catch (e) { console.error("Persistence delayed."); }
    }
};

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: "Active"
    };
    if (!val.truckId) return;

    // A. INSTANT UI FEEDBACK
    fleetData.trucks.push({ ...val, id: "temp_" + Date.now() });
    renderTrucks(); window.closeModal();

    // B. PERSIST TO CLOUD
    if (user && db) {
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() });
        } catch (e) { console.error("Persistence delayed."); }
    }
};

// --- 3. THE BRAINS: RENDERERS ---

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td><td class="p-6 text-xs font-black uppercase">${l.driver}</td><td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-6 text-xs">$0.00</td><td class="p-6 text-xs">$0.00</td><td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>`;
        rows.appendChild(tr);
    });
    lucide.createIcons();
}

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return;
    grid.innerHTML = '';
    fleetData.trucks.forEach(t => {
        const card = document.createElement('div');
        card.className = "truck-card";
        card.innerHTML = `<h4 class="text-2xl font-black italic">${t.truckId}</h4><p class="text-[10px] text-slate-500 uppercase">${t.make} • Active</p>`;
        grid.appendChild(card);
    });
    document.getElementById('active-truck-count').innerText = fleetData.trucks.length;
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if (!stream) return;
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 4. CLOUD SYNC ENGINE ---

async function connectTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v26-final';

        // Auth First (Rule 3)
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                // Start Real-Time Listeners
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), s => {
                    fleetData.jobs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                    syncCal(); renderAgenda();
                });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), s => {
                    fleetData.driverLogs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderLogs();
                });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                    fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderTrucks();
                });
            }
        });
    } catch (e) { console.warn("Cloud Inactive"); }
}

// --- 5. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initCalendar();
    connectTerminal();
    lucide.createIcons();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 6. UTILS ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    if (el) calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        height: '100%',
        dateClick: (i) => {
            document.getElementById('ev-date').value = i.dateStr;
            document.getElementById('event-modal').classList.remove('hidden');
        },
        eventClick: (i) => {
            activeId = i.event.id;
            document.getElementById('ev-title').value = i.event.title;
            document.getElementById('event-modal').classList.remove('hidden');
        }
    });
    if (calendar) calendar.render();
}

function syncCal() { 
    if (calendar) { 
        calendar.removeAllEvents(); 
        fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); 
    } 
}

window.delLog = async (id) => { 
    if (confirm("Purge?")) {
        if (user && db && !id.startsWith('temp')) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id));
        fleetData.driverLogs = fleetData.driverLogs.filter(x => x.id !== id); renderLogs();
    }
};

