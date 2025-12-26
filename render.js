// render.js — all UI rendering (self-healing, date-first)

import { state, STATUS, STATUS_LABEL, RECEIPT_CATEGORIES, VIEWS } from "./state.js";
import { ymd, startOfDay, money, clampMoney, normalizeJob, normalizeReceipt } from "./storage.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const monthName = (m) =>
  ["January","February","March","April","May","June","July","August","September","October","November","December"][m];

export function ensureScaffold() {
  // If your HTML already has view containers, we don't overwrite.
  if ($("[id^='view-']")) return;

  const app = document.createElement("div");
  app.id = "fleetApp";
  app.innerHTML = `
    <div class="fleet-topbar">
      <div class="fleet-brand">Fleet CRM</div>
      <div class="fleet-topnav">
        ${VIEWS.map(v => `<button class="fleet-btn" data-view="${v}">${labelFor(v)}</button>`).join("")}
      </div>
      <button class="fleet-btn" id="btnToday">Today</button>
      <button class="fleet-btn" id="btnPrev">◀</button>
      <button class="fleet-btn" id="btnNext">▶</button>
    </div>

    <aside class="fleet-sidebar">
      ${VIEWS.map(v => `<button class="fleet-btn fleet-sidebtn" data-view="${v}">${labelFor(v)}</button>`).join("")}
    </aside>

    <main class="fleet-main" id="fleetMain">
      ${VIEWS.map(v => `<section id="view-${v}" class="view"></section>`).join("")}
    </main>
  `;
  document.body.prepend(app);
}

export function renderAll() {
  // Toggle active
  $$("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  $$("[id^='view-']").forEach(v => v.style.display = "none");
  const panel = $(`#view-${state.view}`);
  if (panel) panel.style.display = "block";

  // Render view
  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "calendar") renderCalendar();
  else if (state.view === "day") renderDay();
  else if (state.view === "jobs") renderJobs();
  else if (state.view === "receipts") renderReceipts();
  else if (state.view === "drivers") renderDrivers();
  else if (state.view === "trucks") renderTrucks();
  else if (state.view === "dispatch") renderDispatch();
  else renderComingSoon(state.view);
}

function labelFor(view) {
  return ({
    dashboard: "Dashboard",
    calendar: "Calendar",
    day: "Day Workspace",
    jobs: "Jobs",
    receipts: "Receipts",
    drivers: "Drivers",
    trucks: "Trucks",
    dispatch: "Dispatch",
    finances: "Finances",
    inventory: "Inventory",
    aiscanner: "AI Scanner",
  })[view] || view;
}

function jobsByDate(dateStr) {
  return state.jobs.filter(j => j.date === dateStr);
}
function receiptsByDate(dateStr) {
  return state.receipts.filter(r => r.date === dateStr);
}
function sumJobRevenue(dateStr) {
  return clampMoney(jobsByDate(dateStr).reduce((s,j)=> s + (j.status===STATUS.cancelled ? 0 : clampMoney(j.amount)), 0));
}
function sumReceiptExpense(dateStr) {
  return clampMoney(receiptsByDate(dateStr).reduce((s,r)=> s + clampMoney(r.amount), 0));
}
function monthTotals(y, m) {
  let rev = 0, exp = 0;
  for (const j of state.jobs) {
    const d = new Date(j.date);
    if (!Number.isNaN(d.getTime()) && d.getFullYear()===y && d.getMonth()===m && j.status!==STATUS.cancelled) rev += clampMoney(j.amount);
  }
  for (const r of state.receipts) {
    const d = new Date(r.date);
    if (!Number.isNaN(d.getTime()) && d.getFullYear()===y && d.getMonth()===m) exp += clampMoney(r.amount);
  }
  return { revenue: clampMoney(rev), expenses: clampMoney(exp), net: clampMoney(rev-exp) };
}

