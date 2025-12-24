import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;
const apiKey = ""; // Terminal Injected via Preview Environment

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

// --- 2. UI CONTROL ENGINE ---
function initControls() {
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

// --- 3. SMART AI INTAKE (Categorization Brain) ---
window.handleSmartIntake = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('scan-loading');
    loader.classList.remove('hidden');

    try {
        const base64 = await toBase64(file);
        
        // PROMPT: Logistics Specific Categorization
        const prompt = `Act as an expert logistics auditor. Extract specifics from this receipt. 
        Categorize as: "Diesel", "Hotel", "Repair", "Toll", "Food", or "Other".
        Return ONLY a JSON object: 
        {
            "vendor": "Merchant Name",
            "amount": number_total_cost,
            "date": "YYYY-MM-DD",
            "category": "Diesel" | "Hotel" | "Repair" | "Toll" | "Food" | "Other",
            "truckId": "Unit ID if found",
            "details": "Gallons of fuel, room number, or part details"
        }`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: prompt}, {inlineData: {mimeType: "image/png", data: base64}}]}],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const result = await response.json();
        const data = JSON.parse(result.candidates[0].content.parts[0].text);

        // Populate Verification Modal
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-cat').value = data.category || 'Diesel';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) {
        alert("AI Intake error. Use manual entry.");
        document.getElementById('audit-modal').classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
};

const toBase64 = f => new Promise(res => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result.split(',')[1]); });

// --- 4. CLOUD SYNC ---
async function connectToTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) return;

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v22';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                runLiveSync();
            } else { await signInAnonymously(auth); }
        });
    } catch (err) { console.error("Cloud Error:", err); }
}

function runLiveSync() {
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendar(); renderAgenda();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
        fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLogs();
    });
}

// --- 5. COMMIT ACTIONS ---
window.saveEvent = async () => {
    if (!user) return;
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        status: document.getElementById('ev-status').value,
        timestamp: Timestamp.now()
    };
    if (!val.title) return;
    if (activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), val);
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), val);
    window.closeModal();
};

window.saveDriverLog = async () => {
    if (!user) return;
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        status: document.getElementById('l-status').value,
        timestamp: Timestamp.now()
    };
    if (!val.driver || !val.truckId) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), val);
    window.closeModal();
};

window.commitAuditLog = async () => {
    const entry = {
        amount: parseFloat(document.getElementById('v-amount').value),
        vendor: document.getElementById('v-vendor').value,
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        category: document.getElementById('v-cat').value,
        date: document.getElementById('v-date').value,
        timestamp: Timestamp.now()
    };
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), entry);
    window.closeModal();
    window.tab('dashboard');
};

// --- 6. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    let balance = 0; stream.innerHTML = '';
    fleetData.receipts.sort((a,b) => b.date.localeCompare(a.date)).forEach(r => {
        balance += (r.category === 'Income') ? r.amount : -r.amount;
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group hover:bg-white/[0.01]";
        div.innerHTML = `
            <div class="flex items-center gap-10">
                <div class="badge badge-${r.category.toLowerCase()}">${r.category}</div>
                <div>
                    <h4 class="font-black text-2xl text-white">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[10px] uppercase text-slate-500 tracking-widest">${r.vendor} • ${r.truckId}</p>
                </div>
            </div>
            <button onclick="window.delRec('${r.id}')" class="text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2"></i></button>
        `;
        stream.appendChild(div);
    });
    document.getElementById('total-display').innerText = `$${balance.toLocaleString()}`;
    lucide.createIcons();
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    rows.innerHTML = '';
    fleetData.driverLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td><td class="p-6 text-xs font-black uppercase text-white">${l.driver}</td><td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-6"><span class="badge badge-success">${l.status}</span></td><td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-800"><i data-lucide="trash-2" size="14"></i></button></td>`;
        rows.appendChild(tr);
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
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold">${j.title}</p>`;
        stream.appendChild(div);
    });
}

function initTerminalCalendar() {
    calendar = new FullCalendar.Calendar(document.getElementById('calendar-render'), {
        initialView: 'dayGridMonth', height: '100%', editable: true, selectable: true,
        dateClick: (info) => window.openTaskModal(null, info.dateStr),
        eventClick: (info) => window.openTaskModal(info.event.id)
    });
    calendar.render();
}

function syncCalendar() { if (calendar) { calendar.removeAllEvents(); fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }

