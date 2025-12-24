import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- 1. SYSTEM INITIALIZATION ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], trucks: [], inventory: [] };
let activeEditId = null;
const apiKey = ""; // Terminal Injected via environment

// --- 2. BOOT SEQUENCE ---
window.addEventListener('DOMContentLoaded', async () => {
    setupTerminalUI();
    initTerminalCalendar();
    
    // Safety startup: Try cloud first, but enable UI immediately
    try {
        await initCloudSync();
    } catch (e) {
        console.warn("Cloud Sync skipped. Entering Local Command Mode.");
    }
    
    lucide.createIcons();
    
    // Live Clock
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 3. HYBRID SYNC ENGINE ---
async function initCloudSync() {
    // Check if we are in the Preview Env or GitHub
    const hasConfig = typeof __firebase_config !== 'undefined';
    
    if (!hasConfig) {
        console.log("Terminal: Standalone Mode Active.");
        return; 
    }

    try {
        const firebaseConfig = JSON.parse(__firebase_config);
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-hub-v17';

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (u) => {
            if (u) {
                user = u;
                const tag = document.getElementById('user-id-tag');
                if(tag) tag.innerText = user.uid.slice(0, 10) + "_LINK";
                startDataStreams();
            }
        });
    } catch (e) {
        console.error("Cloud Initialization Error:", e);
    }
}

function startDataStreams() {
    if (!user || !db) return;

    // Stream 1: Financial Ledger
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });

    // Stream 2: Dispatch Jobs
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendarData();
        renderAgenda();
    });
}

// --- 4. NAVIGATION & UI ENGINE ---
function setupTerminalUI() {
    window.tab = (id) => {
        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));
        
        const target = document.getElementById(id + '-tab') || document.getElementById('generic-tab');
        if(target) target.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === id);
        });

        const title = document.getElementById('tab-title');
        if(title) title.innerText = "Terminal_" + id.toUpperCase();
        
        if(id === 'calendar' && calendar) {
            setTimeout(() => calendar.updateSize(), 50);
        }
        lucide.createIcons();
    };

    window.closeModal = () => {
        const modal = document.getElementById('event-modal');
        if(modal) modal.classList.add('hidden');
        activeEditId = null;
    };
}

// --- 5. CALENDAR ENGINE (Google Style) ---
function initTerminalCalendar() {
    const el = document.getElementById('calendar-render');
    if (!el) return;

    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: 'dayGridMonth,timeGridWeek' 
        },
        height: '100%',
        editable: true,
        selectable: true,
        dateClick: (info) => window.openModal(null, info.dateStr),
        eventClick: (info) => window.openModal(info.event.id)
    });
    calendar.render();
}

function syncCalendarData() {
    if (!calendar) return;
    calendar.removeAllEvents();
    fleetData.jobs.forEach(j => {
        calendar.addEvent({ 
            id: j.id, 
            title: `${j.truckId || 'GEN'}: ${j.title}`, 
            start: j.date, 
            color: j.status === 'Completed' ? '#10b981' : (j.status === 'Active' ? '#3b82f6' : '#64748b')
        });
    });
}

// --- 6. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    
    let balance = 0;
    stream.innerHTML = '';
    
    fleetData.receipts.forEach(r => {
        const isInc = r.category?.toLowerCase().includes('income');
        balance = isInc ? balance + r.amount : balance - r.amount;
        
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group hover:bg-white/[0.02] transition-all cursor-default";
        div.innerHTML = `
            <div class="flex items-center gap-8">
                <i data-lucide="${isInc ? 'trending-up' : 'trending-down'}" class="${isInc ? 'text-green-500' : 'text-red-500'}"></i>
                <div>
                    <h4 class="font-black text-2xl tracking-tighter">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mt-2">${r.truckId || 'GEN'} • ${r.location || 'Local'}</p>
                </div>
            </div>
            <button onclick="window.deleteRecord('${r.id}')" class="text-slate-800 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i data-lucide="trash-2"></i></button>
        `;
        stream.appendChild(div);
    });
    
    const display = document.getElementById('total-display');
    if(display) display.innerText = `$${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    const stat = document.getElementById('truck-stat');
    if(stat) stat.innerText = new Set(fleetData.receipts.map(r => r.truckId)).size;
    
    lucide.createIcons();
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if (!stream) return;
    
    const today = new Date().toISOString().split('T')[0];
    const todaysJobs = fleetData.jobs.filter(j => j.date === today);
    
    stream.innerHTML = todaysJobs.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase tracking-widest">Clear Sky</p>';
    
    todaysJobs.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl animate-in";
        div.innerHTML = `
            <div class="flex items-center gap-3 mb-2">
                <span class="w-1.5 h-1.5 rounded-full ${j.status === 'Completed' ? 'bg-green-500' : 'bg-blue-500'} shadow-[0_0_8px_currentColor]"></span>
                <p class="text-[10px] font-black text-slate-500 uppercase">${j.truckId || 'GEN'}</p>
            </div>
            <p class="text-xs font-bold leading-relaxed text-white">${j.title}</p>
        `;
        stream.appendChild(div);
    });
}

// --- 7. DATA HANDLERS (Add/Edit/Delete) ---
window.openModal = (id = null, date = null) => {
    activeEditId = id;
    const modal = document.getElementById('event-modal');
    const delBtn = document.getElementById('modal-del-btn');
    
    if(id) {
        const j = fleetData.jobs.find(x => x.id === id);
        if(!j) return;
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        document.getElementById('ev-status').value = j.status;
        if(delBtn) delBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date || new Date().toISOString().split('T')[0];
        document.getElementById('ev-status').value = 'Pending';
        if(delBtn) delBtn.classList.add('hidden');
    }
    if(modal) modal.classList.remove('hidden');
};

const handleSaveEvent = async () => {
    const d = { 
        title: document.getElementById('ev-title').value, 
        truckId: document.getElementById('ev-truck').value.toUpperCase() || "GEN", 
        date: document.getElementById('ev-date').value, 
        status: document.getElementById('ev-status').value 
    };
    
    if(!d.title) return;

    // Logic for GitHub (Local fallback) vs Cloud
    if (user && db) {
        try {
            if(activeEditId) {
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeEditId), d);
            } else {
                await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...d, timestamp: Timestamp.now() });
            }
        } catch (err) {
            console.error("Save Error:", err);
        }
    } else {
        // Standalone Mode: Simulated Save
        if(activeEditId) {
            const idx = fleetData.jobs.findIndex(j => j.id === activeEditId);
            fleetData.jobs[idx] = { ...d, id: activeEditId };
        } else {
            fleetData.jobs.push({ ...d, id: Date.now().toString() });
        }
        syncCalendarData();
        renderAgenda();
    }
    window.closeModal();
};

window.deleteEvent = async () => {
    if(!activeEditId) return;
    if(!confirm("Purge this task from terminal?")) return;

    if (user && db) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeEditId));
    } else {
        fleetData.jobs = fleetData.jobs.filter(j => j.id !== activeEditId);
        syncCalendarData();
        renderAgenda();
    }
    window.closeModal();
};

window.deleteRecord = async (id) => {
    if(!confirm("Confirm record deletion?")) return;
    if (user && db) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
    }
};

// Bind Save Button (fixes "Stuck" buttons)
document.addEventListener('click', (e) => {
    if(e.target && e.target.id === 'modal-save-btn') handleSaveEvent();
    if(e.target && e.target.id === 'modal-del-btn') window.deleteEvent();
});

window.exportFullReport = () => {
    const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.amount, r.location].join(","));
    const csv = "Date,Truck,Amount,Merchant\n" + rows.join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Fleet_Audit_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