function renderDashboard() {
  const host = $("#view-dashboard");
  if (!host) return;

  const todayStr = ymd(startOfDay(new Date()));
  const y = state.monthCursor.getFullYear();
  const m = state.monthCursor.getMonth();
  const mt = monthTotals(y, m);

  host.innerHTML = `
    <div class="panel">
      <div class="title">Dashboard</div>
      <div class="sub">Date-first workflow. Calendar drives jobs, drivers, trucks, dispatch, and receipts.</div>
    </div>

    <div class="grid3">
      <div class="panel">
        <div class="title">Today</div>
        <div class="sub">${escapeHtml(todayStr)}</div>
        <div class="kpi">Jobs: <b>${jobsByDate(todayStr).length}</b> · Receipts: <b>${receiptsByDate(todayStr).length}</b></div>
        <div class="kpi">Revenue: <b>${money(sumJobRevenue(todayStr))}</b></div>
        <div class="kpi">Expenses: <b>${money(sumReceiptExpense(todayStr))}</b></div>
        <div class="kpi">Net: <b>${money(sumJobRevenue(todayStr)-sumReceiptExpense(todayStr))}</b></div>
        <div style="margin-top:10px;">
          <button class="btn primary" data-view="day">Open Day Workspace</button>
        </div>
      </div>

      <div class="panel">
        <div class="title">Month Snapshot</div>
        <div class="sub">${escapeHtml(monthName(m))} ${y}</div>
        <div class="kpi">Revenue: <b>${money(mt.revenue)}</b></div>
        <div class="kpi">Expenses: <b>${money(mt.expenses)}</b></div>
        <div class="kpi">Net: <b>${money(mt.net)}</b></div>
        <div style="margin-top:10px;">
          <button class="btn" data-view="calendar">Open Calendar</button>
        </div>
      </div>

      <div class="panel">
        <div class="title">Quick Calendar</div>
        <div class="sub">Tap a day to jump into Day Workspace.</div>
        <div id="quickCal" class="pills"></div>
      </div>
    </div>

    <div class="panel">
      <div class="title">Pressure Points</div>
      <div class="sub">Markers show where jobs and receipts cluster. Use these to schedule trucks/drivers.</div>
    </div>
  `;

  const qc = $("#quickCal");
  if (!qc) return;

  qc.innerHTML = "";
  const y2 = state.currentDate.getFullYear();
  const m2 = state.currentDate.getMonth();
  const daysInMonth = new Date(y2, m2 + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y2, m2, day);
    const ds = ymd(d);
    const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
    const rc = receiptsByDate(ds).length;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill";
    b.textContent = String(day);
    if (jc) b.classList.add("has-jobs");
    if (rc) b.classList.add("has-receipts");
    b.addEventListener("click", () => {
      state.currentDate = startOfDay(d);
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      state.view = "day";
      renderAll();
    });
    qc.appendChild(b);
  }
}

function renderCalendar() {
  const host = $("#view-calendar");
  if (!host) return;

  const y = state.monthCursor.getFullYear();
  const m = state.monthCursor.getMonth();
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = ymd(startOfDay(new Date()));

  host.innerHTML = `
    <div class="panel">
      <div class="title">Calendar</div>
      <div class="sub">Month view. Click a day to open Day Workspace.</div>
      <div class="cal-head">
        <div class="cal-label">${escapeHtml(monthName(m))} ${y}</div>
        <div class="cal-controls">
          <button class="btn" id="calPrev">Prev</button>
          <button class="btn" id="calToday">Today</button>
          <button class="btn" id="calNext">Next</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="calendar-grid" id="calendarGrid"></div>
    </div>
  `;

  const grid = $("#calendarGrid");
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  dow.forEach(d => {
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = d;
    grid.appendChild(h);
  });

  for (let i=0; i<firstDow; i++){
    const pad = document.createElement("div");
    pad.className = "day pad";
    grid.appendChild(pad);
  }

  for (let day=1; day<=daysInMonth; day++){
    const d = new Date(y, m, day);
    const ds = ymd(d);
    const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
    const rc = receiptsByDate(ds).length;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    if (ds === todayStr) cell.classList.add("today");

    cell.innerHTML = `
      <div class="num">${day}</div>
      <div class="markerbar">
        ${jc ? `<span class="chip chip-jobs">${jc} job${jc===1?"":"s"}</span>` : ""}
        ${rc ? `<span class="chip chip-receipts">🧾 ${rc}</span>` : ""}
      </div>
    `;

    cell.addEventListener("click", () => {
      state.currentDate = startOfDay(d);
      state.view = "day";
      renderAll();
    });

    grid.appendChild(cell);
  }

  $("#calPrev").onclick = () => { state.monthCursor = new Date(y, m-1, 1); renderAll(); };
  $("#calNext").onclick = () => { state.monthCursor = new Date(y, m+1, 1); renderAll(); };
  $("#calToday").onclick = () => {
    const now = new Date();
    state.currentDate = startOfDay(now);
    state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
    renderAll();
  };
}

