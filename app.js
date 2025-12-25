/* FleetPro Smart Engine v1.4
   - Dashboard / Calendar / Day Workspace
   - Drivers / Trucks / Dispatch enabled
   - SMARTER: conflicts, pickers, auto-assign, export/import
   - Focus-safe editing (no iPad one-letter issue)
*/

const STORAGE_KEY = "fleetpro_smart_v1_4";

/* ---------------- State ---------------- */
const state = loadState() ?? seedState();

let ui = {
  activeView: "dashboard",
  activeDate: toISODate(new Date()),
  calendarMonth: monthStartISO(new Date()),
  activeTab: "jobs",
};

let editing = {
  active: false,
  tbodyId: null,
};

const DAY_TABLES = {
  jobs:   { tab: "jobs",   tbodyId: "jobsBody",    columns: ["id","customer","pickup","dropoff","volume","status","driverId","truckId"] },
  drivers:{ tab: "drivers",tbodyId: "driversBody", columns: ["name","status","hours","notes"] },
  trucks: { tab: "trucks", tbodyId: "trucksBody",  columns: ["id","status","capacity","mileage"] },
  records:{ tab: "records",tbodyId: "recordsBody", columns: ["type","source","linkedEntity","rawData","approved","created"] },
};

const DIR_TABLES = {
  driversDir: { tab: "driversDir", tbodyId: "driversDirBody", columns: ["id","name","phone","role","status","payType","notes"] },
  trucksDir:  { tab: "trucksDir",  tbodyId: "trucksDirBody",  columns: ["id","unit","capacity","status","mileage","lastService","notes"] },
};

const debouncedSmartRefresh = debounce(() => {
  recomputeAll();
  renderDashboard(true);
  renderCalendar();
  if (ui.activeView === "day") renderDaySmartOnly();
  if (ui.activeView === "dispatch") renderDispatch();
}, 180);

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);

  // Sidebar nav
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  const safeOn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };

  // Toolbar navigation
  safeOn("btnToday", () => {
    ui.activeDate = toISODate(new Date());
    ui.calendarMonth = monthStartISO(new Date());
    ensureDay(ui.activeDate);
    recomputeAll();
    renderAll();
  });

  safeOn("btnPrev", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, -1);
      renderCalendar();
    } else {
      ui.activeDate = addDaysISO(ui.activeDate, -1);
      ensureDay(ui.activeDate);
      recomputeAll();
      if (ui.activeView === "day") renderDay();
      if (ui.activeView === "dispatch") renderDispatch();
      renderCalendar();
      renderDashboard(true);
    }
  });

  safeOn("btnNext", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, +1);
      renderCalendar();
    } else {
      ui.activeDate = addDaysISO(ui.activeDate, +1);
      ensureDay(ui.activeDate);
      recomputeAll();
      if (ui.activeView === "day") renderDay();
      if (ui.activeView === "dispatch") renderDispatch();
      renderCalendar();
      renderDashboard(true);
    }
  });

  // Adds
  safeOn("btnAddJob", () => { addJob(ui.activeDate); setView("day"); setTab("jobs"); });
  safeOn("btnAddReceipt", () => { addRecord(ui.activeDate, { type:"receipt", source:"driver", linkedEntity:"driver", rawData:"Vendor=, Amount=, Category=" }); setView("day"); setTab("records"); });
  safeOn("btnAddNote", () => { addRecord(ui.activeDate, { type:"note", source:"dispatcher", linkedEntity:"day", rawData:"Note=" }); setView("day"); setTab("records"); });

  // Dashboard quick opens
  safeOn("openToday", () => { ui.activeDate = toISODate(new Date()); ensureDay(ui.activeDate); recomputeAll(); setView("day"); });
  safeOn("openCalendar", () => setView("calendar"));

  // Tabs inside Day Workspace
  const tabs = document.getElementById("tabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  // Day table add-row buttons
  safeOn("addJobRow", () => addJob(ui.activeDate));
  safeOn("addDriverRow", () => addDriver(ui.activeDate));
  safeOn("addTruckRow", () => addTruck(ui.activeDate));
  safeOn("addRecordRow", () => addRecord(ui.activeDate, { type:"note", source:"dispatcher", linkedEntity:"day", rawData:"Note=" }));

  // Inject smart utilities into toolbar (no HTML edits needed)
  injectSmartToolbarTools();

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === "e") { e.preventDefault(); exportJSON(); }
      if (e.key.toLowerCase() === "i") { e.preventDefault(); importJSONPrompt(); }
      if (e.key.toLowerCase() === "k") { e.preventDefault(); setView("calendar"); }
      if (e.key.toLowerCase() === "d") { e.preventDefault(); setView("day"); }
    }
  });

  ensureDay(ui.activeDate);
  recomputeAll();
  renderAll();
});

