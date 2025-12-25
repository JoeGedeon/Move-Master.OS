/* FleetPro Smart Engine v1.3
   - Dashboard / Calendar / Day Workspace (existing)
   - Adds: Drivers directory, Trucks directory, Dispatch view
   - Fixes: iPad typing focus loss (no table re-render while typing)
   - LocalStorage persistence
*/

const STORAGE_KEY = "fleetpro_smart_v1_3";

const state = loadState() ?? seedState();

let ui = {
  activeView: "dashboard",
  activeDate: toISODate(new Date()),
  calendarMonth: monthStartISO(new Date()),
  activeTab: "jobs",
};

let editing = {
  active: false,
  tab: null,
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

document.addEventListener("DOMContentLoaded", () => {
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);

  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  const safeOn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  };

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
      const dt = new Date(ui.activeDate);
      dt.setDate(dt.getDate() - 1);
      ui.activeDate = toISODate(dt);
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
      const dt = new Date(ui.activeDate);
      dt.setDate(dt.getDate() + 1);
      ui.activeDate = toISODate(dt);
      ensureDay(ui.activeDate);
      recomputeAll();
      if (ui.activeView === "day") renderDay();
      if (ui.activeView === "dispatch") renderDispatch();
      renderCalendar();
      renderDashboard(true);
    }
  });

  safeOn("btnAddJob", () => { addJob(ui.activeDate); setView("day"); setTab("jobs"); });
  safeOn("btnAddReceipt", () => { addRecord(ui.activeDate, { type: "receipt", source: "driver", linkedEntity: "driver", rawData: "Vendor=, Amount=, Category=" }); setView("day"); setTab("records"); });
  safeOn("btnAddNote", () => { addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" }); setView("day"); setTab("records"); });

  safeOn("openToday", () => { ui.activeDate = toISODate(new Date()); ensureDay(ui.activeDate); recomputeAll(); setView("day"); });
  safeOn("openCalendar", () => setView("calendar"));

  const tabs = document.getElementById("tabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  safeOn("addJobRow", () => addJob(ui.activeDate));
  safeOn("addDriverRow", () => addDriver(ui.activeDate));
  safeOn("addTruckRow", () => addTruck(ui.activeDate));
  safeOn("addRecordRow", () => addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" }));

  // Directory buttons (injected by JS if views exist)
  // Safe: if not present, nothing happens.

  ensureDay(ui.activeDate);
  recomputeAll();
  renderAll();
});

/* ---------------- Seed / State ---------------- */
function seedState() {
  const today = toISODate(new Date());
  return {
    company: { name: "FleetPro", currency: "USD" },
    directories: {
      drivers: [
        { id:"D-0001", name:"Marcus Thorne", phone:"", role:"Driver", status:"active", payType:"1099", notes:"" },
      ],
      trucks: [
        { id:"T-0001", unit:"010-2020", capacity:"1200", status:"active", mileage:"", lastService:"", notes:"" },
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
      totalTruckCapacity: 0,
      receiptsCount: 0,
      expensesSum: 0,
      net: 0,
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

/* ---------------- Time helpers ---------------- */
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
function formatMonthLabel(isoMonthStart) {
  const [y, m] = isoMonthStart.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}
function formatDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function daysInMonth(y, m1to12) { return new Date(y, m1to12, 0).getDate(); }
function dowOfISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
function isoFromParts(y, m1to12, d) {
  return `${y}-${String(m1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------- Parsing / Smart ---------------- */
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

function computeDerivedForDay(day) {
  const derived = {
    jobsCount: 0,
    totalVolume: 0,
    totalTruckCapacity: 0,
    receiptsCount: 0,
    expensesSum: 0,
    net: 0,
    warnings: []
  };

  derived.jobsCount = day.jobs.length;

  let volSum = 0;
  day.jobs.forEach((j, idx) => {
    const volRaw = String(j.volume ?? "").trim();
    const vol = numOrZero(j.volume);
    volSum += vol;

    const jobLabel = j.id ? j.id : `Job #${idx + 1}`;

    if (!String(j.customer ?? "").trim()) derived.warnings.push(warn("danger", "JOB_MISSING_CUSTOMER", `${jobLabel} missing customer`, "jobs", idx, "customer"));
    if (!String(j.pickup ?? "").trim()) derived.warnings.push(warn("warn", "JOB_MISSING_PICKUP", `${jobLabel} missing pickup`, "jobs", idx, "pickup"));
    if (!String(j.dropoff ?? "").trim()) derived.warnings.push(warn("warn", "JOB_MISSING_DROPOFF", `${jobLabel} missing dropoff`, "jobs", idx, "dropoff"));
    if (!String(j.driverId ?? "").trim()) derived.warnings.push(warn("warn", "JOB_MISSING_DRIVER", `${jobLabel} missing driver assignment`, "jobs", idx, "driverId"));
    if (!String(j.truckId ?? "").trim()) derived.warnings.push(warn("warn", "JOB_MISSING_TRUCK", `${jobLabel} missing truck assignment`, "jobs", idx, "truckId"));

    if (volRaw && !Number.isFinite(Number(volRaw.replace(/,/g, "")))) derived.warnings.push(warn("danger", "JOB_INVALID_VOLUME", `${jobLabel} volume is not a number`, "jobs", idx, "volume"));
    if (!volRaw) derived.warnings.push(warn("warn", "JOB_MISSING_VOLUME", `${jobLabel} missing volume`, "jobs", idx, "volume"));
  });
  derived.totalVolume = round2(volSum);

  // Day truck capacity from day table (optional)
  let capSum = 0;
  day.trucks.forEach((t) => capSum += numOrZero(t.capacity));
  derived.totalTruckCapacity = round2(capSum);

  const receipts = day.records.filter(r => String(r.type || "").toLowerCase() === "receipt");
  derived.receiptsCount = receipts.length;

  let expenses = 0;
  receipts.forEach((r, idx) => {
    const parsed = parseReceipt(r.rawData || "");
    if (parsed.amount === null) derived.warnings.push(warn("warn", "RECEIPT_PARSE_FAIL", `Receipt ${idx + 1} missing/invalid Amount=`, "records", idx, "rawData"));
    else expenses += parsed.amount;
  });

  derived.expensesSum = round2(expenses);
  derived.net = round2(0 - derived.expensesSum);

  day.derived = derived;
}

/* ---------------- Navigation / Views ---------------- */
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
  if (view === "finance") renderPlaceholder(view, "Finance", "Coming next: receipts → categories → driver/company split → exports.");
  if (view === "inventory") renderPlaceholder(view, "Inventory", "Coming next: room photos → AI inventory list → cubic feet estimate.");
  if (view === "scanner") renderPlaceholder(view, "AI Scanner", "Coming next: camera upload → AI parse → auto-fill records/jobs.");
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
  if (dayMeta) dayMeta.textContent = `${dayObj.jobs.length} job(s) • ${dayObj.records.length} record(s) • ${dayObj.drivers.length} drivers • ${dayObj.trucks.length} trucks`;

  renderDaySmartOnly();

  renderEditableTable("jobsBody", dayObj.jobs, DAY_TABLES.jobs, (row, key, value) => {
    dayObj.jobs[row][key] = value;
    save();
    debouncedSmartRefresh();
  });

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
      const tab = btn.dataset.tab;
      const row = btn.dataset.row === "" ? null : Number(btn.dataset.row);
      const key = btn.dataset.key || null;
      jumpToIssue(tab, row, key);
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
      ? `<div class="muted">No warnings. You’ve done the impossible.</div>`
      : `<ul class="warnings-list">
          ${warnings.slice(0, 18).map(w => {
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
  `;
}

/* ---------------- Render: Directory pages ---------------- */
function renderDriversDirectory() {
  const root = document.getElementById("view-drivers");
  if (!root) return;

  root.innerHTML = `
    <div class="card wide">
      <div class="card-title">Drivers Directory</div>
      <div class="muted">Master list of drivers (global). Use Dispatch to assign drivers to jobs.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="addDriverDirRow" type="button">+ Add Driver</button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table class="sheet">
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th>Pay Type</th><th>Notes</th>
            </tr>
          </thead>
          <tbody id="driversDirBody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("addDriverDirRow").addEventListener("click", () => {
    const id = `D-${String((state.directories.drivers.length + 1)).padStart(4,"0")}`;
    state.directories.drivers.push({ id, name:"", phone:"", role:"Driver", status:"active", payType:"1099", notes:"" });
    save();
    renderDriversDirectory();
  });

  renderEditableTable("driversDirBody", state.directories.drivers, DIR_TABLES.driversDir, (row, key, value) => {
    state.directories.drivers[row][key] = value;
    save();
    debouncedSmartRefresh();
  });
}

function renderTrucksDirectory() {
  const root = document.getElementById("view-trucks");
  if (!root) return;

  root.innerHTML = `
    <div class="card wide">
      <div class="card-title">Trucks Directory</div>
      <div class="muted">Master list of trucks (global). Use Dispatch to assign trucks to jobs.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="addTruckDirRow" type="button">+ Add Truck</button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table class="sheet">
          <thead>
            <tr>
              <th>ID</th><th>Unit</th><th>Capacity</th><th>Status</th><th>Mileage</th><th>Last Service</th><th>Notes</th>
            </tr>
          </thead>
          <tbody id="trucksDirBody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("addTruckDirRow").addEventListener("click", () => {
    const id = `T-${String((state.directories.trucks.length + 1)).padStart(4,"0")}`;
    state.directories.trucks.push({ id, unit:"", capacity:"", status:"active", mileage:"", lastService:"", notes:"" });
    save();
    renderTrucksDirectory();
  });

  renderEditableTable("trucksDirBody", state.directories.trucks, DIR_TABLES.trucksDir, (row, key, value) => {
    state.directories.trucks[row][key] = value;
    save();
    debouncedSmartRefresh();
  });
}

/* ---------------- Render: Dispatch ---------------- */
function renderDispatch() {
  const root = document.getElementById("view-dispatch");
  if (!root) return;

  ensureDay(ui.activeDate);
  const dayObj = state.days[ui.activeDate];
  computeDerivedForDay(dayObj);

  const driverOptions = state.directories.drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || d.id)}</option>`).join("");
  const truckOptions  = state.directories.trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.unit || t.id)}</option>`).join("");

  root.innerHTML = `
    <div class="card wide">
      <div class="card-title">Dispatch</div>
      <div class="muted">${formatDateLong(ui.activeDate)} • Assign driver + truck per job</div>

      <div class="table-wrap" style="margin-top:12px">
        <table class="sheet">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Customer</th>
              <th>Pickup</th>
              <th>Dropoff</th>
              <th>Volume</th>
              <th>Driver</th>
              <th>Truck</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="dispatchBody">
            ${dayObj.jobs.map((j, idx) => {
              const dSel = j.driverId || "";
              const tSel = j.truckId || "";
              return `
                <tr data-idx="${idx}">
                  <td>${escapeHtml(j.id || `Job #${idx+1}`)}</td>
                  <td>${escapeHtml(j.customer || "")}</td>
                  <td>${escapeHtml(j.pickup || "")}</td>
                  <td>${escapeHtml(j.dropoff || "")}</td>
                  <td>${escapeHtml(String(j.volume || ""))}</td>
                  <td>
                    <select class="dispatchSel" data-kind="driver">
                      <option value="">(unassigned)</option>
                      ${driverOptions}
                    </select>
                  </td>
                  <td>
                    <select class="dispatchSel" data-kind="truck">
                      <option value="">(unassigned)</option>
                      ${truckOptions}
                    </select>
                  </td>
                  <td>${escapeHtml(j.status || "open")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="help muted">
        Tip: If drivers/trucks dropdowns are empty, add them in Drivers/Trucks tabs first.
      </div>
    </div>
  `;

  // Set dropdown values and attach handlers
  root.querySelectorAll("#dispatchBody tr").forEach(tr => {
    const idx = Number(tr.dataset.idx);
    const job = dayObj.jobs[idx];

    const dSel = tr.querySelector("select[data-kind='driver']");
    const tSel = tr.querySelector("select[data-kind='truck']");

    if (dSel) dSel.value = job.driverId || "";
    if (tSel) tSel.value = job.truckId || "";

    const onChange = () => {
      job.driverId = dSel ? dSel.value : "";
      job.truckId  = tSel ? tSel.value : "";
      save();
      debouncedSmartRefresh();
    };

    if (dSel) dSel.addEventListener("change", onChange);
    if (tSel) tSel.addEventListener("change", onChange);
  });
}

/* ---------------- Editable tables (focus-safe) ---------------- */
function renderEditableTable(tbodyId, rows, cfg, onCommit) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (editing.active && editing.tbodyId === tbodyId) return;

  tbody.innerHTML = "";

  rows.forEach((row, rIndex) => {
    const tr = document.createElement("tr");

    cfg.columns.forEach((key, cIndex) => {
      const td = document.createElement("td");
      td.textContent = row[key] ?? "";

      const readonly = (key === "created");
      td.setAttribute("contenteditable", readonly ? "false" : "true");
      if (readonly) td.style.color = "#7e89b8";

      td.dataset.row = String(rIndex);
      td.dataset.col = String(cIndex);
      td.dataset.key = key;
      td.dataset.tab = cfg.tab;
      td.dataset.tbody = tbodyId;

      if (!readonly) {
        td.addEventListener("focus", () => {
          editing.active = true;
          editing.tab = cfg.tab;
          editing.tbodyId = tbodyId;
        });

        td.addEventListener("blur", () => {
          const val = td.textContent.trim();
          onCommit(rIndex, key, val);
          setTimeout(() => {
            editing.active = false;
            editing.tab = null;
            editing.tbodyId = null;
          }, 0);
        });

        td.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitCell(td, onCommit);
            moveCell(td, e.shiftKey ? "up" : "down");
          } else if (e.key === "Tab") {
            e.preventDefault();
            commitCell(td, onCommit);
            moveCell(td, e.shiftKey ? "left" : "right");
          } else {
            debouncedSmartRefresh();
          }
        });

        td.addEventListener("input", () => debouncedSmartRefresh());
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function commitCell(td, onCommit) {
  const row = Number(td.dataset.row);
  const key = td.dataset.key;
  const value = td.textContent.trim();
  if (Number.isNaN(row) || !key) return;
  onCommit(row, key, value);
}

function moveCell(td, dir) {
  const tbodyId = td.dataset.tbody;
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const r = Number(td.dataset.row);
  const c = Number(td.dataset.col);

  let nr = r, nc = c;
  if (dir === "right") nc = c + 1;
  if (dir === "left") nc = c - 1;
  if (dir === "down") nr = r + 1;
  if (dir === "up") nr = r - 1;

  nr = Math.max(0, Math.min(nr, tbody.rows.length - 1));
  nc = Math.max(0, Math.min(nc, tbody.rows[0]?.cells.length - 1));

  const target = tbody.rows[nr]?.cells[nc];
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  requestAnimationFrame(() => { try { target.focus(); } catch {} });
}

/* ---------------- Jump-to-fix ---------------- */
function jumpToIssue(tab, row, key) {
  setView("day");
  setTab(tab);

  const cfg = DAY_TABLES[tab];
  if (!cfg || row === null || row === undefined || !key) return;

  if (!editing.active) renderDay();

  const tbody = document.getElementById(cfg.tbodyId);
  if (!tbody) return;

  const colIndex = cfg.columns.indexOf(key);
  if (colIndex < 0) return;

  const tr = tbody.rows[row];
  if (!tr) return;

  const cell = tr.cells[colIndex];
  if (!cell) return;

  cell.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  requestAnimationFrame(() => {
    try { cell.focus(); } catch {}
    cell.classList.add("jump-flash");
    setTimeout(() => cell.classList.remove("jump-flash"), 900);
  });
}

/* ---------------- Add rows ---------------- */
function addJob(dateISO) {
  const d = ensureDay(dateISO);
  d.jobs.push({
    id: `J-${String(d.jobs.length + 1).padStart(4, "0")}`,
    customer: "",
    pickup: "",
    dropoff: "",
    volume: "",
    status: "open",
    driverId: "",
    truckId: "",
  });
  save();
  recomputeAll();
  if (ui.activeView === "day") renderDay();
  if (ui.activeView === "dispatch") renderDispatch();
  renderCalendar();
  renderDashboard(true);
}

function addDriver(dateISO) {
  const d = ensureDay(dateISO);
  d.drivers.push({ name: "", status: "available", hours: "", notes: "" });
  save();
  recomputeAll();
  renderDay();
}

function addTruck(dateISO) {
  const d = ensureDay(dateISO);
  d.trucks.push({ id: "", status: "active", capacity: "", mileage: "" });
  save();
  recomputeAll();
  renderDay();
}

function addRecord(dateISO, partial) {
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
  recomputeAll();
  renderDay();
}

/* ---------------- Placeholder views ---------------- */
function renderPlaceholder(view, title, text) {
  const root = document.getElementById(`view-${view}`);
  if (!root) return;
  root.innerHTML = `
    <div class="card wide">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="muted">${escapeHtml(text)}</div>
    </div>
  `;
}

/* ---------------- Utils ---------------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
