import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [] };
let activeId = null;
let isLinked = false;

// --- 1. UI ENGINE (FAIL-SAFE) ---
window.tab = (id) => {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id + '-tab') || document.getElementById('generic-tab');
    target.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.getElementById('tab-title').innerText = "Terminal_" + id.toUpperCase();
    
    if(id === 'calendar' && calendar) { setTimeout(() => calendar.updateSize(), 50); }
    lucide.createIcons();
};

window.closeModal = () => document.getElementById('event-modal').classList.add('hidden');

// --- 2. STARTUP ---
window.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    lucide.createIcons();
    initDatabase();
});

// --- 3. DATABASE (bulletproof) ---
async function initDatabase() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) throw "Offline";
        
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-hub-v16';
        isLinked = true;

        onAuthStateChanged(auth, async (u) => {
            if (!u) { await signInAnonymously(auth); } else {
                user = u;
                document.getElementById('user-id-tag').innerText = user.uid.slice(0, 10) + "_SYNC";
                syncStreams();
            }
        });
    } catch (e) { console.warn("Local Terminal Mode."); }
}

function syncStreams() {
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLedger();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalData();
        renderAgenda();
    });
}

// --- 4. COMPONENTS ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%', editable: true, selectable: true,
        dateClick: (info) => openModal(null, info.dateStr),
        eventClick: (info) => openModal(info.event.id)
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

function renderLedger() {
    const stream = document.getElementById('ledger-stream');
    let bal = 0; stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        bal += r.category?.includes('income') ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center group";
        row.innerHTML = `<h4 class="font-black text-2xl">$${r.amount.toFixed(2)}</h4><p class="text-[10px] text-slate-500 uppercase">${r.truckId}</p>`;
        stream.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('truck-stat').innerText = new Set(fleetData.receipts.map(r => r.truckId)).size;
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

// --- 5. MODALS ---
function openModal(id = null, date = null) {
    activeId = id;
    const modal = document.getElementById('event-modal');
    const delBtn = document.getElementById('modal-del-btn');
    if(id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        document.getElementById('ev-status').value = j.status;
        delBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date;
        delBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

document.getElementById('modal-save-btn').onclick = async () => {
    if(!isLinked) return alert("Offline terminal.");
    const val = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value, date: document.getElementById('ev-date').value, status: document.getElementById('ev-status').value };
    if(!val.title) return;
    if(activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), val);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() });
    closeModal();
};

document.getElementById('modal-del-btn').onclick = async () => {
    if(activeId) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId));
    closeModal();
};

window.exportCSV = () => {
    const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.amount].join(","));
    const blob = new Blob(["Date,Truck,Amount\n" + rows.join("\n")], {type: 'text/csv'});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Fleet_Dump.csv"; a.click();
};