/* ---------------- Inject toolbar tools ---------------- */
function injectSmartToolbarTools(){
  const bar = document.querySelector(".toolbar-inner");
  if (!bar) return;

  if (!document.getElementById("btnAutoAssign")) {
    const sep = document.createElement("div");
    sep.className = "tool-sep";
    bar.appendChild(sep);

    const auto = document.createElement("button");
    auto.className = "btn";
    auto.id = "btnAutoAssign";
    auto.type = "button";
    auto.textContent = "Auto-Assign (Day)";
    auto.addEventListener("click", () => {
      autoAssignDay(ui.activeDate);
      debouncedSmartRefresh();
      if (ui.activeView === "dispatch") renderDispatch();
      if (ui.activeView === "day") renderDay();
    });
    bar.appendChild(auto);

    const exp = document.createElement("button");
    exp.className = "btn ghost";
    exp.id = "btnExportNow";
    exp.type = "button";
    exp.textContent = "Export JSON";
    exp.addEventListener("click", exportJSON);
    bar.appendChild(exp);

    const imp = document.createElement("button");
    imp.className = "btn ghost";
    imp.id = "btnImportNow";
    imp.type = "button";
    imp.textContent = "Import JSON";
    imp.addEventListener("click", importJSONPrompt);
    bar.appendChild(imp);
  }
}

/* ---------------- Seed / Persistence ---------------- */
function seedState() {
  const today = toISODate(new Date());
  return {
    company: { name: "FleetPro", currency: "USD" },
    directories: {
      drivers: [
        { id:"D-0001", name:"Marcus Thorne", phone:"", role:"Driver", status:"active", payType:"1099", notes:"" },
        { id:"D-0002", name:"Alyssa Vega", phone:"", role:"Driver", status:"active", payType:"W2", notes:"" },
      ],
      trucks: [
        { id:"T-0001", unit:"010-2020", capacity:"1200", status:"active", mileage:"", lastService:"", notes:"" },
        { id:"T-0002", unit:"014-2018", capacity:"900", status:"active", mileage:"", lastService:"", notes:"" },
      ],
    },
    days: { [today]: makeDay(today) }
  };
}

function makeDay(dateISO) {
  return {
    date: dateISO,
    jobs: [],
    drivers: [],
    trucks: [],
    records: [],
    media: [],
    aiAnnotations: [],
    derived: {
      jobsCount: 0,
      totalVolume: 0,
      totalAssignedCapacity: 0,
      receiptsCount: 0,
      expensesSum: 0,
      warnings: []
    }
  };
}

function ensureDay(dateISO) {
  if (!state.days[dateISO]) state.days[dateISO] = makeDay(dateISO);
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
  } catch { return null; }
}

/* ---------------- Dates ---------------- */
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthStartISO(d) { return toISODate(new Date(d.getFullYear(), d.getMonth(), 1)); }
function addMonths(iso, delta) {
  const [y, m] = iso.split("-").map(Number);
  return monthStartISO(new Date(y, m - 1 + delta, 1));
}
function addDaysISO(iso, delta){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate()+delta);
  return toISODate(dt);
}
function formatMonthLabel(isoMonthStart) {
  const [y, m] = isoMonthStart.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function formatDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric", year:"numeric" });
}
function daysInMonth(y, m1to12) { return new Date(y, m1to12, 0).getDate(); }
function dowOfISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
function isoFromParts(y, m1to12, d) {
  return `${y}-${String(m1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------- Smart parsing ---------------- */
function matchKV(raw, key) {
  if (!raw) return "";
  const re = new RegExp(`${key}\\s*=\\s*([^,\\n\\r]+)`, "i");
  const m = raw.match(re);
  return m ? String(m[1]).trim() : "";
}
function parseReceipt(rawData) {
  const vendor = matchKV(rawData, "vendor");
  const category = matchKV(rawData, "category");
  const amountStr = matchKV(rawData, "amount");
  let amount = null;
  if (amountStr) {
    const cleaned = amountStr.replace(/\$/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    if (!Number.isNaN(n) && Number.isFinite(n)) amount = n;
  }
  return { vendor, category, amount };
}
function numOrZero(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
function warn(level, code, message, tab, row = null, key = null) {
  return { level, code, message, tab, row, key };
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/* ---------------- Compute intelligence ---------------- */
function computeDerivedForDay(day) {
  const derived = {
    jobsCount: 0,
    totalVolume: 0,
    totalAssignedCapacity: 0,
    receiptsCount: 0,
    expensesSum: 0,
    warnings: []
  };

  derived.jobsCount = day.jobs.length;

  // Build quick lookup
  const driversById = new Map(state.directories.drivers.map(d => [d.id, d]));
  const trucksById  = new Map(state.directories.trucks.map(t => [t.id, t]));

  // Conflicts: double booking (day-level)
  const driverUse = new Map();
  const truckUse  = new Map();

  // Volume + job field checks
  let volSum = 0;
  day.jobs.forEach((j, idx) => {
    const jobLabel = j.id ? j.id : `Job #${idx+1}`;

    if (!String(j.customer ?? "").trim()) derived.warnings.push(warn("danger","JOB_MISSING_CUSTOMER",`${jobLabel} missing customer`,"jobs",idx,"customer"));
    if (!String(j.pickup ?? "").trim()) derived.warnings.push(warn("warn","JOB_MISSING_PICKUP",`${jobLabel} missing pickup (origin address)`,"jobs",idx,"pickup"));
    if (!String(j.dropoff ?? "").trim()) derived.warnings.push(warn("warn","JOB_MISSING_DROPOFF",`${jobLabel} missing dropoff (destination address)`,"jobs",idx,"dropoff"));

    const volRaw = String(j.volume ?? "").trim();
    if (!volRaw) derived.warnings.push(warn("warn","JOB_MISSING_VOLUME",`${jobLabel} missing volume (ft³)`,"jobs",idx,"volume"));
    const vol = numOrZero(j.volume);
    volSum += vol;

    // Driver assignment checks
    if (!String(j.driverId ?? "").trim()) {
      derived.warnings.push(warn("warn","JOB_MISSING_DRIVER",`${jobLabel} missing driver assignment`,"jobs",idx,"driverId"));
    } else {
      const used = driverUse.get(j.driverId) || [];
      used.push(jobLabel);
      driverUse.set(j.driverId, used);

      const d = driversById.get(j.driverId);
      if (!d) derived.warnings.push(warn("danger","JOB_UNKNOWN_DRIVER",`${jobLabel} assigned to unknown driver (${j.driverId})`,"jobs",idx,"driverId"));
      else if (String(d.status||"").toLowerCase() !== "active")
        derived.warnings.push(warn("warn","DRIVER_NOT_ACTIVE",`${jobLabel} driver ${d.name||d.id} is not active`,"jobs",idx,"driverId"));
    }

    // Truck assignment checks
    if (!String(j.truckId ?? "").trim()) {
      derived.warnings.push(warn("warn","JOB_MISSING_TRUCK",`${jobLabel} missing truck assignment`,"jobs",idx,"truckId"));
    } else {
      const used = truckUse.get(j.truckId) || [];
      used.push(jobLabel);
      truckUse.set(j.truckId, used);

      const t = trucksById.get(j.truckId);
      if (!t) derived.warnings.push(warn("danger","JOB_UNKNOWN_TRUCK",`${jobLabel} assigned to unknown truck (${j.truckId})`,"jobs",idx,"truckId"));
      else if (String(t.status||"").toLowerCase() !== "active")
        derived.warnings.push(warn("warn","TRUCK_NOT_ACTIVE",`${jobLabel} truck ${t.unit||t.id} is not active`,"jobs",idx,"truckId"));
    }
  });

  derived.totalVolume = round2(volSum);

  // Double-booked driver/truck in same day
  for (const [driverId, jobs] of driverUse.entries()) {
    if (jobs.length > 1) {
      const name = (state.directories.drivers.find(d => d.id === driverId)?.name) || driverId;
      derived.warnings.push(warn("danger","DRIVER_DOUBLE_BOOKED",`Driver double-booked: ${name} on ${jobs.join(", ")}`,"jobs",null,null));
    }
  }
  for (const [truckId, jobs] of truckUse.entries()) {
    if (jobs.length > 1) {
      const unit = (state.directories.trucks.find(t => t.id === truckId)?.unit) || truckId;
      derived.warnings.push(warn("danger","TRUCK_DOUBLE_BOOKED",`Truck double-booked: ${unit} on ${jobs.join(", ")}`,"jobs",null,null));
    }
  }

  // Assigned capacity vs volume (sum capacity of distinct assigned trucks)
  const uniqueAssignedTrucks = new Set(day.jobs.map(j => j.truckId).filter(Boolean));
  let cap = 0;
  uniqueAssignedTrucks.forEach(tid => {
    const t = state.directories.trucks.find(x => x.id === tid);
    if (t) cap += numOrZero(t.capacity);
  });
  derived.totalAssignedCapacity = round2(cap);

  if (derived.totalVolume > 0 && derived.totalAssignedCapacity > 0 && derived.totalVolume > derived.totalAssignedCapacity) {
    derived.warnings.push(warn("danger","CAPACITY_CONFLICT",
      `Capacity conflict: total volume ${derived.totalVolume} ft³ exceeds assigned truck capacity ${derived.totalAssignedCapacity} ft³`,
      "jobs", null, null));
  }

  // Receipts
  const receipts = day.records.filter(r => String(r.type||"").toLowerCase() === "receipt");
  derived.receiptsCount = receipts.length;

  let expenses = 0;
  receipts.forEach((r, idx) => {
    const parsed = parseReceipt(r.rawData || "");
    if (parsed.amount === null) derived.warnings.push(warn("warn","RECEIPT_PARSE_FAIL",`Receipt ${idx+1} missing/invalid Amount=`,"records",idx,"rawData"));
    else expenses += parsed.amount;
  });
  derived.expensesSum = round2(expenses);

  day.derived = derived;
}

