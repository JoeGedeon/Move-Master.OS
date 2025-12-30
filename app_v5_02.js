/* =========================================================
   Move-Master.OS — app_v5_01.js (SMART BASE + SHEETS + DISPATCH)
   - Works with your HTML ids/classes:
     .nav-item[data-view]
     #view-dashboard #view-calendar #view-day #view-drivers #view-trucks
     #view-dispatch #view-finance #view-inventory #view-scanner #view-sheets
     Topbar: #btnPrev #btnToday #btnNext #btnAddJob #btnAddReceipt
     Calendar: #monthLabel #calendarGrid #dashboardCalendar
     Day: #dayTitle #dayJobsList #dayReceiptsList
     Modals: #modalOverlay #jobModal #receiptModal ...
     Receipt additions: #receiptDriverId #receiptPhoto #receiptPhotoHint
   ========================================================= */

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const clampMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };
  const money = (n) => `$${clampMoney(n).toFixed(2)}`;

  function makeId(prefix = "id") {
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function setPill(text, ok) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove("ok", "bad");
    pill.classList.add(ok ? "ok" : "bad");
  }

  function safe(fn) {
    try { fn(); }
    catch (e) {
      console.error("[Move-Master.OS]", e);
      setPill("JS: error ❌", false);
      alert("JS error. Open console if you can. (iPad Safari dev tools are… a vibe.)");
    }
  }

  // ---------------------------
  // Storage keys
  // ---------------------------
  const LS = {
    jobs: "mm_jobs_v5_01",
    receipts: "mm_receipts_v5_01",
    drivers: "mm_drivers_v5_01",
    trucks: "mm_trucks_v5_01",
    dispatch: "mm_dispatch_v5_01",
    inventory: "mm_inventory_v5_01",
    scans: "mm_scans_v5_01",
    ui: "mm_ui_v5_01",
  };

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveArray(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  }
  function loadObj(key, fallback = {}) {
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : fallback;
      return (obj && typeof obj === "object") ? obj : fallback;
    } catch { return fallback; }
  }
  function saveObj(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  // ---------------------------
  // Domain
  // ---------------------------
  const STATUS = { scheduled:"scheduled", completed:"completed", cancelled:"cancelled" };

  function normalizeJob(j) {
    const o = { ...(j || {}) };
    if (!o.id) o.id = makeId("job");
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    if (!o.status || !STATUS[o.status]) o.status = STATUS.scheduled;
    o.customer = (o.customer || "").trim();
    o.pickup = (o.pickup || "").trim();
    o.dropoff = (o.dropoff || "").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeReceipt(r) {
    const o = { ...(r || {}) };
    if (!o.id) o.id = makeId("rcpt");
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    o.vendor = (o.vendor || "").trim();
    o.category = (o.category || "").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.linkedJobId = (o.linkedJobId || "").trim();
    o.driverId = (o.driverId || "").trim();          // NEW
    o.photo = (o.photo || "").trim();                // base64 thumb
    o.photoName = (o.photoName || "").trim();        // optional
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeNamedRow(x, prefix) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId(prefix);
    o.name = (o.name || "").trim();
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeInventoryItem(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("inv");
    o.name = (o.name || "").trim();
    o.category = (o.category || "Other").trim();
    o.cuft = Number(o.cuft ?? 0);
    if (!Number.isFinite(o.cuft)) o.cuft = 0;
    o.cuft = Math.round(o.cuft * 10) / 10;
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeScan(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("scan");
    o.type = (o.type || "unknown").trim();
    o.source = (o.source || "manual").trim();
    o.text = (o.text || "").trim();
    o.result = o.result || {};
    o.createdAt = o.createdAt || Date.now();
    return o;
  }

  // Dispatch model:
  // state.dispatch = { "YYYY-MM-DD": { [jobId]: { driverId, truckId, notes, status } } }
  function normalizeDispatch(d) {
    const obj = (d && typeof d === "object") ? d : {};
    for (const date of Object.keys(obj)) {
      const bucket = obj[date];
      if (!bucket || typeof bucket !== "object") { obj[date] = {}; continue; }
      for (const jobId of Object.keys(bucket)) {
        const row = bucket[jobId] || {};
        bucket[jobId] = {
          driverId: String(row.driverId || ""),
          truckId: String(row.truckId || ""),
          notes: String(row.notes || ""),
          status: String(row.status || "assigned"),
          updatedAt: row.updatedAt || Date.now(),
        };
      }
    }
    return obj;
  }

  // ---------------------------
  // State
  // ---------------------------
  const uiSaved = loadObj(LS.ui, {});
  const state = {
    view: uiSaved.view || "dashboard",
    currentDate: uiSaved.currentDate ? startOfDay(new Date(uiSaved.currentDate)) : startOfDay(new Date()),
    monthCursor: uiSaved.monthCursor ? new Date(uiSaved.monthCursor) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),
    drivers: loadArray(LS.drivers).map(x => normalizeNamedRow(x, "drv")),
    trucks: loadArray(LS.trucks).map(x => normalizeNamedRow(x, "trk")),
    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans).map(normalizeScan),
    dispatch: normalizeDispatch(loadObj(LS.dispatch, {})),

    editingJobId: null,
    editingReceiptId: null,

    sheetsTab: uiSaved.sheetsTab || "jobs", // jobs | receipts | drivers | trucks | dispatch
  };

  function persist() {
    saveArray(LS.jobs, state.jobs);
    saveArray(LS.receipts, state.receipts);
    saveArray(LS.drivers, state.drivers);
    saveArray(LS.trucks, state.trucks);
    saveArray(LS.inventory, state.inventory);
    saveArray(LS.scans, state.scans);
    saveObj(LS.dispatch, state.dispatch);
    saveObj(LS.ui, {
      view: state.view,
      currentDate: ymd(state.currentDate),
      monthCursor: state.monthCursor.toISOString(),
      sheetsTab: state.sheetsTab,
    });
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) { return state.jobs.filter(j => j.date === dateStr); }
  function receiptsByDate(dateStr) { return state.receipts.filter(r => r.date === dateStr); }

  function sumRevenue(dateStr) {
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumExpenses(dateStr) {
    let total = 0;
    for (const r of receiptsByDate(dateStr)) total += clampMoney(r.amount);
    return clampMoney(total);
  }

  function monthTotals(year, monthIndex) {
    let revenue = 0, expenses = 0;

    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      if (j.status === STATUS.cancelled) continue;
      revenue += clampMoney(j.amount);
    }

    for (const r of state.receipts) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      expenses += clampMoney(r.amount);
    }

    revenue = clampMoney(revenue);
    expenses = clampMoney(expenses);
    return { revenue, expenses, net: clampMoney(revenue - expenses) };
  }

  // ---------------------------
  // Router
  // ---------------------------
  function setView(name) {
    state.view = name;

    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));

    renderAll();
    persist();
  }

  // ---------------------------
  // Dashboard
  // ---------------------------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);
    $("#todayLine") && ($("#todayLine").textContent = `${todayStr}`);

    const todayStats = $("#todayStats");
    if (todayStats) {
      const rev = sumRevenue(todayStr);
      const exp = sumExpenses(todayStr);
      const net = clampMoney(rev - exp);
      todayStats.innerHTML = `
        <div>Jobs: <strong>${jobsByDate(todayStr).length}</strong></div>
        <div>Receipts: <strong>${receiptsByDate(todayStr).length}</strong></div>
        <div style="margin-top:6px;">Revenue: <strong>${money(rev)}</strong></div>
        <div>Expenses: <strong>${money(exp)}</strong></div>
        <div>Net: <strong>${money(net)}</strong></div>
      `;
    }

    const ms = $("#monthSnapshot");
    if (ms) {
      const y = state.monthCursor.getFullYear();
      const m = state.monthCursor.getMonth();
      const t = monthTotals(y, m);
      ms.innerHTML = `
        <div><strong>${MONTHS[m]} ${y}</strong></div>
        <div style="margin-top:6px;">Revenue: <strong>${money(t.revenue)}</strong></div>
        <div>Expenses: <strong>${money(t.expenses)}</strong></div>
        <div>Net: <strong>${money(t.net)}</strong></div>
      `;
    }

    const quick = $("#dashboardCalendar");
    if (quick) renderQuickCalendar(quick);
  }

  function renderQuickCalendar(container) {
    const y = state.currentDate.getFullYear();
    const m = state.currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    container.innerHTML = "";
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (sameDay(d, state.currentDate)) btn.classList.add("active");
      if (jobsByDate(dateStr).length) btn.classList.add("has-jobs");
      if (receiptsByDate(dateStr).length) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      container.appendChild(btn);
    }
  }

  // ---------------------------
  // Full calendar
  // ---------------------------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    label.textContent = `${MONTHS[m]} ${y}`;
    grid.innerHTML = "";

    for (const d of DOW) {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      grid.appendChild(h);
    }

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

    const today = startOfDay(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(day);

      const marker = document.createElement("div");
      marker.className = "markerbar";

      const jobs = jobsByDate(dateStr);
      const receipts = receiptsByDate(dateStr);

      const scheduled = jobs.filter(j => j.status === STATUS.scheduled).length;
      const completed = jobs.filter(j => j.status === STATUS.completed).length;
      const cancelled = jobs.filter(j => j.status === STATUS.cancelled).length;

      if (scheduled) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `S:${scheduled}`;
        marker.appendChild(chip);
        cell.classList.add("has-scheduled");
      }
      if (completed) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `C:${completed}`;
        marker.appendChild(chip);
        cell.classList.add("has-completed");
      }
      if (cancelled) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `X:${cancelled}`;
        marker.appendChild(chip);
        cell.classList.add("has-cancelled");
      }
      if (receipts.length) {
        const chip = document.createElement("span");
        chip.className = "chip chip-receipts";
        chip.textContent = `🧾 ${receipts.length}`;
        marker.appendChild(chip);
        cell.classList.add("has-receipts");
      }

      cell.appendChild(num);
      cell.appendChild(marker);

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ---------------------------
  // Day workspace
  // ---------------------------
  function renderDay() {
    const dateStr = ymd(state.currentDate);
    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace – ${dateStr}`;
    renderDayJobs(dateStr);
    renderDayReceipts(dateStr);
  }

  function renderDayJobs(dateStr) {
    const host = $("#dayJobsList");
    if (!host) return;

    const jobs = jobsByDate(dateStr).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const rev = sumRevenue(dateStr);
    const exp = sumExpenses(dateStr);
    const net = clampMoney(rev - exp);

    host.innerHTML = `
      <div class="day-totals">
        <div><strong>Totals</strong></div>
        <div>Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}</div>
      </div>
    `;

    if (!jobs.length) {
      host.innerHTML += `<div class="muted empty">No jobs for this day yet.</div>`;
      return;
    }

    for (const job of jobs) {
      const row = document.createElement("div");
      row.className = "job-row";
      if (job.status === STATUS.completed) row.classList.add("is-completed");
      if (job.status === STATUS.cancelled) row.classList.add("is-cancelled");

      row.innerHTML = `
        <div class="job-main">
          <div class="job-title">${escapeHtml(job.customer || "Customer")}</div>
          <div class="job-sub">${escapeHtml(job.pickup || "Pickup")} → ${escapeHtml(job.dropoff || "Dropoff")} · ${money(job.amount)}</div>
        </div>
        <div class="job-actions">
          <select class="job-status" data-job-status="${escapeHtml(job.id)}">
            <option value="scheduled" ${job.status === STATUS.scheduled ? "selected" : ""}>Scheduled</option>
            <option value="completed" ${job.status === STATUS.completed ? "selected" : ""}>Completed</option>
            <option value="cancelled" ${job.status === STATUS.cancelled ? "selected" : ""}>Cancelled</option>
          </select>
          <button class="btn" type="button" data-job-edit="${escapeHtml(job.id)}">Edit</button>
          <button class="btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
        </div>
      `;
      host.appendChild(row);
    }

    $$("[data-job-status]", host).forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-job-status");
        const job = state.jobs.find(j => j.id === id);
        if (!job) return;
        job.status = sel.value;
        job.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-job-edit]", host).forEach((btn) =>
      btn.addEventListener("click", () => openJobModal(btn.getAttribute("data-job-edit")))
    );

    $$("[data-job-del]", host).forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter(j => j.id !== id);

        // cleanup dispatch for this job
        for (const date of Object.keys(state.dispatch)) {
          if (state.dispatch[date] && state.dispatch[date][id]) delete state.dispatch[date][id];
        }

        // unlink receipts
        state.receipts = state.receipts.map(r => (
          r.linkedJobId === id
            ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() })
            : r
        ));

        persist();
        renderAll();
      })
    );
  }

  function renderDayReceipts(dateStr) {
    const host = $("#dayReceiptsList");
    if (!host) return;

    const receipts = receiptsByDate(dateStr).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const total = sumExpenses(dateStr);

    host.innerHTML = `
      <div class="day-totals">
        <div><strong>Receipts</strong></div>
        <div>Total Expenses: ${money(total)}</div>
      </div>
    `;

    if (!receipts.length) {
      host.innerHTML += `<div class="muted empty">No receipts for this day yet.</div>`;
      return;
    }

    for (const r of receipts) {
      const driverName = r.driverId ? (state.drivers.find(d => d.id === r.driverId)?.name || "Driver") : "";
      const photoThumb = r.photo ? `<img src="${escapeHtml(r.photo)}" alt="receipt" style="width:44px;height:44px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)"/>` : "";

      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">
            ${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Category")}
            ${driverName ? `<span class="muted" style="margin-left:8px;">(${escapeHtml(driverName)})</span>` : ""}
          </div>
          <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
        </div>
        <div class="receipt-actions">
          ${photoThumb}
          <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
          <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
        </div>
      `;
      host.appendChild(row);
    }

    $$("[data-rcpt-edit]", host).forEach((btn) =>
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")))
    );

    $$("[data-rcpt-del]", host).forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== id);
        persist();
        renderAll();
      })
    );
  }

  // ---------------------------
  // Drivers & Trucks rosters + "smart logs"
  // ---------------------------
  function groupReceiptsByMonth(driverId) {
    const map = new Map(); // "YYYY-MM" -> receipts[]
    for (const r of state.receipts) {
      if (!driverId || r.driverId !== driverId) continue;
      const key = (r.date || "").slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return Array.from(map.entries()).sort((a,b) => a[0] < b[0] ? 1 : -1);
  }

  function weekKeyFromDateISO(dateISO) {
    // simple week bucket: YYYY-W## (ISO-ish enough for ops)
    const d = new Date(dateISO);
    if (Number.isNaN(d.getTime())) return "unknown";
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
    return `${tmp.getUTCFullYear()}-W${pad2(weekNo)}`;
  }

  function groupReceiptsByWeek(driverId, monthPrefix) {
    const map = new Map();
    for (const r of state.receipts) {
      if (!driverId || r.driverId !== driverId) continue;
      if (monthPrefix && !String(r.date).startsWith(monthPrefix)) continue;
      const wk = weekKeyFromDateISO(r.date);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk).push(r);
    }
    return Array.from(map.entries()).sort((a,b) => a[0] < b[0] ? 1 : -1);
  }

  function renderRoster(viewName, arrKey, singularLabel) {
    const host = $(`#view-${viewName}`);
    if (!host) return;

    const rows = state[arrKey] || [];

    const isDrivers = (arrKey === "drivers");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">${escapeHtml(singularLabel)}s</div>
          <div class="panel-sub">Editable roster (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>${escapeHtml(singularLabel)} Name</span>
            <input id="${viewName}Name" type="text" placeholder="Name" />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="${viewName}Notes" type="text" placeholder="Phone, plate, availability, etc." />
          </label>
          <button class="btn primary" type="button" id="${viewName}Add">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.name || singularLabel)}</div>
                    <div class="job-sub">${escapeHtml(r.notes || "")}</div>
                  </div>
                  <div class="job-actions">
                    ${isDrivers ? `<button class="btn" type="button" data-driver-logs="${escapeHtml(r.id)}">Logs</button>` : ``}
                    <button class="btn" type="button" data-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No ${escapeHtml(singularLabel.toLowerCase())}s yet.</div>`
          }
        </div>

        ${isDrivers ? `<div id="driverLogsPanel" style="margin-top:14px;"></div>` : ``}
      </div>
    `;

    $(`#${viewName}Add`)?.addEventListener("click", () => {
      const name = ($(`#${viewName}Name`)?.value || "").trim();
      const notes = ($(`#${viewName}Notes`)?.value || "").trim();
      if (!name) return alert(`${singularLabel} name is required.`);
      state[arrKey].push(normalizeNamedRow({ name, notes, createdAt:Date.now(), updatedAt:Date.now() }, arrKey));
      persist();
      renderAll();
    });

    $$("[data-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      if (!confirm(`Delete this ${singularLabel.toLowerCase()}?`)) return;

      // If deleting a driver, keep receipts but orphan driverId.
      if (arrKey === "drivers") {
        state.receipts = state.receipts.map(r => r.driverId === id ? normalizeReceipt({ ...r, driverId:"", updatedAt:Date.now() }) : r);
      }
      state[arrKey] = state[arrKey].filter(x => x.id !== id);

      persist();
      renderAll();
    }));

    $$("[data-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const row = state[arrKey].find(x => x.id === id);
      if (!row) return;
      const name = prompt(`${singularLabel} name:`, row.name || "");
      if (name === null) return;
      const notes = prompt("Notes:", row.notes || "");
      if (notes === null) return;
      row.name = name.trim();
      row.notes = notes.trim();
      row.updatedAt = Date.now();
      persist();
      renderAll();
    }));

    if (isDrivers) {
      $$("[data-driver-logs]", host).forEach(btn => btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-driver-logs");
        renderDriverLogs(id);
      }));
    }

    function renderDriverLogs(driverId) {
      const panel = $("#driverLogsPanel");
      if (!panel) return;
      const driver = state.drivers.find(d => d.id === driverId);
      if (!driver) return;

      const months = groupReceiptsByMonth(driverId);
      let html = `
        <div class="panel" style="margin-top:14px;">
          <div class="panel-header">
            <div class="panel-title">${escapeHtml(driver.name)} — Receipt Logs</div>
            <div class="panel-sub">Grouped by month and week</div>
          </div>
      `;

      if (!months.length) {
        html += `<div class="muted">No receipts assigned to this driver yet.</div></div>`;
        panel.innerHTML = html;
        return;
      }

      for (const [month, recs] of months) {
        const monthTotal = clampMoney(recs.reduce((a,r)=>a+clampMoney(r.amount),0));
        const weeks = groupReceiptsByWeek(driverId, month);
        html += `
          <div class="day-totals" style="margin-top:10px;">
            <div><strong>${escapeHtml(month)}</strong> · Total: <strong>${money(monthTotal)}</strong> · Receipts: <strong>${recs.length}</strong></div>
          </div>
        `;

        for (const [wk, wrecs] of weeks) {
          const wkTotal = clampMoney(wrecs.reduce((a,r)=>a+clampMoney(r.amount),0));
          html += `
            <div class="muted" style="font-weight:800;margin:10px 0 6px;">${escapeHtml(wk)} · ${money(wkTotal)}</div>
          `;

          html += `<div style="display:flex;flex-direction:column;gap:8px;">`;
          for (const r of wrecs.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))) {
            const thumb = r.photo ? `<img src="${escapeHtml(r.photo)}" style="width:38px;height:38px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)"/>` : "";
            html += `
              <div class="receipt-row">
                <div class="receipt-main">
                  <div class="receipt-title">${escapeHtml(r.date)} · ${escapeHtml(r.vendor)} · ${escapeHtml(r.category)}</div>
                  <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
                </div>
                <div class="receipt-actions">
                  ${thumb}
                  <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
                </div>
              </div>
            `;
          }
          html += `</div>`;
        }
      }

      html += `</div>`;
      panel.innerHTML = html;

      $$("[data-rcpt-edit]", panel).forEach(b => b.addEventListener("click", () => {
        openReceiptModal(b.getAttribute("data-rcpt-edit"));
      }));
    }
  }

  // ---------------------------
  // Dispatch (smart)
  // ---------------------------
  function ensureDispatchBucket(dateStr) {
    if (!state.dispatch[dateStr]) state.dispatch[dateStr] = {};
    return state.dispatch[dateStr];
  }

  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const dateStr = ymd(state.currentDate);
    const jobs = jobsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const drivers = state.drivers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const trucks = state.trucks.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const bucket = ensureDispatchBucket(dateStr);

    const driverOptions = [`<option value="">— Driver —</option>`]
      .concat(drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`))
      .join("");

    const truckOptions = [`<option value="">— Truck —</option>`]
      .concat(trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`))
      .join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assignments for <strong>${escapeHtml(dateStr)}</strong></div>
        </div>

        <div class="muted" style="margin-bottom:10px;">
          Assign driver + truck to each job. Saved to localStorage by date.
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
          <button class="btn primary" type="button" id="dispatchSaveAll">Save All</button>
          <button class="btn danger" type="button" id="dispatchClear">Clear Date</button>
        </div>

        <div id="dispatchTableWrap"></div>

        ${!jobs.length ? `<div class="muted">No jobs on this date. Go add one.</div>` : ``}
      </div>
    `;

    const wrap = $("#dispatchTableWrap");
    if (!wrap || !jobs.length) return;

    const rows = jobs.map(job => {
      const assigned = bucket[job.id] || {};
      return `
        <div class="job-row" data-job-id="${escapeHtml(job.id)}">
          <div class="job-main">
            <div class="job-title">${escapeHtml(job.customer || "Job")}</div>
            <div class="job-sub">${escapeHtml(job.pickup || "")} → ${escapeHtml(job.dropoff || "")} · ${money(job.amount)}</div>
          </div>

          <div class="job-actions" style="align-items:flex-end;">
            <label class="field" style="min-width:180px;">
              <span>Driver</span>
              <select class="dispatchDriver">${driverOptions}</select>
            </label>

            <label class="field" style="min-width:180px;">
              <span>Truck</span>
              <select class="dispatchTruck">${truckOptions}</select>
            </label>

            <label class="field" style="min-width:200px;">
              <span>Notes</span>
              <input class="dispatchNotes" type="text" placeholder="Gate code, crew notes…" value="${escapeHtml(assigned.notes||"")}"/>
            </label>

            <button class="btn" type="button" data-dispatch-save>Save</button>
          </div>
        </div>
      `;
    }).join("");

    wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${rows}</div>`;

    // apply selected values
    $$("[data-job-id]", wrap).forEach(row => {
      const jobId = row.getAttribute("data-job-id");
      const assigned = bucket[jobId] || {};
      const dSel = $(".dispatchDriver", row);
      const tSel = $(".dispatchTruck", row);
      if (dSel) dSel.value = assigned.driverId || "";
      if (tSel) tSel.value = assigned.truckId || "";
    });

    // row save
    $$("[data-dispatch-save]", wrap).forEach(btn => btn.addEventListener("click", () => {
      const row = btn.closest("[data-job-id]");
      if (!row) return;
      const jobId = row.getAttribute("data-job-id");

      const driverId = $(".dispatchDriver", row)?.value || "";
      const truckId = $(".dispatchTruck", row)?.value || "";
      const notes = ($(".dispatchNotes", row)?.value || "").trim();

      bucket[jobId] = {
        driverId, truckId, notes,
        status: "assigned",
        updatedAt: Date.now(),
      };
      persist();

      btn.textContent = "Saved ✓";
      setTimeout(() => (btn.textContent = "Save"), 800);
    }));

    $("#dispatchSaveAll")?.addEventListener("click", () => {
      $$("[data-job-id]", wrap).forEach(row => {
        const jobId = row.getAttribute("data-job-id");
        const driverId = $(".dispatchDriver", row)?.value || "";
        const truckId = $(".dispatchTruck", row)?.value || "";
        const notes = ($(".dispatchNotes", row)?.value || "").trim();
        bucket[jobId] = { driverId, truckId, notes, status:"assigned", updatedAt: Date.now() };
      });
      persist();
      const b = $("#dispatchSaveAll");
      if (b) {
        b.textContent = "Saved ✓";
        setTimeout(() => (b.textContent = "Save All"), 900);
      }
    });

    $("#dispatchClear")?.addEventListener("click", () => {
      if (!confirm(`Clear dispatch assignments for ${dateStr}?`)) return;
      state.dispatch[dateStr] = {};
      persist();
      renderDispatch();
    });
  }

  // ---------------------------
  // Finance
  // ---------------------------
  function renderFinance() {
    const host = $("#view-finance");
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const t = monthTotals(y, m);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Finance</div>
          <div class="panel-sub">Month snapshot driven by Jobs + Receipts.</div>
        </div>

        <div class="day-totals">
          <div><strong>${MONTHS[m]} ${y}</strong></div>
          <div>Revenue: ${money(t.revenue)} · Expenses: ${money(t.expenses)} · Net: ${money(t.net)}</div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Next: commissions, payouts, exports.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Inventory
  // ---------------------------
  function renderInventory() {
    const host = $("#view-inventory");
    if (!host) return;

    const rows = state.inventory || [];
    const totalCuft = Math.round(rows.reduce((acc, r) => acc + (Number(r.cuft) || 0), 0) * 10) / 10;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">Track items and estimated cubic feet.</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Estimated Cubic Feet:</strong> ${totalCuft.toFixed(1)} cu ft</div>
          <div class="muted">Use this for quotes/estimates.</div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Item</span>
            <input id="invName" type="text" placeholder="Sofa, dresser, 20 boxes..." />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Category</span>
            <select id="invCat">
              <option value="Furniture">Furniture</option>
              <option value="Boxes">Boxes</option>
              <option value="Appliance">Appliance</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label class="field" style="min-width:160px;">
            <span>Est. cu ft</span>
            <input id="invCuft" type="number" step="0.1" value="0" />
          </label>

          <button class="btn primary" type="button" id="invAdd">Add Item</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.name || "Item")} <span class="muted">(${escapeHtml(r.category || "Other")})</span></div>
                    <div class="job-sub">${Number(r.cuft || 0).toFixed(1)} cu ft</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-inv-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-inv-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No inventory items yet.</div>`
          }
        </div>
      </div>
    `;

    $("#invAdd")?.addEventListener("click", () => {
      const name = ($("#invName")?.value || "").trim();
      const category = ($("#invCat")?.value || "Other").trim();
      const cuft = Number($("#invCuft")?.value ?? 0);

      if (!name) return alert("Item name is required.");
      if (!Number.isFinite(cuft) || cuft < 0) return alert("Cubic feet must be a valid number.");

      state.inventory.push(normalizeInventoryItem({
        name, category, cuft,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      persist();
      renderAll();
    });

    $$("[data-inv-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inv-del");
      if (!id) return;
      if (!confirm("Delete this inventory item?")) return;
      state.inventory = state.inventory.filter(x => x.id !== id);
      persist();
      renderAll();
    }));

    $$("[data-inv-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inv-edit");
      const row = state.inventory.find(x => x.id === id);
      if (!row) return;

      const name = prompt("Item:", row.name || "");
      if (name === null) return;
      const category = prompt("Category (Furniture/Boxes/Appliance/Other):", row.category || "Other");
      if (category === null) return;
      const cuft = prompt("Estimated cu ft:", String(row.cuft ?? 0));
      if (cuft === null) return;

      const cuftNum = Number(cuft);
      if (!Number.isFinite(cuftNum) || cuftNum < 0) return alert("Invalid cu ft number.");

      row.name = name.trim();
      row.category = category.trim() || "Other";
      row.cuft = Math.round(cuftNum * 10) / 10;
      row.updatedAt = Date.now();

      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // AI Scanner (starter)
  // ---------------------------
  function classifyText(text) {
    const t = (text || "").toLowerCase();
    const receiptHints = ["total", "subtotal", "tax", "visa", "mastercard", "receipt", "thank you", "balance", "change"];
    const furnitureHints = ["sofa", "couch", "dresser", "table", "bed", "mattress", "chair", "nightstand", "tv", "mirror"];

    const receiptScore = receiptHints.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
    const furnScore = furnitureHints.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);

    if (receiptScore >= 2 && receiptScore >= furnScore) return "receipt";
    if (furnScore >= 1 && furnScore > receiptScore) return "furniture";
    return "unknown";
  }

  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    const rows = state.scans.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Starter: paste text. Next: photo + OCR.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:520px; flex:1;">
            <span>Paste text to classify</span>
            <textarea id="scanText" rows="4" placeholder="Paste receipt text or furniture list..."></textarea>
          </label>
          <button class="btn primary" type="button" id="scanRun">Analyze</button>
        </div>

        <div class="muted" style="margin-top:10px;">
          Local classifier for now. You can plug real OCR later.
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="receipt-row">
                  <div class="receipt-main">
                    <div class="receipt-title">${escapeHtml(new Date(r.createdAt).toLocaleString())} · <strong>${escapeHtml(r.type)}</strong></div>
                    <div class="receipt-sub">${escapeHtml((r.text || "").slice(0, 140))}${(r.text||"").length > 140 ? "…" : ""}</div>
                  </div>
                  <div class="receipt-actions">
                    <button class="btn danger" type="button" data-scan-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No scans yet.</div>`
          }
        </div>
      </div>
    `;

    $("#scanRun")?.addEventListener("click", () => {
      const text = ($("#scanText")?.value || "").trim();
      if (!text) return alert("Paste some text first.");

      const type = classifyText(text);
      state.scans.unshift(normalizeScan({
        type,
        source: "manual",
        text,
        result: {},
        createdAt: Date.now(),
      }));

      persist();
      renderAll();
    });

    $$("[data-scan-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-scan-del");
      if (!id) return;
      if (!confirm("Delete this scan?")) return;
      state.scans = state.scans.filter(x => x.id !== id);
      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // Sheets (smart spreadsheet view)
  // ---------------------------
  function toCSV(rows, headers) {
    const esc = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
      return s;
    };
    const lines = [];
    lines.push(headers.map(esc).join(","));
    for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(","));
    return lines.join("\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function sheetTabsHTML() {
    const tabs = [
      ["jobs","Jobs"],
      ["receipts","Receipts"],
      ["drivers","Drivers"],
      ["trucks","Trucks"],
      ["dispatch","Dispatch"],
    ];
    return `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${tabs.map(([k,label]) => `
          <button class="btn ${state.sheetsTab===k ? "primary" : ""}" type="button" data-sheet-tab="${k}">
            ${escapeHtml(label)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderSheets() {
    const host = $("#view-sheets");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Sheets</div>
          <div class="panel-sub">Spreadsheet-style editing (localStorage)</div>
        </div>

        ${sheetTabsHTML()}

        <div id="sheetArea"></div>
      </div>
    `;

    $$("[data-sheet-tab]", host).forEach(btn => btn.addEventListener("click", () => {
      state.sheetsTab = btn.getAttribute("data-sheet-tab") || "jobs";
      persist();
      renderSheets();
    }));

    const area = $("#sheetArea", host);
    if (!area) return;

    if (state.sheetsTab === "jobs") renderSheetJobs(area);
    if (state.sheetsTab === "receipts") renderSheetReceipts(area);
    if (state.sheetsTab === "drivers") renderSheetDrivers(area);
    if (state.sheetsTab === "trucks") renderSheetTrucks(area);
    if (state.sheetsTab === "dispatch") renderSheetDispatch(area);
  }

  function cellInput({ value, type="text", step="", options=null, placeholder="" }) {
    if (options) {
      return `
        <select class="sheetCell">
          ${options.map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value)===String(value) ? "selected":""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      `;
    }
    const stepAttr = step ? ` step="${escapeHtml(step)}"` : "";
    return `<input class="sheetCell" type="${escapeHtml(type)}"${stepAttr} value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(placeholder)}" />`;
  }

  function sheetTableFrame(title, controlsHTML, tableHTML) {
    return `
      <div class="day-totals" style="margin-bottom:12px;">
        <div><strong>${escapeHtml(title)}</strong></div>
        <div class="muted">Tap a cell to edit. Changes save automatically.</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
        ${controlsHTML}
      </div>
      <div style="overflow:auto;">
        ${tableHTML}
      </div>
    `;
  }

  function bindSheetAutosave(root, onChange) {
    // change for select, blur for input (mobile-friendly)
    root.addEventListener("change", (e) => {
      const el = e.target;
      if (!el.classList.contains("sheetCell")) return;
      onChange(el);
    });
    root.addEventListener("blur", (e) => {
      const el = e.target;
      if (!el.classList.contains("sheetCell")) return;
      onChange(el);
    }, true);
  }

  function renderSheetJobs(area) {
    const headers = ["date","customer","pickup","dropoff","amount","status","notes","id"];
    const rows = state.jobs.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    const controls = `
      <button class="btn primary" type="button" id="sheetAddJob">Add Row</button>
      <button class="btn" type="button" id="sheetExportJobs">Export CSV</button>
    `;

    const table = `
      <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Date</th><th>Customer</th><th>Pickup</th><th>Dropoff</th><th>Amount</th><th>Status</th><th>Notes</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(j => `
            <tr data-row-id="${escapeHtml(j.id)}" style="background:rgba(255,255,255,.02);">
              <td>${cellInput({value:j.date, type:"date"})}</td>
              <td>${cellInput({value:j.customer})}</td>
              <td>${cellInput({value:j.pickup})}</td>
              <td>${cellInput({value:j.dropoff})}</td>
              <td>${cellInput({value:String(j.amount), type:"number", step:"0.01"})}</td>
              <td>${cellInput({value:j.status, options:[
                {value:"scheduled",label:"scheduled"},
                {value:"completed",label:"completed"},
                {value:"cancelled",label:"cancelled"},
              ]})}</td>
              <td>${cellInput({value:j.notes})}</td>
              <td>
                <button class="btn danger" type="button" data-del-job="${escapeHtml(j.id)}">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    area.innerHTML = sheetTableFrame("Jobs", controls, table);

    $("#sheetAddJob", area)?.addEventListener("click", () => {
      state.jobs.push(normalizeJob({
        date: ymd(state.currentDate),
        customer: "New Job",
        pickup: "",
        dropoff: "",
        amount: 0,
        status: "scheduled",
        notes: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      persist();
      renderSheets();
    });

    $("#sheetExportJobs", area)?.addEventListener("click", () => {
      const csv = toCSV(rows.map(j => ({
        date:j.date, customer:j.customer, pickup:j.pickup, dropoff:j.dropoff,
        amount:j.amount, status:j.status, notes:j.notes, id:j.id
      })), headers);
      downloadText(`jobs_${ymd(new Date())}.csv`, csv);
    });

    $$("[data-del-job]", area).forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-del-job");
      if (!id) return;
      if (!confirm("Delete this job row?")) return;
      state.jobs = state.jobs.filter(x => x.id !== id);
      // cleanup dispatch
      for (const date of Object.keys(state.dispatch)) {
        if (state.dispatch[date] && state.dispatch[date][id]) delete state.dispatch[date][id];
      }
      persist();
      renderSheets();
    }));

    bindSheetAutosave(area, (el) => {
      const tr = el.closest("tr[data-row-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-row-id");
      const job = state.jobs.find(x => x.id === id);
      if (!job) return;

      const tds = $$("td", tr);
      const getVal = (idx) => $(".sheetCell", tds[idx])?.value ?? "";

      job.date = String(getVal(0)).trim() || job.date;
      job.customer = String(getVal(1)).trim();
      job.pickup = String(getVal(2)).trim();
      job.dropoff = String(getVal(3)).trim();
      job.amount = clampMoney(getVal(4));
      job.status = STATUS[String(getVal(5)).trim()] ? String(getVal(5)).trim() : job.status;
      job.notes = String(getVal(6)).trim();
      job.updatedAt = Date.now();

      persist();
    });
  }

  function renderSheetReceipts(area) {
    const headers = ["date","vendor","category","amount","driverId","linkedJobId","notes","photoName","id"];

    const driverOpts = [{value:"",label:"(no driver)"}]
      .concat(state.drivers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(d => ({value:d.id,label:d.name})));

    const rows = state.receipts.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));

    const controls = `
      <button class="btn primary" type="button" id="sheetAddReceipt">Add Row</button>
      <button class="btn" type="button" id="sheetExportReceipts">Export CSV</button>
    `;

    const table = `
      <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th><th>Driver</th><th>Job ID</th><th>Notes</th><th>Photo</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-row-id="${escapeHtml(r.id)}" style="background:rgba(255,255,255,.02);">
              <td>${cellInput({value:r.date, type:"date"})}</td>
              <td>${cellInput({value:r.vendor})}</td>
              <td>${cellInput({value:r.category})}</td>
              <td>${cellInput({value:String(r.amount), type:"number", step:"0.01"})}</td>
              <td>${cellInput({value:r.driverId, options:driverOpts})}</td>
              <td>${cellInput({value:r.linkedJobId})}</td>
              <td>${cellInput({value:r.notes})}</td>
              <td>
                ${r.photo ? `<img src="${escapeHtml(r.photo)}" style="width:44px;height:44px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)"/>` : `<span class="muted">—</span>`}
              </td>
              <td>
                <button class="btn" type="button" data-edit-receipt="${escapeHtml(r.id)}">Edit</button>
                <button class="btn danger" type="button" data-del-receipt="${escapeHtml(r.id)}">Delete</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    area.innerHTML = sheetTableFrame("Receipts", controls, table);

    $("#sheetAddReceipt", area)?.addEventListener("click", () => {
      state.receipts.push(normalizeReceipt({
        date: ymd(state.currentDate),
        vendor: "Vendor",
        category: "",
        amount: 0,
        driverId: "",
        linkedJobId: "",
        notes: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      persist();
      renderSheets();
    });

    $("#sheetExportReceipts", area)?.addEventListener("click", () => {
      const csv = toCSV(rows.map(r => ({
        date:r.date, vendor:r.vendor, category:r.category, amount:r.amount,
        driverId:r.driverId, linkedJobId:r.linkedJobId, notes:r.notes,
        photoName:r.photoName, id:r.id
      })), headers);
      downloadText(`receipts_${ymd(new Date())}.csv`, csv);
    });

    $$("[data-edit-receipt]", area).forEach(b => b.addEventListener("click", () => {
      openReceiptModal(b.getAttribute("data-edit-receipt"));
    }));

    $$("[data-del-receipt]", area).forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-del-receipt");
      if (!id) return;
      if (!confirm("Delete this receipt row?")) return;
      state.receipts = state.receipts.filter(x => x.id !== id);
      persist();
      renderSheets();
    }));

    bindSheetAutosave(area, (el) => {
      const tr = el.closest("tr[data-row-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-row-id");
      const r = state.receipts.find(x => x.id === id);
      if (!r) return;

      const tds = $$("td", tr);
      const getVal = (idx) => $(".sheetCell", tds[idx])?.value ?? "";

      r.date = String(getVal(0)).trim() || r.date;
      r.vendor = String(getVal(1)).trim();
      r.category = String(getVal(2)).trim();
      r.amount = clampMoney(getVal(3));
      r.driverId = String(getVal(4)).trim();
      r.linkedJobId = String(getVal(5)).trim();
      r.notes = String(getVal(6)).trim();
      r.updatedAt = Date.now();

      persist();
    });
  }

  function renderSheetDrivers(area) {
    const headers = ["name","notes","id"];
    const rows = state.drivers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));

    const controls = `
      <button class="btn primary" type="button" id="sheetAddDriver">Add Row</button>
      <button class="btn" type="button" id="sheetExportDrivers">Export CSV</button>
    `;

    const table = `
      <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Name</th><th>Notes</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(d => `
            <tr data-row-id="${escapeHtml(d.id)}">
              <td>${cellInput({value:d.name})}</td>
              <td>${cellInput({value:d.notes})}</td>
              <td><button class="btn danger" type="button" data-del-driver="${escapeHtml(d.id)}">Delete</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    area.innerHTML = sheetTableFrame("Drivers", controls, table);

    $("#sheetAddDriver", area)?.addEventListener("click", () => {
      state.drivers.push(normalizeNamedRow({ name:"New Driver", notes:"", createdAt:Date.now(), updatedAt:Date.now() }, "drv"));
      persist();
      renderSheets();
    });

    $("#sheetExportDrivers", area)?.addEventListener("click", () => {
      const csv = toCSV(rows.map(d => ({ name:d.name, notes:d.notes, id:d.id })), headers);
      downloadText(`drivers_${ymd(new Date())}.csv`, csv);
    });

    $$("[data-del-driver]", area).forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-del-driver");
      if (!id) return;
      if (!confirm("Delete this driver? Receipts will keep data but lose assignment.")) return;
      state.receipts = state.receipts.map(r => r.driverId === id ? normalizeReceipt({ ...r, driverId:"", updatedAt:Date.now() }) : r);
      state.drivers = state.drivers.filter(x => x.id !== id);
      persist();
      renderSheets();
    }));

    bindSheetAutosave(area, (el) => {
      const tr = el.closest("tr[data-row-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-row-id");
      const d = state.drivers.find(x => x.id === id);
      if (!d) return;
      const tds = $$("td", tr);
      const getVal = (idx) => $(".sheetCell", tds[idx])?.value ?? "";
      d.name = String(getVal(0)).trim();
      d.notes = String(getVal(1)).trim();
      d.updatedAt = Date.now();
      persist();
    });
  }

  function renderSheetTrucks(area) {
    const headers = ["name","notes","id"];
    const rows = state.trucks.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));

    const controls = `
      <button class="btn primary" type="button" id="sheetAddTruck">Add Row</button>
      <button class="btn" type="button" id="sheetExportTrucks">Export CSV</button>
    `;

    const table = `
      <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Name</th><th>Notes</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => `
            <tr data-row-id="${escapeHtml(t.id)}">
              <td>${cellInput({value:t.name})}</td>
              <td>${cellInput({value:t.notes})}</td>
              <td><button class="btn danger" type="button" data-del-truck="${escapeHtml(t.id)}">Delete</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    area.innerHTML = sheetTableFrame("Trucks", controls, table);

    $("#sheetAddTruck", area)?.addEventListener("click", () => {
      state.trucks.push(normalizeNamedRow({ name:"New Truck", notes:"", createdAt:Date.now(), updatedAt:Date.now() }, "trk"));
      persist();
      renderSheets();
    });

    $("#sheetExportTrucks", area)?.addEventListener("click", () => {
      const csv = toCSV(rows.map(t => ({ name:t.name, notes:t.notes, id:t.id })), headers);
      downloadText(`trucks_${ymd(new Date())}.csv`, csv);
    });

    $$("[data-del-truck]", area).forEach(b => b.addEventListener("click", () => {
      const id = b.getAttribute("data-del-truck");
      if (!id) return;
      if (!confirm("Delete this truck?")) return;
      // Keep dispatch rows but orphan truckId
      for (const date of Object.keys(state.dispatch)) {
        const bucket = state.dispatch[date] || {};
        for (const jobId of Object.keys(bucket)) {
          if (bucket[jobId]?.truckId === id) bucket[jobId].truckId = "";
        }
      }
      state.trucks = state.trucks.filter(x => x.id !== id);
      persist();
      renderSheets();
    }));

    bindSheetAutosave(area, (el) => {
      const tr = el.closest("tr[data-row-id]");
      if (!tr) return;
      const id = tr.getAttribute("data-row-id");
      const t = state.trucks.find(x => x.id === id);
      if (!t) return;
      const tds = $$("td", tr);
      const getVal = (idx) => $(".sheetCell", tds[idx])?.value ?? "";
      t.name = String(getVal(0)).trim();
      t.notes = String(getVal(1)).trim();
      t.updatedAt = Date.now();
      persist();
    });
  }

  function renderSheetDispatch(area) {
    const dateStr = ymd(state.currentDate);
    const jobs = jobsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const bucket = ensureDispatchBucket(dateStr);

    const driverOpts = [{value:"",label:"— Driver —"}].concat(
      state.drivers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(d => ({value:d.id,label:d.name}))
    );
    const truckOpts = [{value:"",label:"— Truck —"}].concat(
      state.trucks.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(t => ({value:t.id,label:t.name}))
    );

    const controls = `
      <button class="btn primary" type="button" id="sheetSaveDispatchAll">Save All</button>
      <button class="btn" type="button" id="sheetExportDispatch">Export CSV</button>
      <button class="btn danger" type="button" id="sheetClearDispatch">Clear Date</button>
    `;

    const table = `
      <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Job</th><th>Amount</th><th>Driver</th><th>Truck</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${jobs.map(j => {
            const a = bucket[j.id] || {};
            return `
              <tr data-job-id="${escapeHtml(j.id)}">
                <td>
                  <div style="font-weight:900;">${escapeHtml(j.customer||"Job")}</div>
                  <div class="muted" style="font-size:12px;">${escapeHtml(j.pickup||"")}</div>
                </td>
                <td style="min-width:120px;">${money(j.amount)}</td>
                <td style="min-width:180px;">${cellInput({value:a.driverId||"", options:driverOpts})}</td>
                <td style="min-width:180px;">${cellInput({value:a.truckId||"", options:truckOpts})}</td>
                <td style="min-width:220px;">${cellInput({value:a.notes||"", placeholder:"Dispatch notes"})}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    area.innerHTML = sheetTableFrame(`Dispatch (for ${dateStr})`, controls, table);

    $("#sheetSaveDispatchAll", area)?.addEventListener("click", () => {
      $$("tr[data-job-id]", area).forEach(tr => {
        const jobId = tr.getAttribute("data-job-id");
        const cells = $$("td", tr);
        const driverId = $(".sheetCell", cells[2])?.value || "";
        const truckId = $(".sheetCell", cells[3])?.value || "";
        const notes = $(".sheetCell", cells[4])?.value || "";
        bucket[jobId] = { driverId, truckId, notes: String(notes).trim(), status:"assigned", updatedAt: Date.now() };
      });
      persist();
      const b = $("#sheetSaveDispatchAll", area);
      if (b) { b.textContent = "Saved ✓"; setTimeout(()=>b.textContent="Save All", 900); }
    });

    $("#sheetClearDispatch", area)?.addEventListener("click", () => {
      if (!confirm(`Clear dispatch for ${dateStr}?`)) return;
      state.dispatch[dateStr] = {};
      persist();
      renderSheets();
    });

    $("#sheetExportDispatch", area)?.addEventListener("click", () => {
      const rows = jobs.map(j => {
        const a = bucket[j.id] || {};
        const driver = a.driverId ? (state.drivers.find(d=>d.id===a.driverId)?.name || "") : "";
        const truck = a.truckId ? (state.trucks.find(t=>t.id===a.truckId)?.name || "") : "";
        return {
          date: dateStr,
          jobId: j.id,
          customer: j.customer,
          amount: j.amount,
          driverId: a.driverId || "",
          driver,
          truckId: a.truckId || "",
          truck,
          notes: a.notes || "",
        };
      });
      const headers = ["date","jobId","customer","amount","driverId","driver","truckId","truck","notes"];
      downloadText(`dispatch_${dateStr}.csv`, toCSV(rows, headers));
    });

    bindSheetAutosave(area, () => {
      // autosave per cell change/blur
      $$("tr[data-job-id]", area).forEach(tr => {
        const jobId = tr.getAttribute("data-job-id");
        const cells = $$("td", tr);
        const driverId = $(".sheetCell", cells[2])?.value || "";
        const truckId = $(".sheetCell", cells[3])?.value || "";
        const notes = $(".sheetCell", cells[4])?.value || "";
        bucket[jobId] = { driverId, truckId, notes: String(notes).trim(), status:"assigned", updatedAt: Date.now() };
      });
      persist();
    });
  }

  // ---------------------------
  // Modals: generic open/close
  // ---------------------------
  function openModal(modalId) {
    const overlay = $("#modalOverlay");
    const modal = $(modalId);
    if (!overlay || !modal) return;
    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modalId) {
    const overlay = $("#modalOverlay");
    const modal = $(modalId);
    if (!overlay || !modal) return;
    overlay.hidden = true;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  // ---------------------------
  // Job Modal
  // ---------------------------
  function openJobModal(jobId = null) {
    state.editingJobId = jobId;

    const title = $("#jobModalTitle");
    const delBtn = $("#jobDelete");
    const err = $("#jobError");
    if (err) { err.hidden = true; err.textContent = ""; }

    const job = jobId ? state.jobs.find(j => j.id === jobId) : null;

    if (title) title.textContent = job ? "Edit Job" : "Add Job";
    if (delBtn) delBtn.hidden = !job;

    $("#jobDate").value = job ? job.date : ymd(state.currentDate);
    $("#jobCustomer").value = job ? job.customer : "";
    $("#jobPickup").value = job ? job.pickup : "";
    $("#jobDropoff").value = job ? job.dropoff : "";
    $("#jobAmount").value = String(job ? job.amount : 0);
    $("#jobStatus").value = job ? job.status : STATUS.scheduled;
    $("#jobNotes").value = job ? job.notes : "";

    openModal("#jobModal");
  }

  function saveJobFromModal() {
    const err = $("#jobError");
    const fail = (msg) => {
      if (err) { err.textContent = msg; err.hidden = false; }
      else alert(msg);
    };

    const date = ($("#jobDate").value || "").trim();
    const customer = ($("#jobCustomer").value || "").trim();
    const pickup = ($("#jobPickup").value || "").trim();
    const dropoff = ($("#jobDropoff").value || "").trim();
    const amount = clampMoney($("#jobAmount").value ?? 0);
    const status = ($("#jobStatus").value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes").value || "").trim();

    if (!date) return fail("Date is required.");
    if (!customer) return fail("Customer is required.");
    if (!STATUS[status]) return fail("Invalid status.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingJobId) {
      const job = state.jobs.find(j => j.id === state.editingJobId);
      if (!job) return fail("Job not found.");
      job.date = date;
      job.customer = customer;
      job.pickup = pickup;
      job.dropoff = dropoff;
      job.amount = amount;
      job.status = status;
      job.notes = notes;
      job.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        id: makeId("job"),
        date, customer, pickup, dropoff,
        amount, status, notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeModal("#jobModal");
    renderAll();
  }

  function deleteJobFromModal() {
    const id = state.editingJobId;
    if (!id) return;
    if (!confirm("Delete this job?")) return;

    state.jobs = state.jobs.filter(j => j.id !== id);

    for (const date of Object.keys(state.dispatch)) {
      if (state.dispatch[date] && state.dispatch[date][id]) delete state.dispatch[date][id];
    }

    state.receipts = state.receipts.map(r => (
      r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r
    ));

    persist();
    closeModal("#jobModal");
    renderAll();
  }

  // ---------------------------
  // Receipt photo helper (resized base64)
  // ---------------------------
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function resizeImageDataUrl(dataUrl, maxW = 900, quality = 0.75) {
    // Reduce size so localStorage doesn't explode.
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          w = maxW;
          h = Math.round(w / ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/jpeg", quality);
        resolve(out);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ---------------------------
  // Receipt Modal
  // ---------------------------
  function fillReceiptDriverDropdown(selectedId = "") {
    const sel = $("#receiptDriverId");
    if (!sel) return;

    const drivers = state.drivers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    sel.innerHTML = `<option value="">(no driver)</option>` + drivers.map(d => `
      <option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>
    `).join("");

    sel.value = selectedId || "";
  }

  function setReceiptPhotoHint(text) {
    const hint = $("#receiptPhotoHint");
    if (hint) hint.textContent = text;
  }

  function openReceiptModal(receiptId = null) {
    state.editingReceiptId = receiptId;

    const title = $("#receiptModalTitle");
    const delBtn = $("#receiptDelete");
    const err = $("#receiptError");
    if (err) { err.hidden = true; err.textContent = ""; }

    const r = receiptId ? state.receipts.find(x => x.id === receiptId) : null;

    if (title) title.textContent = r ? "Edit Receipt" : "Add Receipt";
    if (delBtn) delBtn.hidden = !r;

    $("#receiptDate").value = r ? r.date : ymd(state.currentDate);
    $("#receiptVendor").value = r ? r.vendor : "";
    $("#receiptCategory").value = r ? r.category : "";
    $("#receiptAmount").value = String(r ? r.amount : 0);
    $("#receiptLinkedJobId").value = r ? r.linkedJobId : "";
    $("#receiptNotes").value = r ? r.notes : "";

    fillReceiptDriverDropdown(r ? r.driverId : "");

    // Reset file input (can't set value for security)
    const file = $("#receiptPhoto");
    if (file) file.value = "";

    setReceiptPhotoHint(r && r.photoName ? `Saved photo: ${r.photoName}` : (r && r.photo ? "Saved photo" : "No photo"));

    openModal("#receiptModal");
  }

  async function saveReceiptFromModal() {
    const err = $("#receiptError");
    const fail = (msg) => {
      if (err) { err.textContent = msg; err.hidden = false; }
      else alert(msg);
    };

    const date = ($("#receiptDate").value || "").trim();
    const vendor = ($("#receiptVendor").value || "").trim();
    const category = ($("#receiptCategory").value || "").trim();
    const amount = clampMoney($("#receiptAmount").value ?? 0);
    const linkedJobId = ($("#receiptLinkedJobId").value || "").trim();
    const notes = ($("#receiptNotes").value || "").trim();
    const driverId = ($("#receiptDriverId")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (err) { err.hidden = true; err.textContent = ""; }

    // photo handling
    let photo = "";
    let photoName = "";
    const fileInput = $("#receiptPhoto");
    const file = fileInput?.files?.[0] || null;

    if (file) {
      try {
        photoName = file.name || "receipt.jpg";
        const dataUrl = await readFileAsDataURL(file);
        // resized thumbnail for storage safety
        photo = await resizeImageDataUrl(dataUrl, 900, 0.75);
      } catch (e) {
        console.warn("Photo read failed", e);
      }
    }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Receipt not found.");
      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.linkedJobId = linkedJobId;
      r.notes = notes;
      r.driverId = driverId;
      if (photo) { r.photo = photo; r.photoName = photoName; }
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, linkedJobId, notes,
        driverId,
        photo: photo || "",
        photoName: photoName || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeModal("#receiptModal");
    renderAll();
  }

  function deleteReceiptFromModal() {
    const id = state.editingReceiptId;
    if (!id) return;
    if (!confirm("Delete this receipt?")) return;

    state.receipts = state.receipts.filter(r => r.id !== id);
    persist();

    closeModal("#receiptModal");
    renderAll();
  }

  // ---------------------------
  // Render all
  // ---------------------------
  function renderAll() {
    const ctx = $("#contextLine");
    if (ctx) {
      const dateStr = ymd(state.currentDate);
      ctx.textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view === "dispatch" ? `Dispatch: ${dateStr}` :
        state.view === "sheets" ? `Sheets: ${state.sheetsTab}` :
        state.view[0].toUpperCase() + state.view.slice(1);
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderRoster("drivers", "drivers", "Driver");
    if (state.view === "trucks") renderRoster("trucks", "trucks", "Truck");
    if (state.view === "dispatch") renderDispatch();
    if (state.view === "finance") renderFinance();
    if (state.view === "inventory") renderInventory();
    if (state.view === "scanner") renderScanner();
    if (state.view === "sheets") renderSheets();
  }

  // ---------------------------
  // Navigation bindings (bind once)
  // ---------------------------
  function bindNavOnce() {
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.dataset.view;
        if (v) setView(v);
      });
    });

    $("#btnToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.currentDate = now;
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      persist();
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        const d = state.currentDate;
        state.currentDate = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      persist();
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        const d = state.currentDate;
        state.currentDate = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      persist();
      renderAll();
    });

    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      persist();
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      persist();
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = now;
      persist();
      renderAll();
    });

    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    $("#modalOverlay")?.addEventListener("click", () => {
      closeModal("#jobModal");
      closeModal("#receiptModal");
    });

    $("#jobModalClose")?.addEventListener("click", () => closeModal("#jobModal"));
    $("#jobCancel")?.addEventListener("click", () => closeModal("#jobModal"));
    $("#jobSave")?.addEventListener("click", () => saveJobFromModal());
    $("#jobDelete")?.addEventListener("click", () => deleteJobFromModal());

    $("#receiptModalClose")?.addEventListener("click", () => closeModal("#receiptModal"));
    $("#receiptCancel")?.addEventListener("click", () => closeModal("#receiptModal"));
    $("#receiptSave")?.addEventListener("click", () => safe(() => saveReceiptFromModal()));
    $("#receiptDelete")?.addEventListener("click", () => deleteReceiptFromModal());

    // live photo hint
    $("#receiptPhoto")?.addEventListener("change", (e) => {
      const file = e.target?.files?.[0];
      if (!file) return setReceiptPhotoHint("No photo");
      setReceiptPhotoHint(`Selected: ${file.name || "photo"}`);
    });
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    // normalize stored data
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.drivers = (state.drivers || []).map(x => normalizeNamedRow(x, "drv"));
    state.trucks = (state.trucks || []).map(x => normalizeNamedRow(x, "trk"));
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    state.scans = (state.scans || []).map(normalizeScan);
    state.dispatch = normalizeDispatch(state.dispatch || {});
    persist();

    bindNavOnce();

    // Set initial view
    if ($(`#view-${state.view}`)) setView(state.view);
    else setView("dashboard");

    setPill("JS: ready ✅", true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
