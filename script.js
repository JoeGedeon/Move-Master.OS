import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- GLOBAL STATE ---
let auth, db, user, appId, dashCal;
let fleetData = { trucks: [], jobs: [], receipts: [], clients: [] };

// --- 1. THE COMMANDER: NAVIGATION & CALENDAR REFRESH ---
window.tab = (id) => {
    // Hide all
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    
    // Show selected
    const target = document.getElementById(`${id}-tab`);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
        
        // Refresh visuals
        if(id === 'dashboard') renderDashboard();
        if(id === 'trucks') renderTrucksSpreadsheet();

        // THE CALENDAR WAKEUP CALL
        if(id === 'dashboard' && dashCal) { 
            setTimeout(() => { 
                dashCal.updateSize(); 
                dashCal.render(); 
            }, 100); 
        }
    }
    
    // Navigation Lighting
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });

    const titleEl = document.getElementById('tab-title');
    if (titleEl) titleEl.innerText = `${id.toUpperCase()}_OPERATIONS_MASTER`;
    lucide.createIcons();
};

window.closeModal = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

// --- 2. GOOGLE-STYLE CALENDAR ENGINE ---

function initCalendars() {
    const calendarEl = document.getElementById('dash-calendar');
    if (!calendarEl) return;

    dashCal = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        editable: true,
        selectable: true,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        // Populate events from our global fleetData
        events: fleetData.jobs.map(j => ({
            title: j.title,
            start: j.date,
            color: '#3b82f6',
            allDay: true
        })),
        dateClick: (info) => {
            const dateIn = document.getElementById('ev-date');
            if(dateIn) dateIn.value = info.dateStr;
            document.getElementById('event-modal').classList.remove('hidden');
        },
        eventClick: (info) => {
            // Future logic for editing events
        }
    });

    dashCal.render();
}

function syncCalendarEvents() {
    if (dashCal) {
        dashCal.removeAllEvents();
        const events = fleetData.jobs.map(j => ({
            title: j.title,
            start: j.date,
            color: '#3b82f6'
        }));
        dashCal.addEventSource(events);
    }
}

// --- 3. DATA & DASHBOARD LOGIC (STILL INTERACTIVE) ---

function renderDashboard() {
    // Stat Tiles remain interactive
    const revCard = document.getElementById('dash-revenue-tile');
    if (revTile) {
        let bal = fleetData.receipts.reduce((s, r) => s + (r.category === 'Inflow' ? r.amount : -r.amount), 0);
        document.getElementById('total-display').innerText = `$${bal.toLocaleString()}`;
        revTile.onclick = () => window.tab('clients');
    }

    const truckStat = document.getElementById('dash-trucks-tile');
    if (truckStat) {
        document.getElementById('truck-count-display').innerText = fleetData.trucks.length;
        truckStat.onclick = () => window.tab('trucks');
    }
}

// --- 4. BOOT SEQUENCE ---

window.addEventListener('load', () => {
    lucide.createIcons();
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if(el) el.innerText = new Date().toLocaleTimeString();
    }, 1000);

    // Boot Firebase (Rule 3)
    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    db = getFirestore(app);
    auth = getAuth(app);
    appId = typeof __app_id !== 'undefined' ? __app_id : 'fleet-v45-master';

    onAuthStateChanged(auth, u => {
        if(u) {
            user = u;
            document.getElementById('user-id-tag').innerText = `ID_${u.uid.slice(0, 6)}`;
            
            // Listeners
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'trucks')), s => {
                fleetData.trucks = s.docs.map(d => ({ id: d.id, ...d.data() }));
                renderDashboard();
            });
            onSnapshot(query(collection(db, 'artifacts', appId, 'users', user.uid, 'jobs')), s => {
                fleetData.jobs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                syncCalendarEvents();
            });
        } else {
            signInAnonymously(auth);
        }
    });

    // Final Action: Kickstart Calendar
    setTimeout(initCalendars, 500);
});

// Logic placeholders for other tools
window.openEventModal = () => document.getElementById('event-modal').classList.remove('hidden');
window.openTruckModal = () => document.getElementById('truck-modal').classList.remove('hidden');
window.saveTruckUnit = async () => { /* Logic */ };
window.saveEvent = async () => { /* Logic */ };