/* ---------------- Auto-assign ---------------- */
function autoAssignDay(dateISO){
  const day = ensureDay(dateISO);

  const drivers = state.directories.drivers.filter(d => String(d.status||"").toLowerCase() === "active");
  const trucks  = state.directories.trucks.filter(t => String(t.status||"").toLowerCase() === "active");

  let dIdx = 0, tIdx = 0;

  day.jobs.forEach(j => {
    if (!j.driverId && drivers[dIdx]) { j.driverId = drivers[dIdx].id; dIdx = (dIdx+1) % drivers.length; }
    if (!j.truckId && trucks[tIdx])  { j.truckId  = trucks[tIdx].id;  tIdx = (tIdx+1) % trucks.length; }
  });

  save();
}

/* ---------------- Views / Nav ---------------- */
function setView(view) {
  ui.activeView = view;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));

  const ctx = document.getElementById("activeContext");
  if (ctx) {
    if (view === "calendar") ctx.textContent = "Calendar navigation (Month)";
    else if (view === "day") ctx.textContent = `Day Workspace: ${ui.activeDate}`;
    else if (view === "drivers") ctx.textContent = "Drivers directory";
    else if (view === "trucks") ctx.textContent = "Trucks directory";
    else if (view === "dispatch") ctx.textContent = `Dispatch: ${ui.activeDate}`;
    else ctx.textContent = "Foundation mode (Smart)";
  }

  if (view === "calendar") renderCalendar();
  if (view === "dashboard") renderDashboard(true);
  if (view === "day") renderDay();
  if (view === "drivers") renderDriversDirectory();
  if (view === "trucks") renderTrucksDirectory();
  if (view === "dispatch") renderDispatch();
  if (view === "finance") renderPlaceholder(view,"Finance","Next: receipt categories + driver/company split + export CSV.");
  if (view === "inventory") renderPlaceholder(view,"Inventory","Next: room photos → AI inventory list → cubic feet.");
  if (view === "scanner") renderPlaceholder(view,"AI Scanner","Next: camera upload → AI parse → auto-fill jobs/records.");
}

