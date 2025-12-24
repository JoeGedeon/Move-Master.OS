import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM CONSTANTS ---
const apiKey = ""; // Injected via environment
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [], driverLogs: [], trucks: [], inventory: [] };
let activeId = null;
let isLinked = false;

// --- 1. BOOT SEQUENCE ---
window.addEventListener('DOMContentLoaded', () => {
    initUIEngine();
    initTerminalCalendar();
    initDataHub();
    
    // System Clock
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. UI & NAVIGATION ---
function initUIEngine() {
    window.tab = (id) => {
        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));
        
        const target = document.getElementById(`${id}-tab`) || document.getElementById('generic-tab');
        if (target) target.classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === id);
        });

        const titleEl = document.getElementById('tab-title');
        if (titleEl) titleEl.innerText = `TERMINAL_${id.toUpperCase()}`;
        
        if (id === 'calendar' && calendar) {
            setTimeout(() => calendar.updateSize(), 50);
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
            const dateIn = document.getElementById('l-date');
            if (dateIn) dateIn.value = new Date().toISOString().split('T')[0];
        }
    };
}

// --- 3. DATABASE & CLOUD SYNC ---
async function initDataHub() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) {
            console.warn("Local Command Mode Active.");
            return;
        }

        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-smart-v23';

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
                startDataStreams();
            }
        });
    } catch (err) { 
        console.warn("Switching to Local Memory Storage."); 
    }
}

function startDataStreams() {
    if (!user || !db) return;
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendarData();
        renderAgenda();
    });
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs')), snap => {
        fleetData.driverLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDriverLogs();
    });
}

// --- 4. SMART AI INTAKE ---
window.handleSmartIntake = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('scan-loading');
    if (loader) loader.classList.remove('hidden');

    try {
        const base64 = await new Promise(res => {
            const r = new FileReader();
            r.readAsDataURL(file);
            r.onload = () => res(r.result.split(',')[1]);
        });
        
        const prompt = `Logistics Mode: Audit this receipt image. 
        Detect Merchant, Total Amount, Date, and Category (Diesel, Hotel, Repair, Toll, Food, or Inflow).
        Return ONLY a JSON object: {"vendor":string, "amount":number, "date":"YYYY-MM-DD", "category":string, "truckId":string, "details":string}`;

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

        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-cat').value = data.category || 'Diesel';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('v-details').value = data.details || '';
        
        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) {
        alert("AI processing error. Manual verify enabled.");
        document.getElementById('audit-modal').classList.remove('hidden');
    } finally {
        if (loader) loader.classList.add('hidden');
    }
};

// --- 5. DATA COMMITS (HYBRID ENGINE) ---
window.commitAuditLog = async () => {
    const val = {
        amount: parseFloat(document.getElementById('v-amount').value) || 0,
        vendor: document.getElementById('v-vendor').value,
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        category: document.getElementById('v-cat').value,
        date: document.getElementById('v-date').value,
        timestamp: Timestamp.now()
    };

    if (isLinked && user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), val);
    } else {
        fleetData.receipts.push({ ...val, id: Date.now().toString() });
        renderDashboard();
    }
    window.closeModal();
    window.tab('dashboard');
};

window.saveDriverLog = async () => {
    const val = {
        driver: document.getElementById('l-driver').value,
        truckId: document.getElementById('l-truck').value.toUpperCase(),
        date: document.getElementById('l-date').value,
        status: document.getElementById('l-status').value,
        timestamp: Timestamp.now()
    };

    if (!val.driver || !val.truckId) return alert("Missing Driver/Truck data");

    if (isLinked && user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'driverLogs'), val);
    } else {
        fleetData.driverLogs.push({ ...val, id: Date.now().toString() });
        renderDriverLogs();
    }
    window.closeModal();
};

window.saveEvent = async () => {
    const val = {
        title: document.getElementById('ev-title').value,
        truckId: document.getElementById('ev-truck').value.toUpperCase(),
        date: document.getElementById('ev-date').value,
        status: document.getElementById('ev-status').value,
        timestamp: Timestamp.now()
    };

    if (!val.title) return;

    if (isLinked && user) {
        if (activeId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId), val);
        else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), val);
    } else {
        if (activeId) {
            const idx = fleetData.jobs.findIndex(j => j.id === activeId);
            fleetData.jobs[idx] = { ...val, id: activeId };
        } else {
            fleetData.jobs.push({ ...val, id: Date.now().toString() });
        }
        syncCalendarData();
        renderAgenda();
    }
    window.closeModal();
};

// --- 6. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if (!stream) return;
    let bal = 0, burn = 0; stream.innerHTML = '';
    
    fleetData.receipts.sort((a,b) => b.date.localeCompare(a.date)).forEach(r => {
        const isIn = r.category === 'Inflow';
        bal += isIn ? r.amount : -r.amount;
        if (!isIn) burn += r.amount;
        
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group hover:bg-white/[0.01]";
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
    
    document.getElementById('total-display').innerText = `$${bal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    const burnEl = document.getElementById('burn-rate');
    if(burnEl) burnEl.innerText = `$${burn.toLocaleString()}`;
    lucide.createIcons();
}

function renderDriverLogs() {
    const container = document.getElementById('log-rows');
    if (!container) return;
    container.innerHTML = '';
    
    fleetData.driverLogs.forEach(l => {
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
            <td class="p-6 text-right"><button onclick="window.delLog('${l.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="14"></i></button></td>
        `;
        container.appendChild(tr);
    });
    lucide.createIcons();
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if (!stream) return;
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl mb-4";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 7. CALENDAR ---
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
    const dBtn = document.getElementById('modal-del-btn');
    if (id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        if (dBtn) dBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date;
        if (dBtn) dBtn.classList.add('hidden');
    }
    m.classList.remove('hidden');
};

function syncCalendarData() {
    if (!calendar) return;
    calendar.removeAllEvents();
    fleetData.jobs.forEach(j => calendar.addEvent({ id: j.id, title: j.title, start: j.date, color: '#3b82f6' }));
}

// --- 8. UTILS ---
window.delLog = async (id) => { 
    if (!confirm("Purge?")) return;
    if (isLinked) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'driverLogs', id));
    else { fleetData.driverLogs = fleetData.driverLogs.filter(x => x.id !== id); renderDriverLogs(); }
};
window.delRec = async (id) => { 
    if (!confirm("Purge?")) return;
    if (isLinked) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
    else { fleetData.receipts = fleetData.receipts.filter(x => x.id !== id); renderDashboard(); }
};
window.deleteEvent = async () => { 
    if (activeId && confirm("Purge Task?")) {
        if (isLinked) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeId));
        else { fleetData.jobs = fleetData.jobs.filter(x => x.id !== activeId); syncCalendarData(); renderAgenda(); }
        window.closeModal();
    }
};

window.exportFullReport = () => {
    const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.vendor, r.category, r.amount].join(","));
    const csv = "Date,Truck,Vendor,Category,Amount\n" + rows.join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Fleet_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

