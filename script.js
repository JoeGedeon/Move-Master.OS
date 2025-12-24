import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;
const apiKey = ""; // Terminal Injected

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

// --- 2. THE BRAINS: NAVIGATION & MODALS ---
function initControls() {
    window.tab = (id) => {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
        if (target) target.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
        document.getElementById('tab-title').innerText = `FLEET_${id.toUpperCase()}`;
        if (id === 'calendar' && calendar) setTimeout(() => calendar.updateSize(), 50);
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        activeId = null;
    };

    window.openLogModal = () => {
        const modal = document.getElementById('log-modal');
        modal.classList.remove('hidden');
        document.getElementById('l-date').value = new Date().toISOString().split('T')[0];
    };
}

// --- 3. THE BRAINS: AI SCANNER (ACCOUNTABILITY FOCUS) ---
window.handleSmartIntake = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('scan-loading').classList.remove('hidden');
    window.tab('scan'); // Switch to scan tab during process

    try {
        const base64 = await new Promise(res => {
            const r = new FileReader();
            r.readAsDataURL(file);
            r.onload = () => res(r.result.split(',')[1]);
        });
        
        // AI PROMPT: Focused on high-accuracy logistics auditing
        const prompt = `Act as an expert logistics auditor. Extract data from this image. 
        Detect if it is an Expense (Diesel, Repair, Hotel) or a Company Inflow (Cash Advance, Funding).
        Return ONLY JSON: {"vendor":string, "amount":number, "date":"YYYY-MM-DD", "category":string, "truckId":string, "details":string}`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: prompt}, {inlineData: {mimeType: "image/png", data: base64}}]}],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const result = await res.json();
        const data = JSON.parse(result.candidates[0].content.parts[0].text);

        // Pre-fill Audit Modal for human verification
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-cat').value = data.category || 'Diesel';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('v-details').value = data.details || '';
        
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) {
        alert("AI error. Manual verification required.");
        document.getElementById('audit-modal').classList.remove('hidden');
    } finally {
        document.getElementById('scan-loading').classList.add('hidden');
    }
};

window.commitAuditLog = async () => {
    if (!user) return alert("Terminal not linked.");
    const val = {
        amount: parseFloat(document.getElementById('v-amount').value),
        vendor: document.getElementById('v-vendor').value,
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        category: document.getElementById('v-cat').value,
        date: document.getElementById('v-date').value,
        details: document.getElementById('v-details').value,
        timestamp: Timestamp.now()
    };
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), val);
    window.closeModal();
    window.tab('dashboard');
};

// --- 4. THE BRAINS: DATA HUB & CLOUD SYNC ---
async function connectToTerminal() {
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
                document.getElementById('user-id-tag').innerText = `ID: ${user.uid.slice(0, 8)}`;
                runSyncStreams();
            } else { await signInAnonymously(auth); }
        });
    } catch (err) { console.error("Cloud Error"); }
}

function runSyncStreams() {
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard(); renderDriverLogs();
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

// --- 5. RENDERERS: THE ACCOUNTABILITY ENGINE ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    let balance = 0, burn = 0; stream.innerHTML = '';
    fleetData.receipts.sort((a,b) => b.date.localeCompare(a.date)).forEach(r => {
        const isIn = r.category === 'Inflow';
        balance += isIn ? r.amount : -r.amount;
        if (!isIn) burn += r.amount;
        
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center group";
        row.innerHTML = `<h4 class="font-black text-2xl ${isIn ? 'text-green-500' : 'text-white'}">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase font-black text-slate-500">${r.vendor} • ${r.category}</p>`;
        stream.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${balance.toLocaleString()}`;
    document.getElementById('burn-rate').innerText = `$${burn.toLocaleString()}`;
}

function renderDriverLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = '';
    
    fleetData.driverLogs.forEach(l => {
        // Find matching expenses for this driver/truck on this date
        const matches = fleetData.receipts.filter(r => r.truckId === l.truckId && r.date === l.date);
        const exp = matches.filter(r => r.category !== 'Inflow').reduce((a, b) => a + b.amount, 0);
        const fund = matches.filter(r => r.category === 'Inflow').reduce((a, b) => a + b.amount, 0);
        const diff = fund - exp;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td>
            <td class="p-6 text-xs font-black uppercase text-white">${l.driver}</td>
            <td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td>
            <td class="p-6 text-xs text-red-400">$${exp.toFixed(2)}</td>
            <td class="p-6 text-xs ${diff < 0 ? 'text-red-500' : 'text-green-500'} font-black">$${diff.toFixed(2)}</td>
            <td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-800 hover:text-red-500"><i data-lucide="trash-2" size="16"></i></button></td>
        `;
        rows.appendChild(tr);
    });
    lucide.createIcons();
}

// --- 6. ACTIONS ---
window.saveDriverLog = async () => {
    const d = { driver: document.getElementById('l-driver').value, truckId: document.getElementById('l-truck').value.toUpperCase(), date: document.getElementById('l-date').value, status: document.getElementById('l-status').value, timestamp: Timestamp.now() };
    if (user && d.driver) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), d);
    window.closeModal();
};

window.saveEvent = async () => {
    const d = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value.toUpperCase(), date: document.getElementById('ev-date').value, status: document.getElementById('ev-status').value, timestamp: Timestamp.now() };
    if (user && d.title) {
        if (activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), d);
        else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), d);
    }
    window.closeModal();
};

// --- CALENDAR UTILS ---
function initTerminalCalendar() { calendar = new FullCalendar.Calendar(document.getElementById('calendar-render'), { initialView: 'dayGridMonth', height: '100%', editable: true, selectable: true, dateClick: (i) => window.openTaskModal(null, i.dateStr), eventClick: (i) => window.openTaskModal(i.event.id) }); calendar.render(); }
function syncCal() { if (calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }
window.openTaskModal = (id, date) => { activeId = id; const m = document.getElementById('event-modal'); const dBtn = document.getElementById('modal-del-btn'); if (id) { const j = fleetData.jobs.find(x => x.id === id); document.getElementById('ev-title').value = j.title; document.getElementById('ev-date').value = j.date; dBtn.classList.remove('hidden'); } else { document.getElementById('ev-title').value = ''; document.getElementById('ev-date').value = date; dBtn.classList.add('hidden'); } m.classList.remove('hidden'); };
window.deleteEvent = async () => { if (activeId && confirm("Purge?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId)); window.closeModal(); };
window.delLog = async (id) => { if (confirm("Purge?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id)); };

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div'); div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

