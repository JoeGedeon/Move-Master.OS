import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-hub-premium-v1';
const apiKey = ""; 

let user = null;
let auditLogs = [];
let fleetJobs = [];
let chartInstance = null;

// --- AUTH & SYNC ---
onAuthStateChanged(auth, async (u) => {
    if (!u) {
        await signInAnonymously(auth);
    } else {
        user = u;
        // Sync Financials
        const qAudit = query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'));
        onSnapshot(qAudit, (snap) => {
            auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            auditLogs.sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            renderDashboard();
            updateChart();
        });
        // Sync Jobs
        const qJobs = query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'));
        onSnapshot(qJobs, (snap) => {
            fleetJobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            document.getElementById('job-count-display').innerText = fleetJobs.filter(j => j.status !== 'Completed').length;
            renderJobs();
        });
    }
});

// --- RENDERERS ---

function renderDashboard() {
    const container = document.getElementById('logs-container');
    const totalDisplay = document.getElementById('total-display');
    let balance = 0;
    container.innerHTML = '';

    if (auditLogs.length === 0) {
        container.innerHTML = `<div class="p-20 text-center text-slate-600 font-black uppercase text-xs tracking-widest">No transaction history found</div>`;
    }

    auditLogs.forEach(r => {
        const isRevenue = r.category.toLowerCase().includes('revenue') || r.category.toLowerCase().includes('income');
        balance = isRevenue ? balance + r.amount : balance - r.amount;

        const row = document.createElement('div');
        row.className = "audit-row p-6 flex justify-between items-center group";
        row.innerHTML = `
            <div class="flex items-center gap-6">
                <div class="h-12 w-12 rounded-2xl bg-[#0b0f1a] border border-white/5 flex items-center justify-center">
                    <i data-lucide="${isRevenue ? 'arrow-up-right' : 'arrow-down-left'}" class="${isRevenue ? 'text-blue-400' : 'text-slate-500'}" size="20"></i>
                </div>
                <div>
                    <h4 class="font-black text-white tracking-tight leading-none">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2">
                        <span class="text-blue-500">${r.truckId || 'GEN-UNIT'}</span> • ${r.location || 'Local Merchant'}
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-8">
                <span class="hidden md:block text-[10px] font-black text-slate-600 uppercase tracking-widest">${r.date}</span>
                <button onclick="window.delAudit('${r.id}')" class="text-slate-800 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                    <i data-lucide="trash-2" size="18"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });

    totalDisplay.innerText = `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    lucide.createIcons();
}

function renderJobs() {
    const container = document.getElementById('jobs-container');
    container.innerHTML = '';
    
    fleetJobs.forEach(j => {
        const card = document.createElement('div');
        card.className = "bg-[#111827] border border-white/5 p-8 rounded-[2.5rem] flex flex-col justify-between shadow-xl";
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-6">
                    <span class="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] bg-blue-500/10 px-3 py-1 rounded-lg">Dispatching</span>
                    <button onclick="window.delJob('${j.id}')" class="text-slate-700 hover:text-red-500"><i data-lucide="trash-2" size="16"></i></button>
                </div>
                <h4 class="text-xl font-black mb-2">${j.title}</h4>
                <p class="text-xs text-slate-500 font-bold uppercase tracking-widest">${j.truckId}</p>
            </div>
            <div class="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                <span class="text-[10px] font-black uppercase text-slate-600 tracking-widest">${j.status}</span>
                ${j.status !== 'Completed' ? `<button onclick="window.finishJob('${j.id}')" class="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20"><i data-lucide="check" size="20"></i></button>` : '<i data-lucide="check-circle-2" class="text-green-500" size="24"></i>'}
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

// --- TAB SYSTEM ---
window.setTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(id + '-tab').classList.add('active');
    
    document.querySelectorAll('.nav-btn-sidebar').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    document.querySelectorAll('.nav-btn-mob').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    
    document.getElementById('page-title').innerText = id.toUpperCase() + " HUB CONSOLE";
    lucide.createIcons();
};

// --- CHARTING (The Look from your image) ---
function updateChart() {
    const ctx = document.getElementById('mini-chart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const labels = auditLogs.slice(0, 10).map(l => l.date).reverse();
    const data = auditLogs.slice(0, 10).map(l => l.amount).reverse();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: '#3b82f6',
                borderWidth: 4,
                tension: 0.4,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.05)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}

// --- CAMERA & OCR ---
window.handleOCR = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    document.getElementById('scan-loading').classList.remove('hidden');
    
    const preview = document.getElementById('scan-preview');
    const init = document.getElementById('scan-init');
    const reader = new FileReader();
    reader.onload = (ev) => { preview.src = ev.target.result; preview.classList.remove('hidden'); init.classList.add('hidden'); };
    reader.readAsDataURL(file);

    try {
        const b64 = await toB64(file);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: "OCR receipt. Return JSON: {vendor, amount, date, category, truckId}."}, {inlineData: {mimeType: "image/png", data: b64}}]}],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        const d = await res.json();
        const data = JSON.parse(d.candidates[0].content.parts[0].text);
        
        document.getElementById('v-amount').value = data.amount || '';
        document.getElementById('v-loc').value = data.vendor || '';
        document.getElementById('v-date').value = data.date || new Date().toISOString().split('T')[0];
        document.getElementById('v-truck').value = data.truckId || '';
        
        document.getElementById('modal-overlay').classList.remove('hidden');
    } catch (err) { alert("AI Service busy. Manual verification required."); document.getElementById('modal-overlay').classList.remove('hidden'); }
    finally { document.getElementById('scan-loading').classList.add('hidden'); }
};

