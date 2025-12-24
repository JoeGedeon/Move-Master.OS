import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM CONSTANTS & STATE ---
const apiKey = ""; // Terminal Injected Key
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [], inventory: [] };

// --- 1. PROACTIVE NAVIGATION ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
    if (target) {
        target.classList.add('active');
        // FORCE RENDER: Essential for FullCalendar to appear in hidden containers
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        if(id === 'calendar' && fullCal) { setTimeout(() => { fullCal.render(); fullCal.updateSize(); }, 50); }
        
        // INTELLIGENCE TRIGGER: Re-calculate metrics on every tab swap
        runSystemDiagnostics();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS_MODE`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

// --- 2. AI AUDITOR: VISION OCR ENGINE ---
window.handleSmartIntake = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('scan-loading');
    if (loader) loader.classList.remove('hidden');

    try {
        const base64 = await new Promise(res => {
            const r = new FileReader(); r.readAsDataURL(file);
            r.onload = () => res(r.result.split(',')[1]);
        });
        
        const prompt = `Act as an elite logistics auditor. Analyze this receipt/document. 
        Identify: Merchant Name, Date (YYYY-MM-DD), Total Amount, Truck ID (if present), and Category (Diesel, Repair, Hotel, Toll, or Inflow/Funding). 
        CRITICAL: If it's a repair, list items like "Tires" or "Oil".
        Return ONLY valid JSON: {"vendor":string, "amount":number, "date":"string", "category":string, "truckId":string, "parts":string[]}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: prompt}, {inlineData: {mimeType: "image/png", data: base64}}]}],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        const result = await response.json();
        const aiData = JSON.parse(result.candidates[0].content.parts[0].text);

        // Map AI Data to Audit Modal
        document.getElementById('v-vendor').value = aiData.vendor || '';
        document.getElementById('v-amount').value = aiData.amount || 0;
        document.getElementById('v-cat').value = aiData.category || 'Diesel';
        document.getElementById('v-truck').value = aiData.truckId || '';
        if(document.getElementById('v-items')) document.getElementById('v-items').value = aiData.parts?.join(', ') || '';
        
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) {
        console.error("AI Error:", err);
        document.getElementById('audit-modal').classList.remove('hidden'); // Fallback to manual
    } finally {
        if (loader) loader.classList.add('hidden');
    }
};

window.commitAudit = async () => {
    const val = {
        amount: parseFloat(document.getElementById('v-amount').value) || 0,
        vendor: document.getElementById('v-vendor').value,
        category: document.getElementById('v-cat').value,
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        date: document.getElementById('v-date')?.value || new Date().toISOString().split('T')[0],
        timestamp: Date.now()
    };

    // INSTANT FEEDBACK
    fleetData.receipts.push({ ...val, id: "temp_" + Date.now() });
    runSystemDiagnostics();
    window.closeModal();
    window.tab('dashboard');

    // PERSISTENCE (Rule 3)
    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), { ...val, timestamp: Timestamp.now() });
    }
};

// --- 3. SYSTEM DIAGNOSTICS (THE "SMART" PART) ---
function runSystemDiagnostics() {
    renderDashboard();
    renderLogs();
    renderTrucks();
    renderClients();
    syncCals();
}

