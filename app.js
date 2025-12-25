/* Foundation: Day-centric Calendar + Dashboard + Day Workspace
   Persistence: localStorage
   Behavior: spreadsheet-first, append-only records
*/

const STORAGE_KEY = "fleetpro_foundation_v1";

const state = loadState() ?? seedState();
let ui = {
  activeView: "dashboard",
  activeDate: toISODate(new Date()),
  calendarMonth: monthStartISO(new Date()),
  activeTab: "jobs",
};

function seedState() {
  return {
    company: { name: "FleetPro", currency: "USD" },
    days: {
      // Example day seeded (today)
      [toISODate(new Date())]: {
        date: toISODate(new Date()),
        jobs: [],
        drivers: [],
        trucks: [],
        records: [],
        media: [],
        aiAnnotations: [],
        totals: { jobs: 0, receipts: 0, expenses: 0 }
      }
    }
  };
}

function ensureDay(dateISO) {
  if (!state.days[dateISO]) {
    state.days[dateISO] = {
      date: dateISO,
      jobs: [],
      drivers: [],
      trucks: [],
      records: [],
      media: [],
      aiAnnotations: [],
      totals: { jobs: 0, receipts: 0, expenses: 0 }
    };
  }
  return state.days[dateISO];
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------- Time helpers ----------
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthStartISO(d) {
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function addMonths(iso, delta) {
  const [y,m] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return monthStartISO(dt);
}
function formatMonthLabel(isoMonthStart) {
  const [y,m] = isoMonthStart.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function formatDateLong(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}
function dowOfISO(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun
}
function isoFromParts(y, m1to12, d) {
  return `${y}-${String(m1to12).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

// ---------- UI wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // Clock
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);

  // Sidebar nav
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      setView(view);
    });
  });

  // Toolbar
  document.getElementById("btnToday").addEventListener("click", () => {
    ui.activeDate = toISODate(new Date());
    ui.calendarMonth = monthStartISO(new Date());
    ensureDay(ui.activeDate);
    save();
    renderAll();
  });
  document.getElementById("btnPrev").addEventListener("click", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, -1);
      renderCalendar();
    } else {
      // Day navigation
      const dt = new Date(ui.activeDate);
      dt.setDate(dt.getDate() - 1);
      ui.activeDate = toISODate(dt);
      ensureDay(ui.activeDate);
      save();
      renderDay();
    }
  });
  document.getElementById("btnNext").addEventListener("click", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, +1);
      renderCalendar();
    } else {
      const dt = new Date(ui.activeDate);
      dt.setDate(dt.getDate() + 1);
      ui.activeDate = toISODate(dt);
      ensureDay(ui.activeDate);
      save();
      renderDay();
    }
  });

  // Quick add buttons target the active day
  document.getElementById("btnAddJob").addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addJob(ui.activeDate);
    setView("day");
    setTab("jobs");
  });
  document.getElementById("btnAddReceipt").addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, { type: "receipt", source: "driver", linkedEntity: "driver", rawData: "Vendor=, Amount=, Category=" });
    setView("day");
    setTab("records");
  });
  document.getElementById("btnAddNote").addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" });
    setView("day");
    setTab("records");
  });

  // Dashboard shortcuts
  document.getElementById("openToday").addEventListener("click", () => {
    ui.activeDate = toISODate(new Date());
    ensureDay(ui.activeDate);
    save();
    setView("day");
  });
  document.getElementById("openCalendar").addEventListener("click", () => setView("calendar"));

  // Tabs
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    setTab(btn.dataset.tab);
  });

  // Pane add row buttons
  document.getElementById("addJobRow").addEventListener("click", () => addJob(ui.activeDate));
  document.getElementById("addDriverRow").addEventListener("click", () => addDriver(ui.activeDate));
  document.getElementById("addTruckRow").addEventListener("click", () => addTruck(ui.activeDate));
  document.getElementById("addRecordRow").addEventListener("click", () => addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" }));
  document.getElementById("addMediaPlaceholder").addEventListener("click", () => addMedia(ui.activeDate));

  // Initial render
  ensureDay(ui.activeDate);
  renderAll();
});

function setView(view) {
  ui.activeView = view;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");

  document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));

  // Context label
  const ctx = document.getElementById("activeContext");
  if (view === "calendar") ctx.textContent = "Calendar navigation (Month)";
  else if (view === "day") ctx.textContent = `Day Workspace: ${ui.activeDate}`;
  else ctx.textContent = "Foundation mode";

  if (view === "calendar") renderCalendar();
  if (view === "dashboard") renderDashboard();
  if (view === "day") renderDay();
}

function setTab(tab) {
  ui.activeTab = tab;

  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".pane").forEach(p => p.classList.remove("active"));
  document.getElementById(`pane-${tab}`).classList.add("active");
}

// ---------- Render ----------
function renderAll() {
  renderDashboard();
  renderCalendar();
  renderDay();
  // Keep current view active
  setView(ui.activeView);
}

function renderDashboard() {
  const todayISO = toISODate(new Date());
  ensureDay(todayISO);

  document.getElementById("todayDate").textContent = formatDateLong(todayISO);

  const d = state.days[todayISO];
  const jobs = d.jobs.length;
  const receipts = d.records.filter(r => r.type === "receipt").length;
  document.getElementById("todaySummary").textContent = `${jobs} job(s), ${receipts} receipt(s), ${d.drivers.length} driver(s), ${d.trucks.length} truck(s)`;

  // Month stats
  const monthISO = ui.calendarMonth;
  const [y,m] = monthISO.split("-").map(Number);
  const totalDays = daysInMonth(y,m);
  let jobsCount = 0, receiptsCount = 0, daysWithActivity = 0;

  for (let day=1; day<=totalDays; day++) {
    const iso = isoFromParts(y,m,day);
    const dayObj = state.days[iso];
    if (!dayObj) continue;
    const activity = (dayObj.jobs.length + dayObj.records.length + dayObj.media.length);
    if (activity > 0) daysWithActivity++;
    jobsCount += dayObj.jobs.length;
    receiptsCount += dayObj.records.filter(r => r.type === "receipt").length;
  }

  const statsEl = document.getElementById("monthStats");
  statsEl.innerHTML = "";
  const stats = [
    ["Active days", String(daysWithActivity)],
    ["Jobs", String(jobsCount)],
    ["Receipts", String(receiptsCount)],
    ["Days stored", String(Object.keys(state.days).length)]
  ];
  stats.forEach(([k,v]) => {
    const div = document.createElement("div");
    div.className = "stat";
    div.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
    statsEl.appendChild(div);
  });
}

function renderCalendar() {
  document.getElementById("monthLabel").textContent = formatMonthLabel(ui.calendarMonth);

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const [y,m] = ui.calendarMonth.split("-").map(Number);
  const firstISO = isoFromParts(y,m,1);
  const firstDow = dowOfISO(firstISO);
  const dim = daysInMonth(y,m);

  // Previous month spill
  const prevMonthStart = addMonths(ui.calendarMonth, -1);
  const [py,pm] = prevMonthStart.split("-").map(Number);
  const dimPrev = daysInMonth(py,pm);

  const todayISO = toISODate(new Date());

  // Fill 6 weeks * 7 = 42 cells
  for (let cell=0; cell<42; cell++) {
    let dayNum, cellISO, off = false;

    if (cell < firstDow) {
      dayNum = dimPrev - (firstDow - 1 - cell);
      cellISO = isoFromParts(py, pm, dayNum);
      off = true;
    } else if (cell >= firstDow + dim) {
      dayNum = cell - (firstDow + dim) + 1;
      const nextMonthStart = addMonths(ui.calendarMonth, +1);
      const [ny,nm] = nextMonthStart.split("-").map(Number);
      cellISO = isoFromParts(ny, nm, dayNum);
      off = true;
    } else {
      dayNum = cell - firstDow + 1;
      cellISO = isoFromParts(y, m, dayNum);
    }

    const dayObj = state.days[cellISO];
    const badges = [];

    if (dayObj) {
      if (dayObj.jobs.length) badges.push({ text: `${dayObj.jobs.length} job`, kind: "" });
      const recCount = dayObj.records.length;
      if (recCount) badges.push({ text: `${recCount} rec`, kind: "warn" });
    }

    const div = document.createElement("div");
    div.className = "daycell" + (off ? " off" : "") + (cellISO === todayISO ? " today" : "");
    div.innerHTML = `
      <div class="daynum">${dayNum}</div>
      <div class="badges">
        ${badges.map(b => `<span class="badge ${b.kind}">${b.text}</span>`).join("")}
      </div>
    `;
    div.addEventListener("click", () => {
      ui.activeDate = cellISO;
      ensureDay(ui.activeDate);
      save();
      setView("day");
      setTab("jobs");
    });

    grid.appendChild(div);
  }
}

function renderDay() {
  ensureDay(ui.activeDate);
  const dayObj = state.days[ui.activeDate];

  document.getElementById("dayLabel").textContent = formatDateLong(ui.activeDate);
  document.getElementById("dayMeta").textContent = `${dayObj.jobs.length} job(s) • ${dayObj.records.length} record(s) • ${dayObj.media.length} media item(s)`;

  // Totals (simple placeholders, real math later)
  const totalsEl = document.getElementById("dayTotals");
  const receipts = dayObj.records.filter(r => r.type === "receipt").length;
  totalsEl.innerHTML = `
    <div class="total-pill">Jobs: ${dayObj.jobs.length}</div>
    <div class="total-pill">Drivers: ${dayObj.drivers.length}</div>
    <div class="total-pill">Trucks: ${dayObj.trucks.length}</div>
    <div class="total-pill">Records: ${dayObj.records.length}</div>
    <div class="total-pill">Receipts: ${receipts}</div>
  `;

  renderEditableTable("jobsBody", dayObj.jobs, [
    { key: "id", placeholder: "J-0001" },
    { key: "customer", placeholder: "Customer name" },
    { key: "pickup", placeholder: "Pickup address" },
    { key: "dropoff", placeholder: "Dropoff address" },
    { key: "volume", placeholder: "0" },
    { key: "status", placeholder: "open/booked/done" },
  ], (rowIndex, key, value) => {
    dayObj.jobs[rowIndex][key] = value;
    save();
    renderCalendar(); // so badges update
    renderDayMetaOnly();
  });

  renderEditableTable("driversBody", dayObj.drivers, [
    { key: "name", placeholder: "Driver name" },
    { key: "status", placeholder: "available/booked" },
    { key: "hours", placeholder: "0" },
    { key: "notes", placeholder: "" },
  ], (rowIndex, key, value) => {
    dayObj.drivers[rowIndex][key] = value;
    save();
    renderDayMetaOnly();
  });

  renderEditableTable("trucksBody", dayObj.trucks, [
    { key: "id", placeholder: "TRK-01" },
    { key: "status", placeholder: "active/maintenance" },
    { key: "capacity", placeholder: "0" },
    { key: "mileage", placeholder: "0" },
  ], (rowIndex, key, value) => {
    dayObj.trucks[rowIndex][key] = value;
    save();
    renderDayMetaOnly();
  });

  // Records: append-only feel (still editable fields, but each row has Created timestamp)
  renderEditableTable("recordsBody", dayObj.records, [
    { key: "type", placeholder: "receipt/note/adjustment" },
    { key: "source", placeholder: "driver/dispatcher/customer/AI" },
    { key: "linkedEntity", placeholder: "job/driver/truck/day" },
    { key: "rawData", placeholder: "key=value, ..." },
    { key: "approved", placeholder: "true/false" },
    { key: "created", placeholder: "" , readonly: true}
  ], (rowIndex, key, value) => {
    if (key === "created") return;
    dayObj.records[rowIndex][key] = value;
    save();
    renderCalendar();
    renderDayMetaOnly();
  });

  renderEditableTable("mediaBody", dayObj.media, [
    { key: "type", placeholder: "photo/video" },
    { key: "ref", placeholder: "filename or URL" },
    { key: "linkedRecord", placeholder: "record index or id" },
    { key: "notes", placeholder: "" },
    { key: "created", placeholder: "" , readonly: true}
  ], (rowIndex, key, value) => {
    if (key === "created") return;
    dayObj.media[rowIndex][key] = value;
    save();
    renderCalendar();
    renderDayMetaOnly();
  });

  renderEditableTable("aiBody", dayObj.aiAnnotations, [
    { key: "model", placeholder: "gpt-*" },
    { key: "confidence", placeholder: "0.00" },
    { key: "summary", placeholder: "AI summary" },
    { key: "warnings", placeholder: "warnings" },
    { key: "created", placeholder: "", readonly: true }
  ], (rowIndex, key, value) => {
    if (key === "created") return;
    dayObj.aiAnnotations[rowIndex][key] = value;
    save();
  });

  // Keep current tab active (if user navigated back)
  setTab(ui.activeTab);
}

function renderDayMetaOnly() {
  const dayObj = state.days[ui.activeDate];
  document.getElementById("dayMeta").textContent =
    `${dayObj.jobs.length} job(s) • ${dayObj.records.length} record(s) • ${dayObj.media.length} media item(s)`;
}

// ---------- Table builder ----------
function renderEditableTable(tbodyId, rows, columns, onUpdate) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      const value = row[col.key] ?? "";
      td.textContent = value;
      const editable = !col.readonly;
      td.setAttribute("contenteditable", editable ? "true" : "false");

      if (editable) {
        td.addEventListener("input", () => {
          onUpdate(idx, col.key, td.textContent.trim());
        });
        td.addEventListener("focus", () => {
          if (td.textContent.trim() === "" && col.placeholder) {
            // no-op, just a hint
          }
        });
      } else {
        td.style.color = "#7e89b8";
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ---------- Add row helpers ----------
function addJob(dateISO) {
  const d = ensureDay(dateISO);
  d.jobs.push({
    id: `J-${String(d.jobs.length + 1).padStart(4,"0")}`,
    customer: "",
    pickup: "",
    dropoff: "",
    volume: "",
    status: "open",
  });
  // append a record of creation (optional)
  addRecord(dateISO, { type: "job_created", source: "dispatcher", linkedEntity: "job", rawData: `jobId=${d.jobs[d.jobs.length-1].id}`, approved: "true" }, false);
  save();
  renderDay();
  renderCalendar();
}

function addDriver(dateISO) {
  const d = ensureDay(dateISO);
  d.drivers.push({ name: "", status: "available", hours: "", notes: "" });
  save();
  renderDay();
  renderCalendar();
}

function addTruck(dateISO) {
  const d = ensureDay(dateISO);
  d.trucks.push({ id: "", status: "active", capacity: "", mileage: "" });
  save();
  renderDay();
  renderCalendar();
}

function addRecord(dateISO, partial, rerender = true) {
  const d = ensureDay(dateISO);
  d.records.push({
    type: partial.type ?? "note",
    source: partial.source ?? "dispatcher",
    linkedEntity: partial.linkedEntity ?? "day",
    rawData: partial.rawData ?? "",
    approved: partial.approved ?? "false",
    created: new Date().toISOString()
  });
  save();
  if (rerender) {
    renderDay();
    renderCalendar();
  }
}

function addMedia(dateISO) {
  const d = ensureDay(dateISO);
  d.media.push({
    type: "photo",
    ref: "",
    linkedRecord: "",
    notes: "",
    created: new Date().toISOString()
  });
  // Media creation record (append-only evidence)
  addRecord(dateISO, { type: "media_added", source: "dispatcher", linkedEntity: "media", rawData: "ref=", approved: "true" }, false);
  save();
  renderDay();
  renderCalendar();
}