const toB64 = f => new Promise(res => { const r = new FileReader(); r.readAsDataURL(f); r.onload = () => res(r.result.split(',')[1]); });

// --- CALCULATOR ---
let cV = '0', cM = null, cO = null, cW = false;
const layout = ['C','/','*','Del', 7,8,9,'-', 4,5,6,'+', 1,2,3,'=', 0,'.'];
const board = document.getElementById('calc-board');

layout.forEach(k => {
    const b = document.createElement('button');
    b.innerText = k === 'Del' ? '←' : k;
    b.className = `h-16 rounded-2xl font-black text-xl active:scale-95 transition-all ${typeof k === 'number' ? 'bg-[#111827] text-white' : 'bg-[#0b0f1a] text-blue-500'}`;
    if(k === '=') b.className = "h-16 rounded-2xl font-black text-xl bg-blue-600 text-white col-span-2 shadow-lg";
    b.onclick = () => {
        if(typeof k === 'number' || k === '.') {
            if(cW) { cV = String(k); cW = false; }
            else cV = cV === '0' ? String(k) : cV + k;
        } else if(k === 'C') { cV = '0'; cM = null; cO = null; }
        else if(k === 'Del') { cV = cV.length > 1 ? cV.slice(0, -1) : '0'; }
        else if(k === '=') { if(cO) cV = String(calc(cM, parseFloat(cV), cO)); cM = null; cO = null; cW = true; }
        else { if(cM === null) cM = parseFloat(cV); else if(cO) cM = calc(cM, parseFloat(cV), cO); cO = k; cW = true; }
        document.getElementById('calc-display').innerText = cV;
    };
    board.appendChild(b);
});
const calc = (a,b,o) => o==='+'?a+b : o==='-'?a-b : o==='*'?a*b : o==='/'?a/b : b;

window.exportCalcValue = () => {
    document.getElementById('v-amount').value = cV;
    document.getElementById('modal-overlay').classList.remove('hidden');
};

// --- HELPERS ---
window.delAudit = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
window.delJob = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', id));
window.finishJob = async (id) => await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', id), { status: 'Completed' });

document.getElementById('save-job-btn').onclick = async () => {
    const title = document.getElementById('j-title').value;
    const truckId = document.getElementById('j-truck').value || "UNASSIGNED";
    const status = document.getElementById('j-status').value;
    if(!title || !user) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { title, truckId, status, timestamp: Timestamp.now() });
    document.getElementById('job-modal').classList.add('hidden');
};

document.getElementById('commit-btn').onclick = async () => {
    const amount = parseFloat(document.getElementById('v-amount').value);
    const truckId = document.getElementById('v-truck').value || "GEN";
    const category = document.getElementById('v-cat').value;
    const date = document.getElementById('v-date').value;
    const location = document.getElementById('v-loc').value || 'Manual Entry';
    if(!amount || !user) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), { amount, truckId, category, date, location, timestamp: Timestamp.now() });
    document.getElementById('modal-overlay').classList.add('hidden');
};

// Clock
setInterval(() => {
    document.getElementById('live-time').innerText = new Date().toLocaleTimeString();
}, 1000);

