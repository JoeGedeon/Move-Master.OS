import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM CONFIG ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], clients: [] };

// --- 1. THE BRAINS: NAVIGATION & FORCE RENDER ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        
        // CRITICAL: FullCalendar fix for hidden tabs
        if(id === 'dashboard' && dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        if(id === 'calendar' && fullCal) { setTimeout(() => { fullCal.render(); fullCal.updateSize(); }, 50); }
        
        // Refresh visuals
        if(id === 'dashboard') renderDashboard();
        if(id === 'clients') renderClients();
        if(id === 'driverlog') renderLogs();
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    document.getElementById('tab-title').innerText = `${id.toUpperCase()}_OPERATIONS`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
window.openClientModal = () => document.getElementById('client-modal').classList.remove('hidden');
window.openLogModal = () => document.getElementById('log-modal').classList.remove('hidden');

// --- 2. DATA COMMITS (INSTANT UI FEEDBACK) ---

window.saveClient = async () => {
    const val = {
        name: document.getElementById('c-name').value,
        contact: document.getElementById('c-contact').value,
        location: document.getElementById('c-location').value,
        rate: parseFloat(document.getElementById('c-rate').value) || 0,
        timestamp: Date.now()
    };
    if (!val.name) return;

    fleetData.clients.push({ ...val, id: "cl_" + Date.now() });
    renderClients(); renderDashboard(); window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'clients'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
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

    fleetData.driverLogs.push({ ...val, id: "local_" + Date.now() });
    renderLogs(); window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

// --- 3. RENDERERS ---

function renderDashboard() {
    let bal = 0;
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    stream.innerHTML = '';

    // Transactions
    fleetData.receipts.sort((a,b) => b.date?.localeCompare(a.date)).forEach(r => {
        const isIn = r.category === 'Inflow';
        bal += isIn ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center";
        row.innerHTML = `<h4 class="font-black text-2xl ${isIn ? 'text-green-500' : 'text-white'}">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase text-slate-500 font-black">${r.vendor} • ${r.truckId}</p>`;
        stream.appendChild(row);
    });

    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    
    // Clients
    const clientGrid = document.getElementById('client-grid');
    if (clientGrid) {
        clientGrid.innerHTML = fleetData.clients.slice(0, 3).map(c => `
            <div class="client-card">
                <h4 class="text-lg font-black">${c.name}</h4>
                <p class="text-[10px] text-slate-500 font-bold uppercase mt-1">${c.location} • $${c.rate}/load</p>
            </div>
        `).join('');
    }
    document.getElementById('client-count-display').innerText = fleetData.clients.length;
}

function renderClients() {
    const fullGrid = document.getElementById('full-client-grid');
    if (!fullGrid) return;
    fullGrid.innerHTML = fleetData.clients.map(c => `
        <div class="client-card">
            <h4 class="text-xl font-black">${c.name}</h4>
            <p class="text-sm font-bold text-blue-500 mt-2">${c.location}</p>
            <p class="text-[10px] text-slate-500 font-black uppercase mt-4">${c.contact}</p>
        </div>
    `).join('');
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return;
    rows.innerHTML = fleetData.driverLogs.map(l => `
        <tr>
            <td class="p-8 text-xs font-mono text-slate-400">${l.date}</td>
            <td class="p-8 text-xs font-black uppercase">${l.driver}</td>
            <td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td>
            <td class="p-8 text-xs">$0.00</td>
            <td class="p-8 text-xs font-black">$0.00</td>
            <td class="p-8"></td>
        </tr>
    `).join('');
}

// --- 4. INITIALIZATION ---

function initCals() {
    const cfg = { 
        initialView: 'dayGridMonth', 
        height: '100%', 
        dateClick: (i) => { document.getElementById('ev-date').value = i.dateStr; document.getElementById('event-modal').classList.remove('hidden'); } 
    };
    const dEl = document.getElementById('dash-calendar');
    const fEl = document.getElementById('full-calendar-render');
    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, cfg); dashCal.render(); }
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, cfg); fullCal.render(); }
}

window.addEventListener('load', () => {
    initCals();
    lucide.createIcons();
    setInterval(() => { document.getElementById('live-clock').innerText = new Date().toLocaleTimeString(); }, 1000);
    
    // Cloud Sync Fallback
    const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    if (configStr) {
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app); db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-crm-v1';
        onAuthStateChanged(auth, (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0, 6)}`;
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'clients')), s => { fleetData.clients = s.docs.map(d => ({ id: d.id, ...d.data() })); renderDashboard(); });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), s => { fleetData.driverLogs = s.docs.map(d => ({ id: d.id, ...d.data() })); renderLogs(); });
            }
        });
    }
});

