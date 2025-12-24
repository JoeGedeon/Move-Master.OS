
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, deleteDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// 1. CONFIGURATION
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-pro-v1';
const apiKey = ""; 

let user = null;
let auditLogs = [];
let fleetJobs = [];

// 2. AUTH & SYNC (Rule 1, 2, 3)
onAuthStateChanged(auth, async (u) => {
    if (!u) {
        await signInAnonymously(auth);
    } else {
        user = u;
        // Sync Audit Records
        onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts')), (snap) => {
            auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            auditLogs.sort((a,b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
            renderAudit();
        });
        // Sync Job Records
        onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), (snap) => {
            fleetJobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderJobs();
        });
    }
});

// 3. RENDER DASHBOARD (Audit Logs)
function renderAudit() {
    const container = document.getElementById('logs-container');
    let balance = 0;
    const trucks = new Set();
    container.innerHTML = '';

    auditLogs.forEach(r => {
        const isRevenue = r.category.toLowerCase().includes('revenue');
        balance = isRevenue ? balance + r.amount : balance - r.amount;
        if(r.truckId) trucks.add(r.truckId.toUpperCase());

        const div = document.createElement('div');
        div.className = "bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50 flex justify-between items-center animate-in";
        div.innerHTML = `
            <div class="flex gap-4 items-center">
                <div class="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center">
                    <i data-lucide="${isRevenue ? 'trending-up' : 'trending-down'}" class="${isRevenue ? 'text-green-500' : 'text-red-400'}" size="18"></i>
                </div>
                <div class="text-left">
                    <h4 class="font-black text-slate-800">$${r.amount.toFixed(2)}</h4>
                    <p class="text-[9px] text-slate-400 font-bold uppercase mt-1">${r.truckId} • ${r.location}</p>
                </div>
            </div>
            <button onclick="window.delRecord('${r.id}')" class="text-slate-200 hover:text-red-500"><i data-lucide="trash-2" size="16"></i></button>
        `;
        container.appendChild(div);
    });
    document.getElementById('total-display').innerText = `$${balance.toLocaleString()}`;
    document.getElementById('truck-count').innerText = trucks.size;
    lucide.createIcons();
}