function setTab(tab) {
  ui.activeTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".pane").forEach(p => p.classList.remove("active"));
  const pane = document.getElementById(`pane-${tab}`);
  if (pane) pane.classList.add("active");
}

/* ---------------- Recompute ---------------- */
function recomputeAll() {
  Object.values(state.days).forEach(day => computeDerivedForDay(day));
  save();
}

/* ---------------- Render: Core ---------------- */
function renderAll() {
  renderDashboard(true);
  renderCalendar();
  renderDay();
  setView(ui.activeView);
}

function renderDashboard() {
  const todayISO = toISODate(new Date());
  ensureDay(todayISO);
  computeDerivedForDay(state.days[todayISO]);

  const todayDateEl = document.getElementById("todayDate");
  if (todayDateEl) todayDateEl.textContent = formatDateLong(todayISO);

  const d = state.days[todayISO];
  const sumEl = document.getElementById("todaySummary");
  if (sumEl) sumEl.textContent = `${d.derived.jobsCount} job(s), ${d.derived.receiptsCount} receipt(s), ${d.drivers.length} driver(s), ${d.trucks.length} truck(s)`;

  const monthISO = ui.calendarMonth;
  const [y, m] = monthISO.split("-").map(Number);
  const totalDays = daysInMonth(y, m);

  let jobsCount = 0, receiptsCount = 0, expensesSum = 0, warnCount = 0, dangerCount = 0;
  for (let day = 1; day <= totalDays; day++) {
    const iso = isoFromParts(y, m, day);
    const dayObj = state.days[iso];
    if (!dayObj) continue;
    computeDerivedForDay(dayObj);
    jobsCount += dayObj.derived.jobsCount;
    receiptsCount += dayObj.derived.receiptsCount;
    expensesSum += dayObj.derived.expensesSum;
    warnCount += dayObj.derived.warnings.filter(w => w.level === "warn").length;
    dangerCount += dayObj.derived.warnings.filter(w => w.level === "danger").length;
  }

  const statsEl = document.getElementById("monthStats");
  if (statsEl) {
    statsEl.innerHTML = "";
    const stats = [
      ["Jobs (month)", String(jobsCount)],
      ["Receipts (month)", String(receiptsCount)],
      ["Expenses (month)", `$${round2(expensesSum)}`],
      ["Warnings", `${dangerCount} danger / ${warnCount} warn`],
    ];
    stats.forEach(([k, v]) => {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`;
      statsEl.appendChild(div);
    });
  }
}

function renderCalendar() {
  const monthLabel = document.getElementById("monthLabel");
  if (monthLabel) monthLabel.textContent = formatMonthLabel(ui.calendarMonth);

  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const [y, m] = ui.calendarMonth.split("-").map(Number);
  const firstISO = isoFromParts(y, m, 1);
  const firstDow = dowOfISO(firstISO);
  const dim = daysInMonth(y, m);

  const prevMonthStart = addMonths(ui.calendarMonth, -1);
  const [py, pm] = prevMonthStart.split("-").map(Number);
  const dimPrev = daysInMonth(py, pm);

  const todayISO = toISODate(new Date());

  for (let cell = 0; cell < 42; cell++) {
    let dayNum, cellISO, off = false;

    if (cell < firstDow) {
      dayNum = dimPrev - (firstDow - 1 - cell);
      cellISO = isoFromParts(py, pm, dayNum);
      off = true;
    } else if (cell >= firstDow + dim) {
      dayNum = cell - (firstDow + dim) + 1;
      const nextMonthStart = addMonths(ui.calendarMonth, +1);
      const [ny, nm] = nextMonthStart.split("-").map(Number);
      cellISO = isoFromParts(ny, nm, dayNum);
      off = true;
    } else {
      dayNum = cell - firstDow + 1;
      cellISO = isoFromParts(y, m, dayNum);
    }

    const dayObj = state.days[cellISO];
    const badges = [];
    let warnCount = 0, dangerCount = 0;

    if (dayObj) {
      computeDerivedForDay(dayObj);
      if (dayObj.jobs.length) badges.push({ text: `${dayObj.jobs.length} job`, kind: "" });

      dangerCount = dayObj.derived.warnings.filter(w => w.level === "danger").length;
      warnCount = dayObj.derived.warnings.filter(w => w.level === "warn").length;

      if (dangerCount) badges.push({ text: `${dangerCount} danger`, kind: "danger" });
      else if (warnCount) badges.push({ text: `${warnCount} warn`, kind: "warn" });
    }

    const div = document.createElement("div");
    div.className =
      "daycell" +
      (off ? " off" : "") +
      (cellISO === todayISO ? " today" : "") +
      (dangerCount ? " hasDanger" : warnCount ? " hasWarn" : "");

    div.innerHTML = `
      <div class="daynum">${dayNum}</div>
      <div class="badges">
        ${badges.map(b => `<span class="badge ${b.kind}">${escapeHtml(b.text)}</span>`).join("")}
      </div>
    `;

    div.addEventListener("click", () => {
      ui.activeDate = cellISO;
      ensureDay(ui.activeDate);
      recomputeAll();
      setView("day");
      setTab("jobs");
    });

    grid.appendChild(div);
  }
}

/* ---------------- Render: Day Workspace ---------------- */
function renderDay() {
  ensureDay(ui.activeDate);
  const dayObj = state.days[ui.activeDate];
  computeDerivedForDay(dayObj);
  save();

  const dayLabel = document.getElementById("dayLabel");
  if (dayLabel) dayLabel.textContent = formatDateLong(ui.activeDate);

  const dayMeta = document.getElementById("dayMeta");
  if (dayMeta) {
    dayMeta.textContent =
      `${dayObj.jobs.length} job(s) • ${dayObj.records.length} record(s) • ${dayObj.drivers.length} drivers • ${dayObj.trucks.length} trucks`;
  }

  renderDaySmartOnly();

  renderEditableTable("jobsBody", dayObj.jobs, DAY_TABLES.jobs, (row, key, value) => {
    dayObj.jobs[row][key] = value;
    save();
    debouncedSmartRefresh();
  });

  // After rendering jobs: attach pickers for Driver/Truck columns
  attachJobPickers();

  renderEditableTable("driversBody", dayObj.drivers, DAY_TABLES.drivers, (row, key, value) => {
    dayObj.drivers[row][key] = value;
    save();
    debouncedSmartRefresh();
  });

  renderEditableTable("trucksBody", dayObj.trucks, DAY_TABLES.trucks, (row, key, value) => {
    dayObj.trucks[row][key] = value;
    save();
    debouncedSmartRefresh();
  });

  renderEditableTable("recordsBody", dayObj.records, DAY_TABLES.records, (row, key, value) => {
    if (key === "created") return;
    dayObj.records[row][key] = value;
    save();
    debouncedSmartRefresh();
  });

  setTab(ui.activeTab);
}

function renderDaySmartOnly() {
  const dayObj = state.days[ui.activeDate];
  computeDerivedForDay(dayObj);

  const totalsEl = document.getElementById("dayTotals");
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="total-pill">Jobs: ${dayObj.derived.jobsCount}</div>
      <div class="total-pill">Volume: ${dayObj.derived.totalVolume}</div>
      <div class="total-pill">Assigned Cap: ${dayObj.derived.totalAssignedCapacity}</div>
      <div class="total-pill">Receipts: ${dayObj.derived.receiptsCount}</div>
      <div class="total-pill">Expenses: $${dayObj.derived.expensesSum}</div>
    `;
  }

  injectDayWarningsPanel(dayObj);
}

function injectDayWarningsPanel(dayObj) {
  const dayView = document.getElementById("view-day");
  if (!dayView) return;

  let panel = document.getElementById("smartWarningsPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "smartWarningsPanel";
    panel.className = "card warnings-card wide";
    const head = dayView.querySelector(".day-head");
    if (head && head.parentElement) head.parentElement.insertBefore(panel, head.nextSibling);
    else dayView.prepend(panel);

    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-jump='1']");
      if (!btn) return;
      jumpToIssue(btn.dataset.tab, btn.dataset.row === "" ? null : Number(btn.dataset.row), btn.dataset.key || null);
    });
  }

  const warnings = dayObj.derived.warnings;
  const danger = warnings.filter(w => w.level === "danger");
  const warn = warnings.filter(w => w.level === "warn");

  panel.innerHTML = `
    <div class="warnings-title">
      <div class="card-title">Warnings</div>
      <div class="warnings-count">${danger.length} danger / ${warn.length} warn</div>
    </div>

    ${warnings.length === 0
      ? `<div class="muted">No warnings. Suspicious, but we’ll take it.</div>`
      : `<ul class="warnings-list">
          ${warnings.slice(0, 20).map(w => {
            const cls = w.level === "danger" ? "wlvl-danger" : "wlvl-warn";
            const canJump = w.tab && (w.row !== null) && w.key;
            return `
              <li class="${cls}">
                ${canJump
                  ? `<button data-jump="1" data-tab="${escapeHtml(w.tab)}" data-row="${w.row}" data-key="${escapeHtml(w.key)}"
                      class="warnlink">${escapeHtml(w.message)}</button>
                     <span class="muted">(${escapeHtml(w.tab)} → ${escapeHtml(w.key)})</span>`
                  : `${escapeHtml(w.message)} <span class="muted">(${escapeHtml(w.tab || "general")})</span>`
                }
              </li>`;
          }).join("")}
        </ul>`
    }

    <div class="help muted" style="margin-top:10px">
      <b>Pickup</b> = where items start (origin). <b>Dropoff</b> = where items end (destination).
    </div>
  `;
}

