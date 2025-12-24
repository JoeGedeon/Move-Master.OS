import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, dashCal, fullCal;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [] };
const apiKey = ""; 

// --- 1. THE BRAINS: NAVIGATION & SCROLL REFRESH ---
window.tab = (id) => {
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
    if (target) {
        target.classList.add('active');
        
        // FORCE CALENDAR RENDER (Prevents "Missing" Calendar)
        if (dashCal) { setTimeout(() => { dashCal.render(); dashCal.updateSize(); }, 50); }
        if (fullCal) { setTimeout(() => { fullCal.render(); fullCal.updateSize(); }, 50); }
        
        // Re-calculate data visuals
        if(id === 'dashboard') renderDashboard();
        if(id === 'driverlog') renderLogs();
        if(id === 'trucks') renderTrucks();
    }
    
    // UI active state for toolbar
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_CONTROL`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

// --- 2. SMART DATA COMMITS (INSTANT FEEDBACK) ---

window.saveEvent = async () => {
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        timestamp: Date.now()
    };
    if (!val.title) return;

    // Instant local feedback
    fleetData.jobs.push({ ...val, id: "local_" + Date.now() });
    syncCals(); window.closeModal();

    // Background Cloud Sync
    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        timestamp: Date.now()
    };
    if (!val.driver) return alert("Enter Driver Name");

    fleetData.driverLogs.push({ ...val, id: "local_" + Date.now() });
    renderLogs(); window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

window.saveTruckUnit = async () => {
    const val = {
        truckId: document.getElementById('t-id').value.toUpperCase(),
        make: document.getElementById('t-make').value,
        miles: document.getElementById('t-miles').value,
        status: "Active",
        timestamp: Date.now()
    };
    if (!val.truckId) return;

    fleetData.trucks.push({ ...val, id: "local_" + Date.now() });
    renderTrucks(); window.closeModal();

    if (user && db) {
        try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks'), { ...val, timestamp: Timestamp.now() }); } catch(e){}
    }
};

// --- 3. THE BRAINS: RENDERERS (ACCOUNTABILITY CALCULATOR) ---

function renderDashboard() {
    let bal = 0; const stream = document.getElementById('ledger-stream');
    if (!stream) return; stream.innerHTML = '';

    fleetData.receipts.sort((a,b) => b.date?.localeCompare(a.date)).forEach(r => {
        const isIn = r.category === 'Inflow';
        bal += isIn ? r.amount : -r.amount;
        const row = document.createElement('div');
        row.className = "p-10 flex justify-between items-center border-b border-white/5";
        row.innerHTML = `<h4 class="font-black text-2xl ${isIn ? 'text-green-500' : 'text-white'}">$${r.amount.toFixed(2)}</h4><p class="text-[10px] uppercase text-slate-500 font-black">${r.vendor} • ${r.truckId}</p>`;
        stream.appendChild(row);
    });
    
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
}

function renderLogs() {
    const rows = document.getElementById('log-rows');
    if (!rows) return; rows.innerHTML = '';
    
    fleetData.driverLogs.forEach(l => {
        // Intelligence: Find matching expenses for this specific day/truck
        const dayExp = fleetData.receipts
            .filter(r => r.truckId === l.truckId && r.date === l.date && r.category !== 'Inflow')
            .reduce((s, r) => s + r.amount, 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="p-8 text-xs font-mono text-slate-400">${l.date}</td><td class="p-8 text-xs font-black uppercase">${l.driver}</td><td class="p-8 text-xs font-bold text-blue-500">${l.truckId}</td><td class="p-8 text-xs text-red-400">$${dayExp.toFixed(2)}</td><td class="p-8 text-xs font-black">$0.00</td><td class="p-8"></td>`;
        rows.appendChild(tr);
    });
}

function renderTrucks() {
    const grid = document.getElementById('trucks-grid');
    if (!grid) return; grid.innerHTML = '';
    fleetData.trucks.forEach(t => {
        const card = document.createElement('div');
        card.className = "truck-card";
        card.innerHTML = `<h4 class="text-2xl font-black italic">${t.truckId}</h4><p class="text-[10px] text-slate-500 uppercase">${t.make} • ${t.status}</p>`;
        grid.appendChild(card);
    });
}

// --- 4. CALENDARS & INITIALIZATION ---

function initCals() {
    const cfg = { 
        initialView: 'dayGridMonth', 
        height: '100%', 
        dateClick: (i) => { 
            document.getElementById('ev-date').value = i.dateStr; 
            document.getElementById('event-modal').classList.remove('hidden'); 
        } 
    };
    const dEl = document.getElementById('dash-calendar');
    const fEl = document.getElementById('full-calendar-render');
    if (dEl) { dashCal = new FullCalendar.Calendar(dEl, cfg); dashCal.render(); }
    if (fEl) { fullCal = new FullCalendar.Calendar(fEl, cfg); fullCal.render(); }
}

function syncCals() { [dashCal, fullCal].forEach(c => { if(c){ c.removeAllEvents(); fleetData.jobs.forEach(j => c.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' })); } }); }

window.addEventListener('load', () => {
    initCals();
    lucide.createIcons();
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