function renderDay() {
  const host = $("#view-day");
  if (!host) return;

  const dateStr = ymd(state.currentDate);
  const jobs = jobsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const receipts = receiptsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));

  const rev = sumJobRevenue(dateStr);
  const exp = sumReceiptExpense(dateStr);
  const net = clampMoney(rev-exp);

  const jobOptions = [
    `<option value="">(Not linked)</option>`,
    ...jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</option>`)
  ].join("");

  host.innerHTML = `
    <div class="panel">
      <div class="title">Day Workspace</div>
      <div class="sub">${escapeHtml(dateStr)} · Revenue ${money(rev)} · Expenses ${money(exp)} · Net ${money(net)}</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn" data-view="calendar">Back to Calendar</button>
      </div>
    </div>

    <div class="panel">
      <div class="title">Jobs</div>
      <div class="sub">Status dropdowns drive totals and calendar markers.</div>

      <div class="row" style="margin-top:10px;">
        <label class="field">
          <span>Job #</span><input id="jobNum" placeholder="J-1002" />
        </label>
        <label class="field">
          <span>Customer</span><input id="jobCustomer" placeholder="Customer name" />
        </label>
        <label class="field">
          <span>Pickup</span><input id="jobPickup" placeholder="Pickup address" />
        </label>
        <label class="field">
          <span>Dropoff</span><input id="jobDropoff" placeholder="Dropoff address" />
        </label>
        <label class="field" style="min-width:140px;">
          <span>Amount</span><input id="jobAmount" type="number" step="0.01" placeholder="0.00" />
        </label>
        <button class="btn primary" id="jobAdd">Add Job</button>
      </div>

      <div id="jobsList" class="stack" style="margin-top:12px;"></div>
    </div>

    <div class="panel">
      <div class="title">Receipts</div>
      <div class="sub">Upload/scanner comes later. For now: structured receipt logging + totals.</div>

      <div class="row" style="margin-top:10px; align-items:end;">
        <label class="field">
          <span>Vendor</span><input id="rcVendor" placeholder="Shell, Home Depot..." />
        </label>
        <label class="field" style="min-width:140px;">
          <span>Amount</span><input id="rcAmount" type="number" step="0.01" placeholder="0.00" />
        </label>
        <label class="field" style="min-width:180px;">
          <span>Category</span>
          <select id="rcCategory">
            <option value="">Uncategorized</option>
            ${RECEIPT_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
          </select>
        </label>
        <label class="field" style="min-width:240px;">
          <span>Link to Job</span>
          <select id="rcJob">${jobOptions}</select>
        </label>
        <label class="field" style="min-width:260px; flex:1;">
          <span>Notes</span><input id="rcNotes" placeholder="receipt # / reason" />
        </label>
        <button class="btn primary" id="rcAdd">Add Receipt</button>
      </div>

      <div id="rcList" class="stack" style="margin-top:12px;"></div>
    </div>
  `;

  // Jobs list
  const jHost = $("#jobsList");
  if (jobs.length === 0) jHost.innerHTML = `<div class="muted">No jobs for this day yet.</div>`;
  else {
    jHost.innerHTML = jobs.map(j => `
      <div class="job-row">
        <div class="job-main">
          <div class="job-title">${escapeHtml(j.jobNumber || "")} ${escapeHtml(j.customer || "Customer")}</div>
          <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")} · ${money(j.amount)}</div>
        </div>
        <div class="job-actions">
          <select data-job-status="${escapeHtml(j.id)}">
            <option value="scheduled" ${j.status===STATUS.scheduled?"selected":""}>Scheduled</option>
            <option value="completed" ${j.status===STATUS.completed?"selected":""}>Completed</option>
            <option value="cancelled" ${j.status===STATUS.cancelled?"selected":""}>Cancelled</option>
          </select>
          <button class="btn" data-job-edit="${escapeHtml(j.id)}">Edit</button>
          <button class="btn danger" data-job-del="${escapeHtml(j.id)}">Delete</button>
        </div>
      </div>
    `).join("");
  }

  // Receipts list
  const rHost = $("#rcList");
  if (receipts.length === 0) rHost.innerHTML = `<div class="muted">No receipts for this day yet.</div>`;
  else {
    rHost.innerHTML = receipts.map(r => {
      const linked = r.jobId ? state.jobs.find(j => j.id === r.jobId) : null;
      return `
        <div class="receipt-row">
          <div class="receipt-main">
            <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")} · ${money(r.amount)}
              ${linked ? `<span class="chip chip-jobs" style="margin-left:8px;">Linked: ${escapeHtml(linked.customer || "Job")}</span>` : ""}
            </div>
            <div class="receipt-sub">${escapeHtml(r.notes || "")}</div>
          </div>
          <div class="receipt-actions">
            <button class="btn" data-rc-edit="${escapeHtml(r.id)}">Edit</button>
            <button class="btn danger" data-rc-del="${escapeHtml(r.id)}">Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }
}