/* ---------------- Job pickers (Driver/Truck) ---------------- */
function attachJobPickers(){
  const tbody = document.getElementById("jobsBody");
  if (!tbody) return;

  // columns indices for jobs
  const driverCol = DAY_TABLES.jobs.columns.indexOf("driverId");
  const truckCol  = DAY_TABLES.jobs.columns.indexOf("truckId");

  [...tbody.rows].forEach((tr, rIdx) => {
    const driverCell = tr.cells[driverCol];
    const truckCell  = tr.cells[truckCol];

    if (driverCell && !driverCell.dataset.pickerBound){
      driverCell.dataset.pickerBound = "1";
      driverCell.addEventListener("focus", () => openPickerForCell(driverCell, "driver"));
    }
    if (truckCell && !truckCell.dataset.pickerBound){
      truckCell.dataset.pickerBound = "1";
      truckCell.addEventListener("focus", () => openPickerForCell(truckCell, "truck"));
    }
  });
}

function openPickerForCell(cell, kind){
  // Don’t pop picker if user is actively typing in the cell already
  // But for driver/truck ID cells, a picker is way safer than free-typing.
  const options = kind === "driver"
    ? state.directories.drivers.map(d => ({ value: d.id, label: `${d.name || d.id} (${d.id})` }))
    : state.directories.trucks.map(t => ({ value: t.id, label: `${t.unit || t.id} (${t.id})` }));

  showFloatingPicker(cell, options, (pickedValue) => {
    const day = ensureDay(ui.activeDate);
    const row = Number(cell.dataset.row);
    const key = cell.dataset.key;

    if (Number.isNaN(row) || !key) return;
    day.jobs[row][key] = pickedValue;

    // Update cell text immediately (no re-render)
    cell.textContent = pickedValue;
    save();
    debouncedSmartRefresh();
  });
}

