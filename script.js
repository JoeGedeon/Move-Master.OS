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
    await initCloudSync();
    initTerminalCalendar();
    lucide.createIcons();
    
    // Live Clock
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 3. CLOUD SYNC ENGINE (Firebase) ---
async function initCloudSync() {
    try {
        const firebaseConfig = JSON.parse(__firebase_config);
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-hub-v17';

        // Auth handling (Rule 3)
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (u) => {
            if (u) {
                user = u;
                document.getElementById('user-id-tag').innerText = user.uid.slice(0, 10) + "_SYNC";
                startDataStreams();
            }
        });
    } catch (e) {
        console.warn("Terminal running in offline/local mode.");
    }
}

function startDataStreams() {
    if (!user) return;

    // Stream 1: Financial Ledger
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    }, err => console.error("Ledger Sync Error:", err));

    // Stream 2: Dispatch Jobs
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        syncCalendarData();
        renderAgenda();
    }, err => console.error("Dispatch Sync Error:", err));

    // Stream 3: Truck Units
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), snap => {
        fleetData.trucks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Add render logic if units panel is active
    }, err => console.error("Truck Sync Error:", err));
}

// --- 4. NAVIGATION & UI ENGINE ---
function setupTerminalUI() {
    window.tab = (id) => {
        const panels = document.querySelectorAll('.tab-panel');
        panels.forEach(p => p.classList.remove('active'));
        
        const target = document.getElementById(id + '-tab') || document.getElementById('generic-tab');
        target.classList.add('active');
        
        // Sidebar active state
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === id);
        });

        document.getElementById('tab-title').innerText = "Terminal_" + id.toUpperCase();
        
        // Refresh Calendar size if switched to
        if(id === 'calendar' && calendar) {
            setTimeout(() => calendar.updateSize(), 50);
        }
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.getElementById('event-modal').classList.add('hidden');
    };
}

// --- 5. CALENDAR ENGINE (The Front Window) ---
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
        dateClick: (info) => openModal(null, info.dateStr),
        eventClick: (info) => openModal(info.event.id)
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

// --- 6. SMART AI SCANNER (OCR Engine) ---
window.handleOCR = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading state in UI
    const streamContainer = document.getElementById('agenda-stream');
    const originalContent = streamContainer.innerHTML;
    streamContainer.innerHTML = `<div class="text-blue-500 animate-pulse text-[10px] font-black uppercase text-center py-10 tracking-widest">AI_ANALYZING_RECEIPT...</div>`;

    try {
        const base64 = await toBase64(file);
        const prompt = "Logistics Mode: OCR this receipt. Return ONLY JSON: {vendor, amount (number), date (YYYY-MM-DD), truckId, category}.";
        
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
        
        // Auto-fill modal for verification
        openAuditModal(data);
    } catch (err) {
        alert("AI Scanner bypassed. Please enter data manually.");
        openAuditModal({});
    } finally {
        streamContainer.innerHTML = originalContent;
    }
};

const toBase64 = f => new Promise(res => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result.split(',')[1]); });

// --- 7. SMART AI AUDITOR (Contextual Chat) ---
window.askAuditor = async (queryText) => {
    const context = `
        FLEET_CONTEXT:
        Balance: ${document.getElementById('total-display').innerText}
        Active_Units: ${fleetData.trucks.length}
        Pending_Jobs: ${fleetData.jobs.filter(j => j.status !== 'Completed').length}
        Recent_Logs: ${JSON.stringify(fleetData.receipts.slice(0,5))}
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{parts: [{text: `${context}\n\nUSER_QUERY: ${queryText}`}]}],
                systemInstruction: { parts: [{text: "You are the Fleet Pro System Auditor. Be professional, concise, and use the provided fleet data to provide exact insights."}]}
            })
        });
        const result = await response.json();
        return result.candidates[0].content.parts[0].text;
    } catch (err) {
        return "Terminal connection error. Check system logs.";
    }
};

// --- 8. RENDERERS ---
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
            <button onclick="deleteRecord('${r.id}')" class="text-slate-800 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i data-lucide="trash-2"></i></button>
        `;
        stream.appendChild(div);
    });
    
    document.getElementById('total-display').innerText = `$${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('truck-stat').innerText = new Set(fleetData.receipts.map(r => r.truckId)).size;
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

// --- 9. MODAL & DATA HANDLERS ---
function openModal(id = null, date = null) {
    activeEditId = id;
    const modal = document.getElementById('event-modal');
    const delBtn = document.getElementById('modal-del-btn');
    
    if(id) {
        const j = fleetData.jobs.find(x => x.id === id);
        document.getElementById('ev-title').value = j.title;
        document.getElementById('ev-truck').value = j.truckId;
        document.getElementById('ev-date').value = j.date;
        document.getElementById('ev-status').value = j.status;
        delBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = date || new Date().toISOString().split('T')[0];
        document.getElementById('ev-status').value = 'Pending';
        delBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

window.saveEvent = async () => {
    const d = { 
        title: document.getElementById('ev-title').value, 
        truckId: document.getElementById('ev-truck').value.toUpperCase(), 
        date: document.getElementById('ev-date').value, 
        status: document.getElementById('ev-status').value 
    };
    
    if(!d.title || !user) return;

    if(activeEditId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', activeEditId), d);
    } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { ...d, timestamp: Timestamp.now() });
    }
    closeModal();
};

window.deleteRecord = async (id) => {
    if(confirm("Confirm deletion?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
    }
};

window.exportFullReport = () => {
    if(!fleetData.receipts.length) return alert("No data to export.");
    const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.amount, r.location].join(","));
    const csv = "Date,Truck,Amount,Merchant\n" + rows.join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Fleet_Audit_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

// Expose functions to HTML onclick
window.openModal = openModal;