function renderJobs() {
  const host = $("#view-jobs");
  host.innerHTML = `
    <div class="panel">
      <div class="title">Jobs</div>
      <div class="sub">Master list. (Next step: filters by date/status + export.)</div>
    </div>
    <div class="panel">
      <div class="muted">Jobs stored: <b>${state.jobs.length}</b></div>
    </div>
  `;
}

function renderReceipts() {
  const host = $("#view-receipts");
  const y = state.monthCursor.getFullYear();
  const m = state.monthCursor.getMonth();
  const monthReceipts = state.receipts.filter(r => {
    const d = new Date(r.date);
    return !Number.isNaN(d.getTime()) && d.getFullYear()===y && d.getMonth()===m;
  });

  const total = clampMoney(monthReceipts.reduce((s,r)=>s+clampMoney(r.amount),0));

  host.innerHTML = `
    <div class="panel">
      <div class="title">Receipts</div>
      <div class="sub">Month-to-date (${escapeHtml(monthName(m))} ${y})</div>
      <div class="kpi">Total Expenses: <b>${money(total)}</b></div>
    </div>
    <div class="panel">
      <div class="muted">Receipts stored: <b>${monthReceipts.length}</b></div>
    </div>
  `;
}

function renderDrivers() {
  const host = $("#view-drivers");
  host.innerHTML = `
    <div class="panel">
      <div class="title">Drivers</div>
      <div class="sub">Spreadsheet-style editing. (Next: assign drivers per date.)</div>
    </div>
    ${renderSheet("drivers")}
  `;
}

function renderTrucks() {
  const host = $("#view-trucks");
  host.innerHTML = `
    <div class="panel">
      <div class="title">Trucks</div>
      <div class="sub">Spreadsheet-style editing. (Next: availability by date.)</div>
    </div>
    ${renderSheet("trucks")}
  `;
}

function renderDispatch() {
  const host = $("#view-dispatch");
  host.innerHTML = `
    <div class="panel">
      <div class="title">Dispatch</div>
      <div class="sub">Date-first assignments (job + driver + truck + time).</div>
    </div>
    ${renderSheet("dispatch")}
  `;
}

function renderComingSoon(view) {
  const host = $(`#view-${view}`);
  host.innerHTML = `
    <div class="panel">
      <div class="title">${escapeHtml(labelFor(view))}</div>
      <div class="sub">Wired to routing. Next step: spreadsheet + automation.</div>
    </div>
  `;
}

function renderSheet(kind) {
  // lightweight spreadsheet table
  const rows = state[kind] || [];
  const cols = kind === "drivers"
    ? ["name","role","phone","status","notes"]
    : kind === "trucks"
    ? ["unit","plate","capacity","status","notes"]
    : ["date","jobId","driverId","truckId","startTime","endTime","notes"];

  const header = cols.map(c => `<th>${escapeHtml(c)}</th>`).join("");
  const body = rows.map(r => `
    <tr data-sheet="${kind}" data-id="${escapeHtml(r.id)}">
      ${cols.map(c => `<td contenteditable="true" data-col="${escapeHtml(c)}">${escapeHtml(r[c] ?? "")}</td>`).join("")}
      <td><button class="btn danger" data-sheet-del="${kind}" data-id="${escapeHtml(r.id)}">Delete</button></td>
    </tr>
  `).join("");

  return `
    <div class="panel">
      <div class="row">
        <button class="btn primary" data-sheet-add="${kind}">Add Row</button>
        <button class="btn" data-sheet-save="${kind}">Save</button>
        <span class="muted">Rows: <b>${rows.length}</b></span>
      </div>
      <div class="table-wrap">
        <table class="sheet">
          <thead><tr>${header}<th></th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="muted" style="margin-top:10px;">Edits are local until you hit Save.</div>
    </div>
  `;
}

export function handlersForDay() {
  // no-op: kept for clarity
}

export function bindRenderTimeEvents() {
  // no-op: global events bound in apps_v5.js
}
