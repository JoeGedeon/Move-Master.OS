import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;
const apiKey = ""; // Terminal Injected

// --- 1. BOOT SEQUENCE ---
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    initCalendar();
    initDatabase();
    
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. NAVIGATION (CRITICAL FIX: BIND TO WINDOW) ---
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
        if(modal) {
            modal.classList.remove('hidden');
            document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
        }
    };
}

// --- 3. DATABASE ENGINE ---
async function initDatabase() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v21';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = "ID: " + user.uid.slice(0, 8);
                startSync();
            } else { await signInAnonymously(auth); }
        });
    } catch (e) { console.warn("Standalone Mode."); }
}

function startSync() {
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
        renderDriverLogs();
    });
}

// --- 4. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if(!stream) return;
    let bal = 0; stream.innerHTML = '';
    fleetData.receipts.forEach(r => {
        bal += (r.category === 'Income') ? r.amount : -r.amount;
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group";
        div.innerHTML = `<h4 class="font-black text-2xl text-white">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase text-slate-500 tracking-widest">${r.vendor} • ${r.truckId}</p>`;
        stream.appendChild(div);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('stat-log-count').innerText = fleetData.receipts.length;
}

function renderDriverLogs() {
    const rows = document.getElementById('driver-log-rows');
    if(!rows) return;
    rows.innerHTML = '';
    fleetData.driverLogs.sort((a,b) => b.date.localeCompare(a.date)).forEach(l => {
        const miles = parseInt(l.odoEnd) - parseInt(l.odoStart);
        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/[0.01] transition-all";
        tr.innerHTML = `
            <td class="p-6 text-xs font-mono text-slate-400">${l.date}</td>
            <td class="p-6 text-xs font-black uppercase">${l.driver}</td>
            <td class="p-6 text-xs font-bold text-blue-400">${l.truckId}</td>
            <td class="p-6"><span class="px-3 py-1 bg-blue-500/10 text-blue-500 text-[9px] font-black uppercase rounded-lg">${l.status}</span></td>
            <td class="p-6 text-xs font-mono">${miles > 0 ? miles : 0} mi</td>
            <td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>
        `;
        rows.appendChild(tr);
    });
    lucide.createIcons();
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if(!stream) return;
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Standby</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 5. SMART AI SCANNER ---
window.handleSmartIntake = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const loader = document.getElementById('scan-ui-loading');
    loader.classList.remove('hidden');
    try {
        const b64 = await new Promise(res => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result.split(',')[1]); });
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{role: "user", parts: [{text: "OCR Receipt. Return JSON: {vendor, amount, date, category, truckId}."}, {inlineData: {mimeType: "image/png", data: b64}}]}], generationConfig: { responseMimeType: "application/json" } })
        });
        const data = JSON.parse((await res.json()).candidates[0].content.parts[0].text);
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) { alert("AI Scanner offline. Manual Entry mode."); document.getElementById('audit-modal').classList.remove('hidden'); }
    finally { loader.classList.add('hidden'); }
};

// --- 6. ACTIONS ---
window.saveDriverLog = async () => {
    const d = { driver: document.getElementById('log-driver').value, truckId: document.getElementById('log-truck').value, date: document.getElementById('log-date').value, odoStart: document.getElementById('log-odo-start').value, odoEnd: document.getElementById('log-odo-end').value, status: document.getElementById('log-status').value, timestamp: Timestamp.now() };
    if(!d.driver || !d.truckId) return alert("Fill required fields.");
    if(db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), d);
    window.closeModal();
};

window.commitAuditLog = async () => {
    const d = { amount: parseFloat(document.getElementById('v-amount').value), vendor: document.getElementById('v-vendor').value, truckId: document.getElementById('v-truck').value.toUpperCase(), category: document.getElementById('v-cat').value, date: document.getElementById('v-date').value, timestamp: Timestamp.now() };
    if(db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), d);
    window.closeModal();
    window.tab('dashboard');
};

window.delLog = async (id) => { if(confirm("Purge?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id)); };

// --- 7. UTILS ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    if(!el) return;
    calendar = new FullCalendar.Calendar(el, { initialView: 'dayGridMonth', height: '100%', dateClick: (i) => window.openTaskModal(null, i.dateStr), eventClick: (i) => window.openTaskModal(i.event.id) });
    calendar.render();
}

function syncCal() { if(calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

window.openTaskModal = (id, date) => { activeId = id; const m = document.getElementById('event-modal'); if(id){ const j = fleetData.jobs.find(x=>x.id===id); document.getElementById('ev-title').value = j.title; document.getElementById('ev-date').value = j.date; } else { document.getElementById('ev-title').value=''; document.getElementById('ev-date').value=date; } m.classList.remove('hidden'); };

window.saveEvent = async () => { const d = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value.toUpperCase(), date: document.getElementById('ev-date').value, status: document.getElementById('ev-status').value, timestamp: Timestamp.now() }; if(db){ if(activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), d); else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), d); } window.closeModal(); };

window.exportFullReport = () => { const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.vendor, r.amount].join(",")); const blob = new Blob(["Date,Truck,Vendor,Amount\n"+rows.join("\n")], {type: 'text/csv'}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download="Fleet_Master.csv"; a.click(); };

