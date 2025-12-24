import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
const apiKey = ""; 
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [] };
let activeId = null;
let isLinked = false;

// --- 1. BOOT SEQUENCE ---
window.addEventListener('load', () => {
    initUIEngine();
    initTerminalCalendar();
    connectToTerminal();
    
    // Pulse the clock
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. UI & NAVIGATION ENGINE ---
function initUIEngine() {
    window.tab = (id) => {
        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));
        
        const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
        if (target) target.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === id);
        });

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
        if (modal) {
            modal.classList.remove('hidden');
            const d = document.getElementById('l-date');
            if (d) d.value = new Date().toISOString().split('T')[0];
        }
    };
}

// --- 3. THE ACCOUNTABILITY ENGINE (SAVE LOGIC) ---

// INSTANT SAVE: Driver's Log
window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        status: document.getElementById('l-status').value,
        timestamp: Date.now()
    };

    if (!val.driver || !val.truckId) {
        alert("Please enter both Driver and Truck ID.");
        return;
    }

    // A. Push to Local Memory (Instant UI Feedback)
    const localId = "temp_" + Date.now();
    fleetData.driverLogs.push({ ...val, id: localId });
    renderDriverLogs(); // Update the table immediately
    window.closeModal();

    // B. Attempt Cloud Sync (Silent persistence)
    if (isLinked && user && db) {
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), {
                ...val,
                timestamp: Timestamp.now()
            });
        } catch (e) { console.warn("Cloud backup delayed."); }
    }
};

// INSTANT SAVE: AI Scanner / Ledger
window.commitAuditLog = async () => {
    const val = {
        amount: parseFloat(document.getElementById('v-amount').value) || 0,
        vendor: document.getElementById('v-vendor').value,
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        category: document.getElementById('v-cat').value,
        date: document.getElementById('v-date').value,
        timestamp: Date.now()
    };

    // A. Push to Local Memory
    fleetData.receipts.push({ ...val, id: "temp_" + Date.now() });
    renderDashboard();
    renderDriverLogs(); // Re-calc balances
    window.closeModal();
    window.tab('dashboard');

    // B. Attempt Cloud Sync
    if (isLinked && user && db) {
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), {
                ...val,
                timestamp: Timestamp.now()
            });
        } catch (e) { console.warn("Sync pending..."); }
    }
};

// --- 4. RENDERERS (THE DATA VISUALIZERS) ---

function renderDriverLogs() {
    const container = document.getElementById('log-rows');
    if (!container) return;
    container.innerHTML = '';
    
    // Sort by date newest first
    const sorted = [...fleetData.driverLogs].sort((a,b) => b.date.localeCompare(a.date));

    sorted.forEach(l => {
        // Accountability Logic: Filter receipts for this Truck/Driver on this specific date
        const dayReceipts = fleetData.receipts.filter(r => r.truckId === l.truckId && r.date === l.date);
        
        const totalExpenses = dayReceipts
            .filter(r => r.category !== 'Inflow')
            .reduce((sum, r) => sum + r.amount, 0);
            
        const totalInflow = dayReceipts
            .filter(r => r.category === 'Inflow')
            .reduce((sum, r) => sum + r.amount, 0);

        const netBalance = totalInflow - totalExpenses;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/[0.01] transition-all";
        tr.innerHTML = `
            <td class="p-6 text-xs text-slate-400 font-mono">${l.date}</td>
            <td class="p-6 text-xs font-black uppercase text-white">${l.driver}</td>
            <td class="p-6 text-xs font-bold text-blue-500">${l.truckId}</td>
            <td class="p-6 text-xs text-red-400">$${totalExpenses.toFixed(2)}</td>
            <td class="p-6 text-xs ${netBalance < 0 ? 'text-red-500' : 'text-green-500'} font-black">
                ${netBalance < 0 ? '-' : ''}$${Math.abs(netBalance).toFixed(2)}
            </td>
            <td class="p-6 text-right">
                <button onclick="window.delLog('${l.id}')" class="text-slate-800 hover:text-red-500 transition-all">
                    <i data-lucide="trash-2" size="16"></i>
                </button>
            </td>
        `;
        container.appendChild(tr);
    });
    lucide.createIcons();
}

function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    let balance = 0, burn = 0;
    stream.innerHTML = '';
    
    const sortedRec = [...fleetData.receipts].sort((a,b) => b.date.localeCompare(a.date));

    sortedRec.forEach(r => {
        const isIn = r.category === 'Inflow';
        balance += isIn ? r.amount : -r.amount;
        if (!isIn) burn += r.amount;
        
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group border-b border-white/5";
        div.innerHTML = `
            <div class="flex items-center gap-10">
                <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-blue-500">
                    <i data-lucide="${isIn ? 'arrow-up-right' : 'receipt'}"></i>
                </div>
                <div>
                    <h4 class="font-black text-2xl text-white">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[10px] uppercase font-black text-slate-500 tracking-widest mt-2">
                        ${r.vendor} • <span class="text-blue-500">${r.category}</span> • ${r.truckId}
                    </p>
                </div>
            </div>
            <button onclick="window.delRec('${r.id}')" class="text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        stream.appendChild(div);
    });
    
    document.getElementById('total-display').innerText = `$${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    const burnEl = document.getElementById('burn-rate');
    if(burnEl) burnEl.innerText = `$${burn.toLocaleString()}`;
    lucide.createIcons();
}

// --- 5. CLOUD LINK (BACKGROUND SYNC) ---
async function connectToTerminal() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) {
            document.getElementById('user-id-tag').innerText = "LOCAL_MODE";
            return;
        }

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v24-live';

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (u) => {
            if (u) {
                user = u;
                isLinked = true;
                document.getElementById('user-id-tag').innerText = `ID_${user.uid.slice(0, 8)}`;
                
                // Switch to Cloud Streams
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
                    fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderDashboard(); renderDriverLogs();
                });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
                    fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    if (calendar) {
                        calendar.removeAllEvents();
                        fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' }));
                    }
                });
                onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
                    fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    renderDriverLogs();
                });
            }
        });
    } catch (err) { document.getElementById('user-id-tag').innerText = "OFFLINE"; }
}

// --- 6. UTILS ---
function initTerminalCalendar() {
    const el = document.getElementById('calendar-render');
    if (!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%', editable: true, selectable: true,
        dateClick: (i) => window.openTaskModal(null, i.dateStr),
        eventClick: (i) => window.openTaskModal(i.event.id)
    });
    calendar.render();
}

window.openTaskModal = (id, date) => {
    activeId = id;
    const m = document.getElementById('event-modal');
    if (id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date;
    }
    m.classList.remove('hidden');
};

window.saveEvent = async () => {
    const val = { title: document.getElementById('ev-title').value, truckId: document.getElementById('ev-truck').value.toUpperCase(), date: document.getElementById('ev-date').value, timestamp: Date.now() };
    if (!val.title) return;
    if (isLinked && user) {
        if (activeId && !activeId.startsWith('temp')) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), val);
        else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), val);
    }
    window.closeModal();
};

window.delLog = async (id) => {
    if (!confirm("Purge Log Entry?")) return;
    if (isLinked && user && !id.startsWith('temp')) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id));
    } else {
        fleetData.driverLogs = fleetData.driverLogs.filter(x => x.id !== id);
        renderDriverLogs();
    }
};

window.delRec = async (id) => {
    if (!confirm("Delete Record?")) return;
    if (isLinked && user && !id.startsWith('temp')) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
    } else {
        fleetData.receipts = fleetData.receipts.filter(x => x.id !== id);
        renderDashboard(); renderDriverLogs();
    }
};

