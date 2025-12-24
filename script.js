import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeEditId = null;
let isLinked = false;

// --- 1. UI NAVIGATION ---
window.tab = (id) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id + '-tab') || document.getElementById('generic-tab');
    if(target) target.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.getElementById('tab-title').innerText = "Terminal_" + id.toUpperCase();
    
    if(id === 'calendar' && calendar) { setTimeout(() => calendar.updateSize(), 50); }
    lucide.createIcons();
};

window.closeModal = () => {
    document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden'));
    activeEditId = null;
};

// --- 2. STARTUP ---
window.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    lucide.createIcons();
    initDatabase();
    
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 3. DATABASE ENGINE ---
async function initDatabase() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) throw "Standalone Mode";
        
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-hub-v18';
        isLinked = true;

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = user.uid.slice(0, 10);
                startStreams();
            } else {
                await signInAnonymously(auth);
            }
        });
    } catch (e) { 
        console.warn("Database sync inactive. Local memory mode."); 
    }
}

function startStreams() {
    if (!user || !db) return;

    // Financial Stream
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });

    // Job Stream
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalData();
        renderAgenda();
    });

    // Driver Log Stream
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
        fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDriverLogs();
    });
}

// --- 4. CALENDAR ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    if(!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%', editable: true, selectable: true,
        dateClick: (info) => window.openModal(null, info.dateStr),
        eventClick: (info) => window.openModal(info.event.id)
    });
    calendar.render();
}

function syncCalData() {
    if(!calendar) return;
    calendar.removeAllEvents();
    fleetData.jobs.forEach(j => {
        calendar.addEvent({ 
            id: j.id, title: `${j.truckId || 'GEN'}: ${j.title}`, 
            start: j.date, color: j.status === 'Completed' ? '#10b981' : '#3b82f6' 
        });
    });
}

// --- 5. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if(!stream) return;
    let bal = 0; stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        bal += r.category?.includes('income') ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center group";
        row.innerHTML = `<h4 class="font-black text-2xl tracking-tighter">$${r.amount.toFixed(2)}</h4><p class="text-[10px] text-slate-500 uppercase">${r.truckId}</p>`;
        stream.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('stat-log-count').innerText = fleetData.driverLogs.length;
}

function renderDriverLogs() {
    const container = document.getElementById('driver-log-rows');
    if(!container) return;
    container.innerHTML = '';
    
    fleetData.driverLogs.sort((a,b) => b.date.localeCompare(a.date)).forEach(l => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-white/5 transition-all";
        tr.innerHTML = `
            <td class="p-6 text-xs font-bold text-slate-300 font-mono">${l.date}</td>
            <td class="p-6 text-xs font-black uppercase text-white">${l.driver}</td>
            <td class="p-6 text-xs font-black text-blue-400">${l.truckId}</td>
            <td class="p-6"><span class="px-3 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase rounded-lg">${l.status}</span></td>
            <td class="p-6 text-xs font-mono text-slate-400">${l.odoStart} → ${l.odoEnd}</td>
            <td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>
        `;
        container.appendChild(tr);
    });
    lucide.createIcons();
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold mt-1">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 6. ACTIONS ---
window.openModal = (id = null, date = null) => {
    activeEditId = id;
    const modal = document.getElementById('event-modal');
    if(id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        document.getElementById('ev-status').value = j.status;
        document.getElementById('modal-del-btn').classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date || new Date().toISOString().split('T')[0];
        document.getElementById('modal-del-btn').classList.add('hidden');
    }
    modal.classList.remove('hidden');
};

window.openLogModal = () => document.getElementById('log-modal').classList.remove('hidden');

window.saveDriverLog = async () => {
    const entry = {
        driver: document.getElementById('log-driver').value,
        truckId: document.getElementById('log-truck').value.toUpperCase(),
        date: document.getElementById('log-date').value || new Date().toISOString().split('T')[0],
        odoStart: document.getElementById('log-odo-start').value,
        odoEnd: document.getElementById('log-odo-end').value,
        status: document.getElementById('log-status').value,
        timestamp: Timestamp.now()
    };
    
    if(!entry.driver || !entry.truckId) return alert("Missing required fields.");

    if(isLinked) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), entry);
    } else {
        fleetData.driverLogs.push({ ...entry, id: Date.now().toString() });
        renderDriverLogs();
    }
    closeModal();
};

window.delLog = async (id) => {
    if(!confirm("Purge log?")) return;
    if(isLinked) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id));
    else { fleetData.driverLogs = fleetData.driverLogs.filter(x => x.id !== id); renderDriverLogs(); }
};

document.getElementById('modal-save-btn').onclick = async () => {
    const val = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value.toUpperCase(), date: document.getElementById('ev-date').value, status: document.getElementById('ev-status').value };
    if(!val.title) return;
    if(isLinked) {
        if(activeEditId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeEditId), val);
        else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() });
    }
    closeModal();
};