function showFloatingPicker(anchorCell, options, onPick){
  // Remove existing picker if any
  const existing = document.getElementById("fpPicker");
  if (existing) existing.remove();

  const rect = anchorCell.getBoundingClientRect();

  const wrap = document.createElement("div");
  wrap.id = "fpPicker";
  wrap.style.position = "fixed";
  wrap.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  wrap.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;
  wrap.style.width = "300px";
  wrap.style.maxHeight = "240px";
  wrap.style.overflow = "auto";
  wrap.style.zIndex = "9999";
  wrap.style.borderRadius = "14px";
  wrap.style.border = "1px solid rgba(255,255,255,0.14)";
  wrap.style.background = "rgba(10,16,35,0.96)";
  wrap.style.backdropFilter = "blur(10px)";
  wrap.style.boxShadow = "0 20px 60px rgba(0,0,0,0.55)";
  wrap.style.padding = "8px";

  const title = document.createElement("div");
  title.textContent = "Select:";
  title.style.fontSize = "12px";
  title.style.color = "rgba(255,255,255,0.7)";
  title.style.margin = "4px 8px 8px";
  wrap.appendChild(title);

  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = opt.label;
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "10px 10px";
    btn.style.borderRadius = "12px";
    btn.style.border = "1px solid rgba(255,255,255,0.08)";
    btn.style.background = "rgba(255,255,255,0.04)";
    btn.style.color = "rgba(255,255,255,0.92)";
    btn.style.marginBottom = "8px";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      onPick(opt.value);
      wrap.remove();
      // keep focus and let user tab forward
      requestAnimationFrame(() => { try { anchorCell.focus(); } catch {} });
    });
    wrap.appendChild(btn);
  });

  document.body.appendChild(wrap);

  const close = (e) => {
    if (!wrap.contains(e.target) && e.target !== anchorCell) {
      wrap.remove();
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("touchstart", close, true);
    }
  };
  document.addEventListener("mousedown", close, true);
  document.addEventListener("touchstart", close, true);
}

/* ---------------- Render: Directory pages ---------------- */
function renderDriversDirectory() {
  const root = document.getElementById("view-drivers");
  if (!root) return;

  root.innerHTML = `
    <div class="card wide">
      <div class="card-title">Drivers Directory</div>
      <div class="muted">Master list of drivers (global). Use Dispatch or Day Jobs to assign driver/truck.</div>
      <div class="row