function renderDashboard() {
    let balance = 0; let burn = 0;
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    stream.innerHTML = '';

    // Calculate Cashflow
    fleetData.receipts.sort((a,b) => b.date?.localeCompare(a.date)).forEach(r => {
        const isIn = r.category === 'Inflow' || r.category === 'Funding';
        balance += isIn ? r.amount : -r.amount;
        if(!isIn) burn += r.amount;

        const row = document.createElement('div');
        row.className = "p-8 flex justify-between items-center group hover:bg-white/[0.01]";
        row.innerHTML = `
            <div class="flex items-center gap-6">
                <div class="w-10 h-10 rounded-full ${isIn ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} flex items-center justify-center">
                    <i data-lucide="${isIn ? 'trending-up' : 'trending-down'}" size="16"></i>
                </div>
                <div>
                    <h4 class="font-black text-xl text-white">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[9px] uppercase font-black text-slate-500 tracking-tighter">${r.vendor} • ${r.truckId || 'FLT'}</p>
                </div>
            </div>
            <p class="text-[10px] font-mono text-slate-600">${r.date}</p>
        `;
        stream.appendChild(row);
    });

    document.getElementById('total-display').innerText = `$${balance.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    if(document.getElementById('burn-display')) document.getElementById('burn-display').innerText = `$${burn.toLocaleString()}`;
    lucide.createIcons();
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = '';

    fleetData.driverLogs.forEach(l => {
        // INTELLIGENCE: Auto-match expenses to this specific log (Accountability)
        const dayExp = fleetData.receipts
            .filter(r => r.truckId === l.truckId && r.date === l.date && r.category !== 'Inflow')
            .reduce((s, r) => s + r.amount, 0);
        
        const dayFund = fleetData.receipts
            .filter(r => r.truckId === l.truckId && r.date === l.date && r.category === 'Inflow')
            .reduce((s, r) => s + r.amount, 0);

        const net = dayFund - dayExp;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-8 text-xs font-mono text-slate-400">${l.date}</td>
            <td class="p-8 text-xs font-black uppercase text-white">${l.driver}</td>
            <td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td>
            <td class="p-8 text-xs text-red-400">$${dayExp.toFixed(2)}</td>
            <td class="p-8 text-xs ${net < 0 ? 'text-red-400' : 'text-green-400'} font-black">$${net.toFixed(2)}</td>
            <td class="p-8 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-800 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>
        `;
        rows.appendChild(tr);
    });
    lucide.createIcons();
}

// --- 4. DATA COMMITS (HYBRID) ---
window.saveDriverLog = async () => {
    const val = { driver: document.getElementById('l-driver').value, truckId: document.getElementById('l-truck').value.toUpperCase(), date: document.getElementById('l-date').value, timestamp: Date.now() };
    if(!val.driver) return;
    fleetData.driverLogs.push({ ...val, id: "local_" + Date.now() });
    runSystemDiagnostics(); window.closeModal();
    if (user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() });
};

window.saveClient = async () => {
    const val = { name: document.getElementById('c-name').value, contact: document.getElementById('c-contact').value, location: document.getElementById('c-location').value, rate: document.getElementById('c-rate').value, timestamp: Date.now() };
    if(!val.name) return;
    fleetData.clients.push({ ...val, id: "cl_" + Date.now() });
    runSystemDiagnostics(); window.closeModal();
    if (user && db) await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'clients'), { ...val, timestamp: Timestamp.now() });
};

// --- 5. INITIALIZATION ---
window.addEventListener('load', () => {
    initCalendars();
    connectTerminal();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if(el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

function initCalendars() {
    const cfg = { initialView: 'dayGridMonth', height: '100%', dateClick: (i) => { document.getElementById('ev-date').value = i.dateStr; document.getElementById('event-modal').classList.remove('hidden'); } };
    const dEl = document.getElementById('dash-calendar');
    const fEl = document.getElementById('full-calendar-render');
    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, cfg); dashCal.render(); }
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, cfg); fullCal.render(); }
}

function syncCals() { [dashCal, fullCal].forEach(c => { if(c){ c.removeAllEvents(); fleetData.jobs.forEach(j => c.addEvent({ title: j.title, start: j.date, color: '#3b82f6' })); } }); }

async function connectTerminal() {
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if(!configStr) return;
    const app = initializeApp(JSON.parse(configStr));
    auth = getAuth(app); db = getFirestore(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-final-v30';
    onAuthStateChanged(auth, u => { if(u){ user = u; document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0,6)}`; startListeners(); } else { signInAnonymously(auth); }});
}

function startListeners() {
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), s => { fleetData.receipts = s.docs.map(d => ({ id: d.id, ...d.data() })); runSystemDiagnostics(); });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), s => { fleetData.driverLogs = s.docs.map(d => ({ id: d.id, ...d.data() })); runSystemDiagnostics(); });
}

