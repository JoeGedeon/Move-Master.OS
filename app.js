/* FleetPro Smart Engine v1
   - Day-centric data
   - Live totals
   - Rules/validation warnings
   - Pressure Points on dashboard
   - Calendar warning badges
   Persistence: localStorage
*/

const STORAGE_KEY = "fleetpro_smart_v1";

const state = loadState() ?? seedState();

let ui = {
  activeView: "dashboard",
  activeDate: toISODate(new Date()),
  calendarMonth: monthStartISO(new Date()),
  activeTab: "jobs",
};

function seedState() {
  const today = toISODate(new Date());
  return {
    company: { name: "FleetPro", currency: "USD" },
    days: {
      [today]: makeDay(today),
    }
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
      warnings: [], // {level:'warn'|'danger', code, message, tab?}
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
  } catch {
    return null;
  }
}

/* ---------------- Time helpers ---------------- */
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
  const [y, m] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return monthStartISO(dt);
}

function formatMonthLabel(isoMonthStart) {
  const [y, m] = isoMonthStart.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function formatDateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}

function dowOfISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function isoFromParts(y, m1to12, d) {
  return `${y}-${String(m1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------- Smart Engine ---------------- */

function parseReceipt(rawData) {
  // Supports: Vendor=..., Amount=69.01, Category=...
  const vendor = matchKV(rawData, "vendor");
  const category = matchKV(rawData, "category");
  const amountStr = matchKV(rawData, "amount");

  let amount = null;
  if (amountStr) {
    // remove $ and commas
    const cleaned = amountStr.replace(/\$/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    if (!Number.isNaN(n) && Number.isFinite(n)) amount = n;
  }

  return { vendor, category, amount };
}

function matchKV(raw, key) {
  if (!raw) return "";
  const re = new RegExp(`${key}\\s*=\\s*([^,\\n\\r]+)`, "i");
  const m = raw.match(re);
  return m ? String(m[1]).trim() : "";
}

function numOrZero(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

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

  // Jobs
  derived.jobsCount = day.jobs.length;

  let volSum = 0;
  day.jobs.forEach((j, idx) => {
    const vol = numOrZero(j.volume);
    volSum += vol;

    // Required fields
    if (!String(j.customer ?? "").trim()) {
      derived.warnings.push(warn("danger", "JOB_MISSING_CUSTOMER", `Job ${j.id || `#${idx+1}`} missing customer`, "jobs"));
    }
    if (!String(j.pickup ?? "").trim()) {
      derived.warnings.push(warn("warn", "JOB_MISSING_PICKUP", `Job ${j.id || `#${idx+1}`} missing pickup`, "jobs"));
    }
    if (!String(j.dropoff ?? "").trim()) {
      derived.warnings.push(warn("warn", "JOB_MISSING_DROPOFF", `Job ${j.id || `#${idx+1}`} missing dropoff`, "jobs"));
    }
    if (String(j.volume ?? "").trim() && !Number.isFinite(Number(String(j.volume).replace(/,/g,"")))) {
      derived.warnings.push(warn("danger", "JOB_INVALID_VOLUME", `Job ${j.id || `#${idx+1}`} volume is not a number`, "jobs"));
    }
    if (vol < 0) {
      derived.warnings.push(warn("danger", "JOB_NEGATIVE_VOLUME", `Job ${j.id || `#${idx+1}`} volume is negative`, "jobs"));
    }
  });
  derived.totalVolume = round2(volSum);

  // Trucks: sum capacity
  let capSum = 0;
  day.trucks.forEach((t, idx) => {
    const cap = numOrZero(t.capacity);
    capSum += cap;

    if (String(t.capacity ?? "").trim() && !Number.isFinite(Number(String(t.capacity).replace(/,/g,"")))) {
      derived.warnings.push(warn("warn", "TRUCK_INVALID_CAPACITY", `Truck ${t.id || `#${idx+1}`} capacity not a number`, "trucks"));
    }
    if (cap < 0) {
      derived.warnings.push(warn("danger", "TRUCK_NEGATIVE_CAPACITY", `Truck ${t.id || `#${idx+1}`} capacity negative`, "trucks"));
    }
  });
  derived.totalTruckCapacity = round2(capSum);

  // Over capacity
  if (derived.totalVolume > 0 && derived.totalTruckCapacity > 0 && derived.totalVolume > derived.totalTruckCapacity) {
    derived.warnings.push(warn("danger", "OVER_CAPACITY", `Over capacity: volume ${derived.totalVolume} > capacity ${derived.totalTruckCapacity}`, "trucks"));
  } else if (derived.totalVolume > 0 && derived.totalTruckCapacity === 0) {
    derived.warnings.push(warn("warn", "NO_TRUCK_CAPACITY", `Volume ${derived.totalVolume} but no truck capacity entered`, "trucks"));
  }

  // Drivers: duplicate names
  const seen = new Map();
  day.drivers.forEach((d, idx) => {
    const name = String(d.name ?? "").trim().toLowerCase();
    if (!name) {
      derived.warnings.push(warn("warn", "DRIVER_MISSING_NAME", `Driver row ${idx+1} missing name`, "drivers"));
      return;
    }
    if (seen.has(name)) {
      derived.warnings.push(warn("danger", "DRIVER_DUPLICATE", `Driver "${d.name}" appears multiple times this day`, "drivers"));
    } else {
      seen.set(name, true);
    }
  });

  // Records: receipts + parse
  const receipts = day.records.filter(r => String(r.type || "").toLowerCase() === "receipt");
  derived.receiptsCount = receipts.length;

  let expenses = 0;
  receipts.forEach((r, idx) => {
    const parsed = parseReceipt(r.rawData || "");
    if (parsed.amount === null) {
      derived.warnings.push(warn("warn", "RECEIPT_PARSE_FAIL", `Receipt ${idx+1} missing/invalid Amount=`, "records"));
    } else {
      expenses += parsed.amount;
    }
  });

  derived.expensesSum = round2(expenses);

  // Net: revenue placeholder for now (0) - expenses
  derived.net = round2(0 - derived.expensesSum);

  day.derived = derived;
}

function warn(level, code, message, tab) {
  return { level, code, message, tab };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ---------------- UI wiring ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);

  // Sidebar nav
  document.querySelectorAll(".navbtn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Toolbar buttons (these ids exist in your build)
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
      renderDay();
      renderCalendar();
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
      renderDay();
      renderCalendar();
    }
  });

  safeOn("btnAddJob", () => {
    ensureDay(ui.activeDate);
    addJob(ui.activeDate);
    setView("day");
    setTab("jobs");
  });

  safeOn("btnAddReceipt", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, { type: "receipt", source: "driver", linkedEntity: "driver", rawData: "Vendor=, Amount=, Category=" });
    setView("day");
    setTab("records");
  });

  safeOn("btnAddNote", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" });
    setView("day");
    setTab("records");
  });

  safeOn("openToday", () => {
    ui.activeDate = toISODate(new Date());
    ensureDay(ui.activeDate);
    recomputeAll();
    setView("day");
  });

  safeOn("openCalendar", () => setView("calendar"));

  // Tabs
  const tabs = document.getElementById("tabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  // Day add row buttons (if present)
  safeOn("addJobRow", () => addJob(ui.activeDate));
  safeOn("addDriverRow", () => addDriver(ui.activeDate));
  safeOn("addTruckRow", () => addTruck(ui.activeDate));
  safeOn("addRecordRow", () => addRecord(ui.activeDate, { type: "note", source: "dispatcher", linkedEntity: "day", rawData: "Note=" }));
  safeOn("addMediaPlaceholder", () => addMedia(ui.activeDate));

  ensureDay(ui.activeDate);
  recomputeAll();
  renderAll();
});

/* ---------------- Navigation ---------------- */
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
    else ctx.textContent = "Foundation mode (Smart)";
  }

  if (view === "calendar") renderCalendar();
  if (view === "dashboard") renderDashboard();
  if (view === "day") renderDay();
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
  // compute derived for all known days
  Object.values(state.days).forEach(day => computeDerivedForDay(day));
  save();
}

/* ---------------- Render ---------------- */
function renderAll() {
  renderDashboard();
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
  if (sumEl) {
    sumEl.textContent = `${d.derived.jobsCount} job(s), ${d.derived.receiptsCount} receipt(s), ${d.drivers.length} driver(s), ${d.trucks.length} truck(s)`;
  }

  // Month snapshot
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
      div.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      statsEl.appendChild(div);
    });
  }

  // Pressure Points: populate the existing card if present (without HTML edits)
  injectPressurePoints();
}

function injectPressurePoints() {
  // Find the card with title containing "Pressure Points"
  const titles = Array.from(document.querySelectorAll(".card-title"));
  const t = titles.find(x => (x.textContent || "").toLowerCase().includes("pressure points"));
  if (!t) return;

  const card = t.closest(".card");
  if (!card) return;

  let ul = card.querySelector("ul.list");
  if (!ul) {
    ul = document.createElement("ul");
    ul.className = "list";
    card.appendChild(ul);
  }

  // Look ahead 7 days from today
  const start = new Date();
  const points = [];

  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + i);
    const iso = toISODate(dt);
    const day = state.days[iso];
    if (!day) continue;

    computeDerivedForDay(day);
    const dangers = day.derived.warnings.filter(w => w.level === "danger");
    const warns = day.derived.warnings.filter(w => w.level === "warn");

    if (dangers.length || warns.length) {
      points.push({
        iso,
        danger: dangers.length,
        warn: warns.length,
        top: (dangers[0]?.message || warns[0]?.message || "")
      });
    }
  }

  ul.innerHTML = "";
  if (points.length === 0) {
    ul.innerHTML = `<li>No pressure points detected in the next 7 days. Suspiciously calm.</li>`;
    return;
  }

  points.slice(0, 6).forEach(p => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="${p.danger ? "wlvl-danger" : "wlvl-warn"}">${p.danger ? "DANGER" : "WARN"}</span>
      <span class="muted">(${p.iso})</span> ${escapeHtml(p.top)}
      <span class="muted"> • ${p.danger} danger / ${p.warn} warn</span>
    `;
    ul.appendChild(li);
  });
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
      const recCount = dayObj.records.length;
      if (recCount) badges.push({ text: `${recCount} rec`, kind: "warn" });

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
        ${badges.map(b => `<span class="badge ${b.kind}">${b.text}</span>`).join("")}
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