// 4. RENDER JOBS
function renderJobs() {
    const container = document.getElementById('jobs-container');
    container.innerHTML = '';
    if(fleetJobs.length === 0) container.innerHTML = `<p class="py-12 text-center text-slate-300 font-bold">Zero active fleet tasks.</p>`;
    
    fleetJobs.forEach(j => {
        const div = document.createElement('div');
        div.className = "bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex justify-between items-center";
        div.innerHTML = `
            <div class="text-left">
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-2 h-2 rounded-full ${j.status === 'Completed' ? 'bg-green-500' : 'bg-blue-500'}"></span>
                    <h4 class="font-black text-slate-800 leading-tight">${j.title}</h4>
                </div>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">${j.truckId} • ${j.status}</p>
            </div>
            <div class="flex gap-2">
                ${j.status !== 'Completed' ? `<button onclick="window.finishJob('${j.id}')" class="bg-green-50 p-2 text-green-600 rounded-lg"><i data-lucide="check" size="18"></i></button>` : ''}
                <button onclick="window.delJob('${j.id}')" class="text-slate-200"><i data-lucide="trash-2" size="18"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// Global Handlers
window.delRecord = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'receipts', id));
window.delJob = async (id) => await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', id));
window.finishJob = async (id) => await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'jobs', id), { status: 'Completed' });

// 5. MONTHLY DATA DUMP (CSV Consolidation)
document.getElementById('dump-report').onclick = () => {
    if(auditLogs.length === 0) return alert("No data to export.");
    
    const groups = auditLogs.reduce((acc, r) => {
        const tid = r.truckId || "GENERAL";
        if(!acc[tid]) acc[tid] = { revenue: 0, fuel: 0, repair: 0, toll: 0, sources: [] };
        const cat = r.category.toLowerCase();
        if(cat.includes('revenue')) acc[tid].revenue += r.amount;
        else if(cat.includes('fuel')) acc[tid].fuel += r.amount;
        else if(cat.includes('repair')) acc[tid].repair += r.amount;
        else acc[tid].toll += r.amount;
        acc[tid].sources.push(r.location);
        return acc;
    }, {});

    let csv = "TRUCK_ID,REVENUE,FUEL_COST,REPAIR_COST,TOLLS,NET_PROFIT,RESOURCE_SOURCES\n";
    Object.keys(groups).forEach(tid => {
        const g = groups[tid];
        const net = g.revenue - (g.fuel + g.repair + g.toll);
        csv += `${tid},${g.revenue},${g.fuel},${g.repair},${g.toll},${net},"${[...new Set(g.sources)].join(" | ")}"\n`;
    });

    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Fleet_Master_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
};

// 6. JOBS & AUDIT MODALS
document.getElementById('new-job-btn').onclick = () => document.getElementById('job-modal').classList.remove('hidden');
document.getElementById('close-job-modal').onclick = () => document.getElementById('job-modal').classList.add('hidden');
document.getElementById('save-job-btn').onclick = async () => {
    const title = document.getElementById('j-title').value;
    const truckId = document.getElementById('j-truck').value || "GEN";
    const status = document.getElementById('j-status').value;
    if(!title || !user) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs'), { title, truckId, status, timestamp: Timestamp.now() });
    document.getElementById('job-modal').classList.add('hidden');
    document.getElementById('j-title').value = '';
};

// 7. AI SCANNER (OCR)
const handleImage = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const loader = document.getElementById('scan-loading');
    const preview = document.getElementById('scan-preview');
    const init = document.getElementById('scan-init');
    
    const reader = new FileReader();
    reader.onload = (ev) => { preview.src = ev.target.result; preview.classList.remove('hidden'); init.classList.add('hidden'); };
    reader.readAsDataURL(file);

    loader.classList.remove('hidden');

    try {
        const base64 = await toB64(file);
        const prompt = "OCR this receipt. Return ONLY JSON: {vendor, amount (number), date (YYYY-MM-DD), category, truckId}.";
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{role: "user", parts: [{text: prompt}, {inlineData: {mimeType: "image/png", data: base64}}]}],
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
    } catch (err) {
        alert("OCR Manual Bypass.");
        document.getElementById('modal-overlay').classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
        e.target.value = '';
    }
};

const toB64 = f => new Promise(r => { const reader = new FileReader(); reader.readAsDataURL(f); reader.onload = () => r(reader.result.split(',')[1]); });
document.getElementById('camera-input').onchange = handleImage;
document.getElementById('gallery-input').onchange = handleImage;
document.getElementById('cam-trigger').onclick = () => document.getElementById('camera-input').click();
document.getElementById('gal-trigger').onclick = () => document.getElementById('gallery-input').click();

// 8. CALCULATOR Logic
let val = '0', mem = null, op = null, wait = false;
const cb = document.getElementById('calc-board');
['C','/','*','Del', 7,8,9,'-', 4,5,6,'+', 1,2,3,'=', 0,'.'].forEach(k => {
    const b = document.createElement('button');
    b.innerText = k === 'Del' ? '←' : k;
    b.className = `h-16 rounded-2xl font-black text-xl shadow-sm btn-press ${typeof k === 'number' ? 'bg-white' : 'bg-slate-100 text-blue-600'}`;
    if(k === '=') b.className = "h-16 rounded-2xl font-black text-xl bg-blue-600 text-white col-span-2 shadow-lg shadow-blue-100";
    b.onclick = () => {
        if(typeof k === 'number' || k === '.') {
            if(wait) { val = String(k); wait = false; }
            else val = val === '0' ? String(k) : val + k;
        } else if(k === 'C') { val = '0'; mem = null; op = null; }
        else if(k === 'Del') { val = val.length > 1 ? val.slice(0, -1) : '0'; }
        else if(k === '=') { if(op) val = String(solve(mem, parseFloat(val), op)); mem = null; op = null; wait = true; }
        else { if(mem === null) mem = parseFloat(val); else if(op) mem = solve(mem, parseFloat(val), op); op = k; wait = true; }
        document.getElementById('calc-view').innerText = val;
    };
    cb.appendChild(b);
});
const solve = (a,b,o) => o==='+'?a+b : o==='-'?a-b : o==='*'?a*b : o==='/'?a/b : b;
document.getElementById('calc-export').onclick = () => {
    document.getElementById('v-amount').value = val;
    document.getElementById('modal-overlay').classList.remove('hidden');
};

// 9. FINAL COMMIT
document.getElementById('close-modal').onclick = () => document.getElementById('modal-overlay').classList.add('hidden');
document.getElementById('commit-btn').onclick = async () => {
    const amount = parseFloat(document.getElementById('v-amount').value);
    const truckId = document.getElementById('v-truck').value || "GEN";
    const category = document.getElementById('v-cat').value;
    const date = document.getElementById('v-date').value;
    const location = document.getElementById('v-loc').value || 'System';
    if(!amount || !user) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'receipts'), { amount, truckId, category, date, location, timestamp: Timestamp.now() });
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelector('[data-tab="logs"]').click();
};

// 10. NAV HANDLER
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('text-blue-600', 'active'));
        btn.classList.add('text-blue-600', 'active');
        lucide.createIcons();
    }
});

