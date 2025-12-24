import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- SYSTEM STATE ---
let auth, db, user, appId, calendar;
let fleetData = { receipts: [], jobs: [] };
const apiKey = ""; // Injected via environment

// --- 1. BOOT SEQUENCE ---
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    initCalendar();
    initDatabase();
    
    setInterval(() => {
        const clock = document.getElementById('live-clock');
        if(clock) clock.innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// --- 2. UI HANDLERS ---
function initUI() {
    window.tab = (id) => {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(id + '-tab') || document.getElementById('generic-tab');
        if(target) target.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
        document.getElementById('tab-title').innerText = "Terminal_" + id.toUpperCase();
        if(id === 'calendar' && calendar) { setTimeout(() => calendar.updateSize(), 50); }
        lucide.createIcons();
    };

    window.closeModal = () => {
        document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden'));
    };
}

// --- 3. DATABASE ENGINE ---
async function initDatabase() {
    try {
        const configStr = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
        if (!configStr) throw "Offline";
        const app = initializeApp(JSON.parse(configStr));
        auth = getAuth(app);
        db = getFirestore(app);
        appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v20';

        onAuthStateChanged(auth, async (u) => {
            if (u) {
                user = u;
                startDataSync();
            } else { await signInAnonymously(auth); }
        });
    } catch (e) { console.warn("Cloud Sync Inactive."); }
}

function startDataSync() {
    // Receipts Ledger Stream
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), snap => {
        fleetData.receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDashboard();
    });
    // Jobs Stream
    onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), snap => {
        fleetData.jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAgenda();
    });
}

// --- 4. SMART AI INTAKE ENGINE ---
window.handleSmartIntake = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('scan-ui-loading');
    loader.classList.remove('hidden');

    try {
        const base64 = await toBase64(file);
        
        // PROMPT: Expert Logistics Auditor
        const prompt = `Act as an expert logistics auditor. Extract data from this receipt. 
        Return ONLY a JSON object: 
        {
            "vendor": "Merchant Name",
            "amount": number_total_cost,
            "date": "YYYY-MM-DD",
            "category": "Diesel" | "Hotel" | "Repair" | "Toll" | "Food" | "Other",
            "truckId": "Detected Unit ID or empty",
            "details": "Gallons, room count, or specific items"
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

        // Pre-fill Modal for user verification
        document.getElementById('v-truck').value = data.truckId || '';
        document.getElementById('v-amount').value = data.amount || 0;
        document.getElementById('v-vendor').value = data.vendor || '';
        document.getElementById('v-cat').value = data.category || 'Diesel';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('v-details').value = data.details || '';

        document.getElementById('audit-modal').classList.remove('hidden');
    } catch (err) {
        alert("AI error. Reverting to manual entry.");
        document.getElementById('audit-modal').classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
};

const toBase64 = f => new Promise(res => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result.split(',')[1]); });

window.commitAuditLog = async () => {
    const entry = {
        amount: parseFloat(document.getElementById('v-amount').value),
        truckId: document.getElementById('v-truck').value.toUpperCase(),
        vendor: document.getElementById('v-vendor').value,
        category: document.getElementById('v-cat').value,
        date: document.getElementById('v-date').value,
        details: document.getElementById('v-details').value,
        timestamp: Timestamp.now()
    };

    if (user && db) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), entry);
    }
    window.closeModal();
    window.tab('dashboard');
};

// --- 5. RENDERERS ---
function renderDashboard() {
    const stream = document.getElementById('ledger-stream');
    if(!stream) return;
    let balance = 0; stream.innerHTML = '';
    
    fleetData.receipts.sort((a,b) => b.date.localeCompare(a.date)).forEach(r => {
        const isInc = r.category === 'Income';
        balance = isInc ? balance + r.amount : balance - r.amount;
        
        const div = document.createElement('div');
        div.className = "p-10 flex justify-between items-center group hover:bg-white/[0.01] transition-all";
        div.innerHTML = `
            <div class="flex items-center gap-10">
                <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-blue-400">
                    <i data-lucide="${getIcon(r.category)}"></i>
                </div>
                <div>
                    <h4 class="font-black text-2xl tracking-tighter text-white">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mt-2">
                        ${r.vendor} • <span class="text-blue-500">${r.category}</span> • ${r.truckId}
                    </p>
                    ${r.details ? `<p class="text-[10px] italic text-slate-600 mt-1">${r.details}</p>` : ''}
                </div>
            </div>
            <button onclick="window.delRec('${r.id}')" class="text-slate-800 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><i data-lucide="trash-2"></i></button>
        `;
        stream.appendChild(div);
    });
    
    document.getElementById('total-display').innerText = `$${balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('stat-log-count').innerText = fleetData.receipts.length;
    lucide.createIcons();
}

function getIcon(cat) {
    switch(cat) {
        case 'Diesel': return 'fuel';
        case 'Hotel': return 'bed';
        case 'Repair': return 'wrench';
        case 'Food': return 'coffee';
        default: return 'file-text';
    }
}

function renderAgenda() {
    const stream = document.getElementById('agenda-stream');
    if(!stream) return;
    const today = new Date().toISOString().split('T')[0];
    const list = fleetData.jobs.filter(j => j.date === today);
    stream.innerHTML = list.length ? '' : '<p class="text-[10px] text-slate-700 italic text-center py-20 uppercase">Clear Sky</p>';
    list.forEach(j => {
        const div = document.createElement('div');
        div.className = "p-6 bg-white/[0.03] border border-white/5 rounded-3xl animate-in";
        div.innerHTML = `<p class="text-[10px] font-black text-blue-500 uppercase">${j.truckId}</p><p class="text-sm font-bold text-white">${j.title}</p>`;
        stream.appendChild(div);
    });
}

// --- 6. UTILS ---
function initCalendar() {
    const el = document.getElementById('calendar-render');
    if(!el) return;
    calendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        height: '100%', editable: true
    });
    calendar.render();
}

window.delRec = async (id) => { if(confirm("Purge record?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id)); };

window.exportFullReport = () => {
    const rows = fleetData.receipts.map(r => [r.date, r.truckId, r.vendor, r.category, r.amount].join(","));
    const csv = "Date,Truck,Vendor,Category,Amount\n" + rows.join("\n");
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Fleet_Ledger.csv"; a.click();
};