function renderDay() {
  ensureDay(ui.activeDate);
  const dayObj = state.days[ui.activeDate];

  computeDerivedForDay(dayObj);
  save();

  const dayLabel = document.getElementById("dayLabel");
  if (dayLabel) dayLabel.textContent = formatDateLong(ui.activeDate);

  const dayMeta = document.getElementById("dayMeta");
  if (dayMeta) {
    dayMeta.textContent = `${dayObj.jobs.length} job(s) • ${dayObj.records.length} record(s) • ${dayObj.media.length} media • ${dayObj.drivers.length} drivers • ${dayObj.trucks.length} trucks`;
  }

  // Totals pills
  const totalsEl = document.getElementById("dayTotals");
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="total-pill">Jobs: ${dayObj.derived.jobsCount}</div>
      <div class="total-pill">Volume: ${dayObj.derived.totalVolume}</div>
      <div class="total-pill">Capacity: ${dayObj.derived.totalTruckCapacity}</div>
      <div class="total-pill">Receipts: ${dayObj.derived.receiptsCount}</div>
      <div class="total-pill">Expenses: $${dayObj.derived.expensesSum}</div>
    `;
  }

  // Inject warnings panel (no HTML edits)
  injectDayWarningsPanel(dayObj);

  // Tables (these IDs exist in your app)
  renderEditableTable("jobsBody", dayObj.jobs,
    [
      { key: "id" },
      { key: "customer" },
      { key: "pickup" },
      { key: "dropoff" },
      { key: "volume" },
      { key: "status" },
    ],
    (rowIndex, key, value) => {
      dayObj.jobs[rowIndex][key] = value;
      computeDerivedForDay(dayObj);
      save();
      renderCalendar();
      renderDashboard();
      renderDay(); // refresh warnings + totals
    },
    (rowIndex, key, td) => validateCellJobs(dayObj, rowIndex, key, td)
  );

  renderEditableTable("driversBody", dayObj.drivers,
    [
      { key: "name" },
      { key: "status" },
      { key: "hours" },
      { key: "notes" },
    ],
    (rowIndex, key, value) => {
      dayObj.drivers[rowIndex][key] = value;
      computeDerivedForDay(dayObj);
      save();
      renderCalendar();
      renderDashboard();
      renderDay();
    },
    (rowIndex, key, td) => validateCellDrivers(dayObj, rowIndex, key, td)
  );

  renderEditableTable("trucksBody", dayObj.trucks,
    [
      { key: "id" },
      { key: "status" },
      { key: "capacity" },
      { key: "mileage" },
    ],
    (rowIndex, key, value) => {
      dayObj.trucks[rowIndex][key] = value;
      computeDerivedForDay(dayObj);
      save();
      renderCalendar();
      renderDashboard();
      renderDay();
    },
    (rowIndex, key, td) => validateCellTrucks(dayObj, rowIndex, key, td)
  );

  renderEditableTable("recordsBody", dayObj.records,
    [
      { key: "type" },
      { key: "source" },
      { key: "linkedEntity" },
      { key: "rawData" },
      { key: "approved" },
      { key: "created", readonly: true }
    ],
    (rowIndex, key, value) => {
      if (key === "created") return;
      dayObj.records[rowIndex][key] = value;
      computeDerivedForDay(dayObj);
      save();
      renderCalendar();
      renderDashboard();
      renderDay();
    }
  );

  renderEditableTable("mediaBody", dayObj.media,
    [
      { key: "type" },
      { key: "ref" },
      { key: "linkedRecord" },
      { key: "notes" },
      { key: "created", readonly: true }
    ],
    (rowIndex, key, value) => {
      if (key === "created") return;
      dayObj.media[rowIndex][key] = value;
      computeDerivedForDay(dayObj);
      save();
      renderCalendar();
      renderDay();
    }
  );

  renderEditableTable("aiBody", dayObj.aiAnnotations,
    [
      { key: "model" },
      { key: "confidence" },
      { key: "summary" },
      { key: "warnings" },
      { key: "created", readonly: true }
    ],
    (rowIndex, key, value) => {
      if (key === "created") return;
      dayObj.aiAnnotations[rowIndex][key] = value;
      save();
    }
  );

  setTab(ui.activeTab);
}

function injectDayWarningsPanel(dayObj) {
  const dayView = document.getElementById("view-day");
  if (!dayView) return;

  let panel = document.getElementById("smartWarningsPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "smartWarningsPanel";
    panel.className = "card warnings-card wide";
    // insert after day-head if possible
    const head = dayView.querySelector(".day-head");
    if (head && head.parentElement) head.parentElement.insertBefore(panel, head.nextSibling);
    else dayView.prepend(panel);
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
      ? `<div class="muted">No warnings. Either you’re crushing it or you haven’t entered any data yet.</div>`
      : `<ul class="warnings-list">
          ${warnings.slice(0, 12).map(w =>
            `<li class="${w.level === "danger" ? "wlvl-danger" : "wlvl-warn"}">
               ${escapeHtml(w.message)} <span class="muted">(${w.tab || "general"})</span>
             </li>`
          ).join("")}
        </ul>`
    }
  `;
}

