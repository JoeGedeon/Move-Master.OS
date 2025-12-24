import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- CONFIG ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-command-v1';
const apiKey = ""; // Gemini API Injected

let user = null, receipts = [], jobs = [], calendar = null, selectedId = null;

// --- AUTH & SYNC ---
onAuthStateChanged(auth, async (u) => {
    if (!u) { 
        await signInAnonymously(auth); 
    } else {
        user = u;
        document.getElementById('user-id').innerText = user.uid.slice(0, 16);
        
        // Financials Sync
        onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), (snap) => {
            receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderDashboard();
        });
        
        // Dispatch Sync
        onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), (snap) => {
            jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            syncCalendarData();
            renderAgenda();
        });
    }
});

// --- CALENDAR RENDER ENGINE ---
function initCalendar() {
    const el = document.getElementById('fleet-calendar');
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
        dateClick: (info) => openEventModal(null, info.dateStr),
        eventClick: (info) => openEventModal(info.event.id)
    });
    calendar.render();
}

function syncCalendarData() {
    if (!calendar) return;
    calendar.removeAllEvents();
    jobs.forEach(j => {
        calendar.addEvent({ 
            id: j.id, 
            title: `${j.truckId || 'UNIT'}: ${j.title}`, 
            start: j.date, 
            color: j.status === 'Completed' ? '#10b981' : '#3b82f6' 
        });
    });
}

// --- TAB ENGINE ---
window.setTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(id + '-tab').classList.add('active');
    document.querySelectorAll('.nav-btn-sidebar').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.getElementById('active-title').innerHTML = `<i data-lucide="chevron-right" size="14"></i> Fleet ${id.charAt(0).toUpperCase() + id.slice(1)}`;
    lucide.createIcons();
    if (id === 'calendar' && calendar) {
        setTimeout(() => calendar.updateSize(), 50);
    }
};

// --- DATA HANDLERS ---
function renderDashboard() {
    const container = document.getElementById('logs-container');
    let bal = 0; container.innerHTML = '';
    const trucks = new Set();
    
    receipts.forEach(r => {
        const isInc = r.category.toLowerCase().includes('income');
        bal = isInc ? bal + r.amount : bal - r.amount;
        if(r.truckId) trucks.add(r.truckId.toUpperCase());
        
        const row = document.createElement('div');
        row.className = "p-8 flex justify-between items-center group transition-all";
        row.innerHTML = `
            <div class="flex gap-8 items-center">
                <i data-lucide="${isInc ? 'arrow-up-right' : 'arrow-down-left'}" class="${isInc ? 'text-green-500' : 'text-red-500'}"></i>
                <div class="text-left">
                    <h4 class="font-black text-xl text-white">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mt-2">${r.truckId} • ${r.location}</p>
                </div>
            </div>
            <button onclick="window.delAudit('${r.id}')" class="text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100"><i data-lucide="trash-2" size="18"></i></button>
        `;
        container.appendChild(row);
    });
    document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
    document.getElementById('truck-count').innerText = trucks.size;
    lucide.createIcons();
}

function renderAgenda() {
    const container = document.getElementById('agenda-list');
    const today = new Date().toISOString().split('T')[0];
    const todayJobs = jobs.filter(j => j.date === today);
    container.innerHTML = todayJobs.length ? '' : '<p class="text-[10px] text-slate-600 italic">No events scheduled.</p>';
    
    todayJobs.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-4 bg-white/[0.02] border border-white/5 rounded-2xl";
        div.innerHTML = `
            <div class="flex items-center gap-2 mb-2"><span class="w-1.5 h-1.5 rounded-full ${j.status === 'Completed' ? 'bg-green-500' : 'bg-blue-500'}"></span><p class="text-[10px] font-black uppercase text-slate-500">${j.truckId || 'GEN'}</p></div>
            <p class="text-xs font-bold leading-relaxed">${j.title}</p>
        `;
        container.appendChild(div);
    });
}

// --- MODAL CONTROLS ---
function openEventModal(id = null, dateStr = null) {
    selectedId = id;
    const modal = document.getElementById('event-modal');
    const delBtn = document.getElementById('del-event-btn');
    if(id) {
        const job = jobs.find(j => j.id === id);
        document.getElementById('ev-title').value = job.title;
        document.getElementById('ev-truck').value = job.truckId;
        document.getElementById('ev-date').value = job.date;
        document.getElementById('ev-status').value = job.status;
        delBtn.classList.remove('hidden');
    } else {
        document.getElementById('ev-title').value = '';
        document.getElementById('ev-truck').value = '';
        document.getElementById('ev-date').value = dateStr;
        document.getElementById('ev-status').value = 'Pending';
        delBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

window.closeEventModal = () => document.getElementById('event-modal').classList.add('hidden');

document.getElementById('save-event-btn').onclick = async () => {
    const title = document.getElementById('ev-title').value;
    const truckId = document.getElementById('ev-truck').value;
    const date = document.getElementById('ev-date').value;
    const status = document.getElementById('ev-status').value;
    if(!title || !user) return;
    if(selectedId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', selectedId), { title, truckId, date, status });
    else await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { title, truckId, date, status, timestamp: Timestamp.now() });
    closeEventModal();
};

document.getElementById('del-event-btn').onclick = async () => {
    if(!selectedId || !user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', selectedId));
    closeEventModal();
};

// --- OCR SCANNER ---
window.processOCR = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    document.getElementById('scan-loading').classList.remove('hidden');
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload = async () => {
        const b64 = r.result.split(',')[1];
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ contents: [{role: "user", parts: [{text: "OCR receipt. Return JSON: {vendor, amount, date, truckId}."}, {inlineData: {mimeType: "image/png", data: b64}}]}], generationConfig: { responseMimeType: "application/json" } })
        });
        const d = await res.json();
        const data = JSON.parse(d.candidates[0].content.parts[0].text);
        document.getElementById('v-amount').value = data.amount || '';
        document.getElementById('v-loc').value = data.vendor || '';
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('scan-loading').classList.add('hidden');
        document.getElementById('audit-modal').classList.remove('hidden');
    };
};

// --- START ---
window.onload = () => {
    initCalendar();
    lucide.createIcons();
};

window.delAudit = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
window.exportFullReport = () => {
    const rows = receipts.map(r => [r.date, r.truckId, r.category, r.amount, r.location].join(","));
    const csv = "Date,Truck,Type,Amount,Location\n" + rows.join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Fleet_Dump.csv"; a.click();
};

