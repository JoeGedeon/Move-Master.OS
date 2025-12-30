/* =========================================================
   Move-Master.OS — app_v5_01.js (FULL UPDATED, HUMAN-SAFE)
   - Single app module (NO duplicate dispatch blocks)
   - Dispatch is a real spreadsheet table (per selected date)
   - Drivers has: roster + select driver + receipts history + add receipt tied to driver
   - Uploads table (metadata only; file bytes not stored in localStorage)
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
      alert("JS error. Check console for details.");
    }
  }

  // ---------------------------
  // Storage
  // ---------------------------
  const LS = {
    jobs: "mm_jobs_v5_1",
    receipts: "mm_receipts_v5_1",
    drivers: "mm_drivers_v5_1",
    trucks: "mm_trucks_v5_1",
    dispatch: "mm_dispatch_v5_1",
    finance: "mm_finance_v5_1",
    inventory: "mm_inventory_v5_1",
    scans: "mm_scans_v5_1",
    uploads: "mm_uploads_v5_1",
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
    o.driverId = (o.driverId || "").trim(); // IMPORTANT: driver-linked receipts
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
    o.type = (o.type || "unknown").trim(); // receipt | furniture | unknown
    o.source = (o.source || "manual").trim(); // manual now, later: upload/camera
    o.text = (o.text || "").trim();
    o.result = o.result || {};
    o.createdAt = o.createdAt || Date.now();
    return o;
  }

  // Uploads are metadata rows (spreadsheet-friendly).
  // file bytes are NOT stored in localStorage.
  function normalizeUpload(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("upl");
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    o.kind = (o.kind || "other").trim();     // receipt|damage|mileage|pod|inventory_photo|inventory_video|other
    o.driverId = (o.driverId || "").trim();
    o.jobId = (o.jobId || "").trim();
    o.inventoryRef = (o.inventoryRef || "").trim();
    o.fileName = (o.fileName || "").trim(); // for now: original file name
    o.mime = (o.mime || "").trim();
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    return o;
  }

  // Dispatch bucket: {date, assignments:{[jobId]:{driverId,truckId,updatedAt}}}
  function normalizeDispatchBucket(x) {
    const o = { ...(x || {}) };
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    o.assignments = o.assignments && typeof o.assignments === "object" ? o.assignments : {};
    o.updatedAt = o.updatedAt || Date.now();
    return o;
  }

  // ---------------------------
  // State
  // ---------------------------
  const now = startOfDay(new Date());

  const state = {
    view: "dashboard",
    currentDate: now,
    monthCursor: new Date(now.getFullYear(), now.getMonth(), 1),

    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),

    drivers: loadArray(LS.drivers).map(x => normalizeNamedRow(x, "drv")),
    trucks: loadArray(LS.trucks).map(x => normalizeNamedRow(x, "trk")),

    dispatch: loadArray(LS.dispatch).map(normalizeDispatchBucket),

    finance: loadArray(LS.finance),
    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans).map(normalizeScan),
    uploads: loadArray(LS.uploads).map(normalizeUpload),

    editingJobId: null,
    editingReceiptId: null,

    // Drivers UI state
    selectedDriverId: "",
  };

  function persist() {
    saveArray(LS.jobs, state.jobs);
    saveArray(LS.receipts, state.receipts);
    saveArray(LS.drivers, state.drivers);
    saveArray(LS.trucks, state.trucks);
    saveArray(LS.dispatch, state.dispatch);
    saveArray(LS.finance, state.finance);
    saveArray(LS.inventory, state.inventory);
    saveArray(LS.scans, state.scans);
    saveArray(LS.uploads, state.uploads);
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) { return state.jobs.filter(j => j.date === dateStr); }
  function receiptsByDate(dateStr) { return state.receipts.filter(r => r.date === dateStr); }
  function uploadsByDate(dateStr) { return state.uploads.filter(u => u.date === dateStr); }

  function receiptsByDriver(driverId) {
    const id = String(driverId || "");
    if (!id) return [];
    return state.receipts.filter(r => String(r.driverId || "") === id);
  }

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

  // Driver breakdown helpers
  function groupReceiptsByMonth(receipts) {
    const map = new Map(); // "YYYY-MM" -> {total, count}
    for (const r of receipts) {
      const key = String(r.date || "").slice(0, 7);
      if (!map.has(key)) map.set(key, { total: 0, count: 0 });
      const obj = map.get(key);
      obj.total += clampMoney(r.amount);
      obj.count += 1;
    }
    return Array.from(map.entries())
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([k,v]) => ({ month: k, total: clampMoney(v.total), count: v.count }));
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
  }

  // ---------------------------
  // Dashboard
  // ---------------------------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);
    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `${todayStr}`;

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

      if (dateStr === ymd(state.currentDate)) btn.classList.add("active");
      if (jobsByDate(dateStr).length) btn.classList.add("has-jobs");
      if (receiptsByDate(dateStr).length) btn.classList.add("has-receipts");
      if (uploadsByDate(dateStr).length) btn.classList.add("has-uploads");

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

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (dateStr === ymd(state.currentDate)) cell.classList.add("selected");

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
      }
      if (completed) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `C:${completed}`;
        marker.appendChild(chip);
      }
      if (cancelled) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `X:${cancelled}`;
        marker.appendChild(chip);
      }
      if (receipts.length) {
        const chip = document.createElement("span");
        chip.className = "chip chip-receipts";
        chip.textContent = `🧾 ${receipts.length}`;
        marker.appendChild(chip);
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
        state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));
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
      const driverTag = driverName ? ` · <span class="muted">${escapeHtml(driverName)}</span>` : "";

      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Category")}${driverTag}</div>
          <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
        </div>
        <div class="receipt-actions">
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
  // DRIVERS (Spreadsheet-style roster + driver logs)
  // ---------------------------
  function renderDrivers() {
    const host = $("#view-drivers");
    if (!host) return;

    const drivers = state.drivers.slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));

    // Ensure selected driver still exists
    if (state.selectedDriverId && !state.drivers.find(d => d.id === state.selectedDriverId)) {
      state.selectedDriverId = "";
    }
    if (!state.selectedDriverId && drivers.length) state.selectedDriverId = drivers[0].id;

    const selected = state.selectedDriverId ? state.drivers.find(d => d.id === state.selectedDriverId) : null;
    const selectedName = selected?.name || "—";

    const driverReceipts = selected ? receiptsByDriver(selected.id) : [];
    driverReceipts.sort((a,b) => (b.date||"").localeCompare(a.date||""));

    const monthGroups = groupReceiptsByMonth(driverReceipts).reverse(); // newest first
    const monthSummaryHtml = monthGroups.length
      ? monthGroups.map(m => `<div>${escapeHtml(m.month)} · <strong>${money(m.total)}</strong> · <span class="muted">${m.count} receipts</span></div>`).join("")
      : `<div class="muted">No history yet.</div>`;

    const recentReceiptsHtml = driverReceipts.length
      ? driverReceipts.slice(0, 25).map(r => `
          <div class="receipt-row">
            <div class="receipt-main">
              <div class="receipt-title">${escapeHtml(r.date)} · ${escapeHtml(r.vendor)} · ${escapeHtml(r.category)}</div>
              <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
            </div>
            <div class="receipt-actions">
              <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
              <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
            </div>
          </div>
        `).join("")
      : `<div class="muted empty">No receipts logged for this driver yet.</div>`;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Roster + driver ledger (week/month). Receipts tie to driver_id.</div>
        </div>

        <div class="cards">
          <div class="card" style="min-width:280px;">
            <div class="card-title">Driver Roster</div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-top:10px;">
              <label class="field" style="min-width:260px;">
                <span>Driver Name</span>
                <input id="driversName" type="text" placeholder="Name" />
              </label>
              <label class="field" style="min-width:260px;">
                <span>Notes</span>
                <input id="driversNotes" type="text" placeholder="Phone, availability, etc." />
              </label>
              <button class="btn primary" type="button" id="driversAdd">Add</button>
            </div>

            <div id="driversList" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
              ${
                drivers.length
                  ? drivers.map(d => `
                      <button type="button" class="job-row ${d.id === state.selectedDriverId ? "selected" : ""}" data-driver-pick="${escapeHtml(d.id)}" style="text-align:left;">
                        <div class="job-main">
                          <div class="job-title">${escapeHtml(d.name || "Driver")}</div>
                          <div class="job-sub">${escapeHtml(d.notes || "")}</div>
                        </div>
                      </button>
                    `).join("")
                  : `<div class="muted empty">No drivers yet.</div>`
              }
            </div>
          </div>

          <div class="card" style="flex:1;">
            <div class="card-title">Driver Log</div>
            <div class="muted" id="selectedDriverLine" style="margin-top:6px;">
              Selected: <strong>${escapeHtml(selectedName)}</strong>
            </div>

            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
              <button id="btnDriverAddReceipt" class="btn primary" type="button">Add Receipt</button>
              <button id="btnDriverAddUpload" class="btn" type="button">Add Receipt Photo (metadata)</button>
              <button id="btnDriverDelete" class="btn danger" type="button" ${selected ? "" : "disabled"}>Delete Driver</button>
            </div>

            <div style="margin-top:12px;">
              <div class="muted">Month-by-month</div>
              <div id="driverSummary" class="card-body">${monthSummaryHtml}</div>
            </div>

            <div style="margin-top:12px;">
              <div class="muted">Recent Receipts</div>
              <div id="driverLogsList" class="card-body">${recentReceiptsHtml}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add driver
    $("#driversAdd", host)?.addEventListener("click", () => {
      const name = ($("#driversName", host)?.value || "").trim();
      const notes = ($("#driversNotes", host)?.value || "").trim();
      if (!name) return alert("Driver name is required.");
      const row = normalizeNamedRow({ name, notes, createdAt: Date.now(), updatedAt: Date.now() }, "drv");
      state.drivers.push(row);
      state.selectedDriverId = row.id;
      persist();
      renderAll();
    });

    // Pick driver
    $$("[data-driver-pick]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedDriverId = btn.getAttribute("data-driver-pick") || "";
        renderAll();
      });
    });

    // Delete driver (keeps receipts, just detaches them)
    $("#btnDriverDelete", host)?.addEventListener("click", () => {
      if (!selected) return;
      if (!confirm(`Delete driver "${selected.name}"? Receipts will remain but become unassigned.`)) return;

      const id = selected.id;
      state.drivers = state.drivers.filter(d => d.id !== id);
      state.receipts = state.receipts.map(r => r.driverId === id ? normalizeReceipt({ ...r, driverId: "", updatedAt: Date.now() }) : r);
      state.uploads = state.uploads.map(u => u.driverId === id ? normalizeUpload({ ...u, driverId: "", createdAt: u.createdAt || Date.now() }) : u);

      state.selectedDriverId = state.drivers[0]?.id || "";
      persist();
      renderAll();
    });

    // Add receipt tied to driver
    $("#btnDriverAddReceipt", host)?.addEventListener("click", () => {
      if (!selected) return alert("Create/select a driver first.");
      openReceiptModal(null, { driverId: selected.id });
    });

    // Add upload metadata (receipt photo metadata placeholder)
    $("#btnDriverAddUpload", host)?.addEventListener("click", async () => {
      if (!selected) return alert("Create/select a driver first.");

      // Use a file picker. On iPad Safari this opens camera/photo library.
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.click();

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;

        state.uploads.unshift(normalizeUpload({
          date: ymd(state.currentDate),
          kind: "receipt",
          driverId: selected.id,
          jobId: "",
          fileName: file.name || "receipt.jpg",
          mime: file.type || "",
          notes: "Driver receipt photo (metadata only in v1)",
          createdAt: Date.now(),
        }));

        persist();
        alert("Saved upload metadata. (Actual file storage comes with Supabase/IndexedDB.)");
        renderAll();
      };
    });

    // Receipt row edit/delete inside driver log
    $$("[data-rcpt-edit]", host).forEach(btn =>
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")))
    );
    $$("[data-rcpt-del]", host).forEach(btn =>
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
  // TRUCKS roster (kept simple)
  // ---------------------------
  function renderTrucks() {
    const host = $("#view-trucks");
    if (!host) return;

    const rows = state.trucks.slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Editable roster (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Truck Name</span>
            <input id="trucksName" type="text" placeholder="Truck 1, Sprinter, etc." />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="trucksNotes" type="text" placeholder="Plate, capacity, issues, etc." />
          </label>
          <button class="btn primary" type="button" id="trucksAdd">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.name || "Truck")}</div>
                    <div class="job-sub">${escapeHtml(r.notes || "")}</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-trk-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-trk-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No trucks yet.</div>`
          }
        </div>
      </div>
    `;

    $("#trucksAdd", host)?.addEventListener("click", () => {
      const name = ($("#trucksName", host)?.value || "").trim();
      const notes = ($("#trucksNotes", host)?.value || "").trim();
      if (!name) return alert("Truck name is required.");
      state.trucks.push(normalizeNamedRow({ name, notes, createdAt: Date.now(), updatedAt: Date.now() }, "trk"));
      persist();
      renderAll();
    });

    $$("[data-trk-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-trk-del");
      if (!id) return;
      if (!confirm("Delete this truck?")) return;
      state.trucks = state.trucks.filter(x => x.id !== id);
      persist();
      renderAll();
    }));

    $$("[data-trk-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-trk-edit");
      const row = state.trucks.find(x => x.id === id);
      if (!row) return;
      const name = prompt("Truck name:", row.name || "");
      if (name === null) return;
      const notes = prompt("Notes:", row.notes || "");
      if (notes === null) return;
      row.name = name.trim();
      row.notes = notes.trim();
      row.updatedAt = Date.now();
      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // DISPATCH (Spreadsheet table per selected date)
  // ---------------------------
  function getDispatchBucket(dateISO) {
    let b = state.dispatch.find(x => x.date === dateISO);
    if (!b) {
      b = normalizeDispatchBucket({ date: dateISO, assignments: {}, updatedAt: Date.now() });
      state.dispatch.push(b);
    }
    if (!b.assignments || typeof b.assignments !== "object") b.assignments = {};
    return b;
  }

  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const dateISO = ymd(state.currentDate);
    const jobs = jobsByDate(dateISO).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));

    const drivers = state.drivers || [];
    const trucks = state.trucks || [];

    const bucket = getDispatchBucket(dateISO);
    const assignments = bucket.assignments;

    const driverOptions =
      `<option value="">— Driver —</option>` +
      drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`).join("");

    const truckOptions =
      `<option value="">— Truck —</option>` +
      trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || "Truck")}</option>`).join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assign drivers + trucks to each job for <strong>${escapeHtml(dateISO)}</strong>.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
          <button id="dispatchSaveAll" class="btn primary" type="button">Save Assignments</button>
          <button id="dispatchClear" class="btn danger" type="button">Clear Today</button>
          <div class="muted">Spreadsheet mode: one row per job.</div>
        </div>

        <div id="dispatchEmpty" class="muted empty" style="display:${jobs.length ? "none" : "block"};">
          No jobs for this date. Add a job first, then dispatch it.
        </div>

        <div id="dispatchTableWrap" style="overflow:auto;"></div>
      </div>
    `;

    const wrap = $("#dispatchTableWrap", host);
    if (!wrap || !jobs.length) return;

    const rows = jobs.map(job => {
      const jobId = String(job.id);
      const a = assignments[jobId] || {};
      return `
        <tr data-job-id="${escapeHtml(jobId)}">
          <td style="min-width:220px;">
            <div style="font-weight:600;">${escapeHtml(job.customer || "Customer")}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(job.pickup || "")}${job.dropoff ? " → " + escapeHtml(job.dropoff) : ""}</div>
          </td>
          <td style="min-width:110px;">${money(job.amount || 0)}</td>
          <td style="min-width:210px;">
            <select class="dispatchDriver">${driverOptions}</select>
          </td>
          <td style="min-width:210px;">
            <select class="dispatchTruck">${truckOptions}</select>
          </td>
          <td style="min-width:120px;">
            <button class="btn dispatchRowSave" type="button">Save</button>
          </td>
        </tr>
      `;
    }).join("");

    wrap.innerHTML = `
      <table class="table" style="width:100%; border-collapse:separate; border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Job</th>
            <th>Amount</th>
            <th>Driver</th>
            <th>Truck</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Set selected values
    wrap.querySelectorAll("tr[data-job-id]").forEach(tr => {
      const jobId = tr.getAttribute("data-job-id");
      const a = assignments[jobId] || {};
      tr.querySelector(".dispatchDriver").value = a.driverId || "";
      tr.querySelector(".dispatchTruck").value  = a.truckId  || "";
    });

    // Row save
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".dispatchRowSave");
      if (!btn) return;
      const tr = btn.closest("tr[data-job-id]");
      if (!tr) return;

      const jobId = tr.getAttribute("data-job-id");
      const driverId = tr.querySelector(".dispatchDriver")?.value || "";
      const truckId  = tr.querySelector(".dispatchTruck")?.value || "";

      assignments[jobId] = { driverId, truckId, updatedAt: Date.now() };
      bucket.updatedAt = Date.now();
      persist();

      btn.textContent = "Saved ✓";
      setTimeout(() => (btn.textContent = "Save"), 900);
    });

    // Save all
    $("#dispatchSaveAll", host)?.addEventListener("click", () => {
      wrap.querySelectorAll("tr[data-job-id]").forEach(tr => {
        const jobId = tr.getAttribute("data-job-id");
        assignments[jobId] = {
          driverId: tr.querySelector(".dispatchDriver")?.value || "",
          truckId:  tr.querySelector(".dispatchTruck")?.value  || "",
          updatedAt: Date.now(),
        };
      });
      bucket.updatedAt = Date.now();
      persist();

      const b = $("#dispatchSaveAll", host);
      b.textContent = "Saved ✓";
      setTimeout(() => (b.textContent = "Save Assignments"), 900);
    });

    // Clear
    $("#dispatchClear", host)?.addEventListener("click", () => {
      if (!confirm("Clear dispatch assignments for this date?")) return;
      bucket.assignments = {};
      bucket.updatedAt = Date.now();
      persist();
      renderAll();
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
          Next: export receipts CSV, driver totals, payout rules.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Inventory (kept as your working CRUD)
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
          <div class="panel-sub">Track items and estimated cubic feet (spreadsheet-friendly).</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Estimated Cubic Feet:</strong> ${totalCuft.toFixed(1)} cu ft</div>
          <div class="muted">This becomes the backbone for quotes/estimates.</div>
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

        <div class="muted" style="margin-top:12px;">Next: inventory photo uploads (stored as Upload rows).</div>

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
  // AI Scanner
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
  // Modals (Job)
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
    state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));
    persist();

    closeModal("#jobModal");
    renderAll();
  }

  // ---------------------------
  // Modals (Receipt)
  // openReceiptModal can accept an optional preset (driverId)
  // ---------------------------
  function openReceiptModal(receiptId = null, preset = null) {
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

    // driver preset (if creating from Drivers page)
    const driverId = r ? r.driverId : (preset?.driverId || "");
    // If your HTML has a hidden #receiptDriverId, use it; otherwise we store on save via closure state
    const hid = $("#receiptDriverId");
    if (hid) hid.value = driverId;

    // store preset on state temporarily for save
    state._receiptModalDriverPreset = driverId;

    openModal("#receiptModal");
  }

  function saveReceiptFromModal() {
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

    // driver binding: prefer hidden field if exists
    const driverIdFromHidden = ($("#receiptDriverId")?.value || "").trim();
    const driverId = driverIdFromHidden || (state._receiptModalDriverPreset || "");

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Receipt not found.");
      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.linkedJobId = linkedJobId;
      r.driverId = driverId;
      r.notes = notes;
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, linkedJobId,
        driverId,
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    state._receiptModalDriverPreset = "";
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
  // Render All
  // ---------------------------
  function renderAll() {
    const ctx = $("#contextLine");
    if (ctx) {
      const dateStr = ymd(state.currentDate);
      ctx.textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view[0].toUpperCase() + state.view.slice(1);
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderDrivers();
    if (state.view === "trucks") renderTrucks();
    if (state.view === "dispatch") renderDispatch();
    if (state.view === "finance") renderFinance();
    if (state.view === "inventory") renderInventory();
    if (state.view === "scanner") renderScanner();
  }

  // ---------------------------
  // Navigation bindings (bind once)
  // ---------------------------
  function bindNavOnce() {
    // Sidebar routing
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.dataset.view;
        if (v) setView(v);
      });
    });

    // Topbar date nav
    $("#btnToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.currentDate = now;
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
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
      renderAll();
    });

    // Calendar view controls
    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = now;
      renderAll();
    });

    // Add buttons
    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    // Modal close hooks
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
    $("#receiptSave")?.addEventListener("click", () => saveReceiptFromModal());
    $("#receiptDelete")?.addEventListener("click", () => deleteReceiptFromModal());
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    // normalize stored data (in case older saves exist)
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.drivers = (state.drivers || []).map(x => normalizeNamedRow(x, "drv"));
    state.trucks = (state.trucks || []).map(x => normalizeNamedRow(x, "trk"));
    state.dispatch = (state.dispatch || []).map(normalizeDispatchBucket);
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    state.scans = (state.scans || []).map(normalizeScan);
    state.uploads = (state.uploads || []).map(normalizeUpload);

    persist();
    bindNavOnce();

    // default view
    if ($("#view-dashboard")) setView("dashboard");
    else if ($("#view-day")) setView("day");
    else if ($("#view-calendar")) setView("calendar");
    else renderAll();

    setPill("JS: ready ✅", true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