/* ---------------- Editable tables ---------------- */
function renderEditableTable(tbodyId, rows, columns, onUpdate, onValidateCell) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
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
        td.addEventListener("input", () => onUpdate(idx, col.key, td.textContent.trim()));
        td.addEventListener("blur", () => onUpdate(idx, col.key, td.textContent.trim()));
      } else {
        td.style.color = "#7e89b8";
      }

      if (typeof onValidateCell === "function") {
        // validate after paint
        queueMicrotask(() => onValidateCell(idx, col.key, td));
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ---------------- Cell validators (visual hints) ---------------- */
function clearCellMarks(td) {
  td.classList.remove("cell-bad");
  td.classList.remove("cell-warn");
}

function validateCellJobs(dayObj, rowIndex, key, td) {
  clearCellMarks(td);
  const j = dayObj.jobs[rowIndex];
  if (!j) return;

  if (key === "customer" && !String(j.customer || "").trim()) td.classList.add("cell-bad");
  if ((key === "pickup" || key === "dropoff") && !String(j[key] || "").trim()) td.classList.add("cell-warn");

  if (key === "volume") {
    const raw = String(j.volume || "").trim();
    if (!raw) td.classList.add("cell-warn");
    const n = Number(raw.replace(/,/g, ""));
    if (raw && !Number.isFinite(n)) td.classList.add("cell-bad");
    if (Number.isFinite(n) && n < 0) td.classList.add("cell-bad");
  }
}

function validateCellDrivers(dayObj, rowIndex, key, td) {
  clearCellMarks(td);
  const d = dayObj.drivers[rowIndex];
  if (!d) return;

  if (key === "name" && !String(d.name || "").trim()) td.classList.add("cell-warn");
}

function validateCellTrucks(dayObj, rowIndex, key, td) {
  clearCellMarks(td);
  const t = dayObj.trucks[rowIndex];
  if (!t) return;

  if (key === "capacity") {
    const raw = String(t.capacity || "").trim();
    if (!raw) td.classList.add("cell-warn");
    const n = Number(raw.replace(/,/g, ""));
    if (raw && !Number.isFinite(n)) td.classList.add("cell-bad");
    if (Number.isFinite(n) && n < 0) td.classList.add("cell-bad");
  }
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
  });
  save();
  recomputeAll();
  renderDay();
  renderCalendar();
  renderDashboard();
}

function addDriver(dateISO) {
  const d = ensureDay(dateISO);
  d.drivers.push({ name: "", status: "available", hours: "", notes: "" });
  save();
  recomputeAll();
  renderDay();
  renderCalendar();
  renderDashboard();
}

function addTruck(dateISO) {
  const d = ensureDay(dateISO);
  d.trucks.push({ id: "", status: "active", capacity: "", mileage: "" });
  save();
  recomputeAll();
  renderDay();
  renderCalendar();
  renderDashboard();
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
  renderCalendar();
  renderDashboard();
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
  save();
  recomputeAll();
  renderDay();
  renderCalendar();
}

/* ---------------- Utilities ---------------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
