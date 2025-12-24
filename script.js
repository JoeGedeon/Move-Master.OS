import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM CONFIG ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;
const apiKey = ""; // Terminal Injected

// --- 1. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initUI();
    initCalendar();
    initDatabase();
    
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. NAVIGATION ---
function initUI() {
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
        activeId = null;
    };

    window.openLogModal = () => {
        const modal = document.getElementById('log-modal');
        modal.classList.remove('hidden');
        document.getElementById('l-date').value = new Date().toISOString().split('T')[0];
    };
}

// --- 3. DATABASE (SYNC ENGINE) ---
async function initDatabase() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v1';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = "LINK: " + user.uid.slice(0, 8);
                startLiveSync();
            } else { await signInAnonymously(auth); }
        });
    } catch (e) { console.warn("Cloud Sync Inactive."); }
}

function startLiveSync() {
    if(!user || !db) return;
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCal(); renderAgenda();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
        fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs();
    });
}

// --- 4. SMART AI SCANNER ---
window.handleSmartIntake = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    document.getElementById('scan-loading').classList.remove('hidden');
    try {
        const b64 = await new Promise(res => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result.split(',')[1]); });
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{role: "user", parts: [{text: "Expert Logistics Mode: OCR Receipt. Return JSON: {vendor, amount, date, category, truckId}."}, {inlineData: {mimeType: "image/png", data: b64}}]}], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = JSON.parse((await res.json()).candidates[0].content.parts[0].text);
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) { alert("AI error. Manual Entry mode."); document.getElementById('audit-modal').classList.remove('hidden'); }
    finally { document.getElementById('scan-loading').classList.add('hidden'); }
};

// --- 5. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if(!stream) return;
    let bal = 0; stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        bal += (r.category === 'Income') ? r.amount : -r.amount;
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group transition-all";
        div.innerHTML = `<h4 class="font-black text-2xl text-white">$${r.amount.toFixed(2)}</h4><p class="text-[10px] font-bold uppercase text-slate-500 tracking-widest">${r.vendor} • ${r.truckId}</p>`;
        stream.appendChild(div);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if(!rows) return;
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-6 text-xs text-slate-400">${l.date}</td><td class="p-6 text-xs font-black uppercase text-white">${l.driver}</td><td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-6"><span class="px-3 py-1 bg-white/5 rounded-lg text-[9px] font-black uppercase">${l.status}</span></td><td class="p-6"><button onclick="window.delLog('${l.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>`;
        rows.appendChild(tr);
    });
    lucide.createIcons();
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if(!stream) return;
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase tracking-widest">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 6. ACTIONS ---
window.commitAuditLog = async () => {
    const d = { amount: parseFloat(document.getElementById('v-amount').value), vendor: document.getElementById('v-vendor').value, truckId: document.getElementById('v-truck').value.toUpperCase(), category: document.getElementById('v-cat').value, date: document.getElementById('v-date').value, timestamp: Timestamp.now() };
    if(user) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), d);
    window.closeModal(); window.tab('dashboard');
};

window.saveDriverLog = async () => {
    const d = { driver: document.getElementById('l-driver').value, truckId: document.getElementById('l-truck').value.toUpperCase(), date: document.getElementById('l-date').value, status: document.getElementById('l-status').value, timestamp: Timestamp.now() };
    if(user && d.driver) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), d);
    window.closeModal();
};

document.getElementById('modal-save-btn').onclick = async () => {
    const d = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value.toUpperCase(), date: document.getElementById('ev-date').value, status: document.getElementById('ev-status').value, timestamp: Timestamp.now() };
    if(user && d.title) {
        if(activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), d);
        else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), d);
    }
    window.closeModal();
};

window.delLog = async (id) => { if(confirm("Purge?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id)); };

// --- 7. CALENDAR ---
function initCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar-render'), { initialView: 'dayGridMonth', height: '100%', editable: true, selectable: true, dateClick: (i) => openEventModal(null, i.dateStr), eventClick: (i) => openEventModal(i.event.id) });
    calendar.render();
}

function openEventModal(id, date) { activeId = id; const m = document.getElementById('event-modal'); const delBtn = document.getElementById('modal-del-btn'); if(id){ const j = fleetData.jobs.find(x=>x.id===id); document.getElementById('ev-title').value = j.title; document.getElementById('ev-date').value = j.date; delBtn.classList.remove('hidden'); } else { document.getElementById('ev-title').value=''; document.getElementById('ev-date').value=date; delBtn.classList.add('hidden'); } m.classList.remove('hidden'); }

function syncCal() { if(calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

