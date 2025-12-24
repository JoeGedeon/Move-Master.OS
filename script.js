import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL DATA ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;

// --- 1. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initControls();
    initTerminalCalendar();
    connectToTerminal();
    
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. THE BRAINS: UI CONTROL ---
function initControls() {
    // Force UI visibility even if database is slow
    window.tab = (id) => {
        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));
        
        const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
        if (target) target.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === id);
        });

        document.getElementById('tab-title').innerText = `FLEET_${id.toUpperCase()}`;
        
        if (id === 'calendar' && calendar) {
            setTimeout(() => calendar.updateSize(), 100);
        }
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        activeId = null;
    };

    window.openLogModal = () => {
        const modal = document.getElementById('log-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.getElementById('l-date').value = new Date().toISOString().split('T')[0];
        }
    };
}

// --- 3. THE BRAINS: CLOUD SYNC ---
async function connectToTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return console.warn("No cloud link found.");

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v1';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                const tag = document.getElementById('user-id-tag');
                if (tag) tag.innerText = `ID_${user.uid.slice(0, 8)}`;
                runLiveSync();
            } else {
                await signInAnonymously(auth);
            }
        });
    } catch (err) { console.error("Cloud Error:", err); }
}

function runLiveSync() {
    if (!user || !db) return;

    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });

    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendar();
        renderAgenda();
    });

    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
        fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs();
    });
}

// --- 4. THE BRAINS: COMMIT HANDLERS ---
window.saveEvent = async () => {
    if (!user) return alert("Syncing terminal...");
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        status: document.getElementById('ev-status').value,
        timestamp: Timestamp.now()
    };
    if (!val.title) return;

    if (activeId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), val);
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), val);
    }
    window.closeModal();
};

window.saveDriverLog = async () => {
    if (!user) return alert("Syncing terminal...");
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        status: document.getElementById('l-status').value,
        timestamp: Timestamp.now()
    };
    if (!val.driver || !val.truckId) return alert("Missing data");
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), val);
    window.closeModal();
};

window.deleteEvent = async () => {
    if (activeId && confirm("Purge Task?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId));
        window.closeModal();
    }
};

// --- 5. TERMINAL COMPONENTS ---
function initTerminalCalendar() {
    const el = document.getElementById('calendar-render');
    if (!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%', editable: true, selectable: true,
        dateClick: (info) => window.openTaskModal(null, info.dateStr),
        eventClick: (info) => window.openTaskModal(info.event.id)
    });
    calendar.render();
}

window.openTaskModal = (id, date) => {
    activeId = id;
    const m = document.getElementById('event-modal');
    const dBtn = document.getElementById('modal-del-btn');
    if (id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        if (dBtn) dBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date;
        if (dBtn) dBtn.classList.add('hidden');
    }
    m.classList.remove('hidden');
};

function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    let bal = 0; stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        bal += (r.category === 'Income') ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center";
        row.innerHTML = `<h4 class="font-black text-2xl">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase text-slate-500">${r.truckId}</p>`;
        stream.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td><td class="p-6 text-xs font-black uppercase">${l.driver}</td><td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-6"><span class="status-chip">${l.status}</span></td><td class="p-6"></td>`;
        rows.appendChild(tr);
    });
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20">No Tasks</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold">${j.title}</p>`;
        stream.appendChild(div);
    });
}

function syncCalendar() { if (calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

