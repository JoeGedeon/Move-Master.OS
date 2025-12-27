/* =========================================================
   Move-Master.OS — apps_v5_1.js (FULL STABLE BASE)
   Matches your HTML architecture exactly:
   - Sidebar buttons: .nav-item[data-view]
   - Views: #view-dashboard, #view-calendar, #view-day,
            #view-drivers, #view-trucks, #view-dispatch,
            #view-finance, #view-inventory, #view-scanner
   - Topbar: #btnPrev #btnToday #btnNext #btnAddJob #btnAddReceipt
   - Calendar: #monthLabel #calendarGrid #dashboardCalendar
   - Day workspace: #dayTitle #dayJobsList #dayReceiptsList
   - Modals: #modalOverlay, #jobModal..., #receiptModal...
   - JS badge: #jsPill
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

  function safe(fn) {
    try { fn(); } catch (e) {
      console.error("[Move-Master.OS]", e);
      setPill("JS: error ❌", false);
      // Optional: show quick hint in console
      console.log("If you're stuck at JS loading, check for 404 on the JS file or a syntax error.");
    }
  }

  // ---------------------------
  // JS pill
  // ---------------------------
  function setPill(text, ok) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove("ok", "bad");
    pill.classList.add(ok ? "ok" : "bad");
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
    o.category = (o.category || "Furniture").trim();
    o.cuft = Number.isFinite(Number(o.cuft)) ? Math.max(0, Number(o.cuft)) : 0;
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),

    drivers: loadArray(LS.drivers).map(x => normalizeNamedRow(x, "drv")),
    trucks: loadArray(LS.trucks).map(x => normalizeNamedRow(x, "trk")),

    dispatch: loadArray(LS.dispatch),
    finance: loadArray(LS.finance),
    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans),

    editingJobId: null,
    editingReceiptId: null,
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

    // Clean labels (your HTML still contains "(coming soon)")
    $$("[data-view]").forEach((btn) => {
      const v = btn.dataset.view;
      if (!v) return;
      if (["drivers","trucks","dispatch","finance","inventory","scanner"].includes(v)) {
        btn.textContent = v[0].toUpperCase() + v.slice(1);
      }
    });

    renderAll();
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
  // Full Calendar
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

      if (scheduled) { cell.classList.add("has-scheduled"); marker.appendChild(chip(`S:${scheduled}`, "chip-jobs")); }
      if (completed) { cell.classList.add("has-completed"); marker.appendChild(chip(`C:${completed}`, "chip-jobs")); }
      if (cancelled) { cell.classList.add("has-cancelled"); marker.appendChild(chip(`X:${cancelled}`, "chip-jobs")); }
      if (receipts.length) { cell.classList.add("has-receipts"); marker.appendChild(chip(`🧾 ${receipts.length}`, "chip-receipts")); }

      cell.appendChild(num);
      cell.appendChild(marker);

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  function chip(text, cls) {
    const s = document.createElement("span");
    s.className = `chip ${cls}`;
    s.textContent = text;
    return s;
  }

  // ---------------------------
  // Day Workspace
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
      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Category")}</div>
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
  // Drivers / Trucks (editable roster)
  // ---------------------------
  function renderRoster(viewName, arrKey, singularLabel) {
    const host = $(`#view-${viewName}`);
    if (!host) return;

    const rows = state[arrKey] || [];

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
                    <button class="btn" type="button" data-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No ${escapeHtml(singularLabel.toLowerCase())}s yet.</div>`
          }
        </div>
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
  }

  // ---------------------------
  // Dispatch / Finance
  // ---------------------------
  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Starter view. Next: assign drivers/trucks to jobs.</div>
        </div>
        <div class="muted">
          This page is active. Next we build the real dispatch table (jobs by date + assignments).
        </div>
      </div>
    `;
  }

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
          <div class="panel-sub">Driven by Jobs + Receipts.</div>
        </div>

        <div class="day-totals">
          <div><strong>${MONTHS[m]} ${y}</strong></div>
          <div>Revenue: ${money(t.revenue)} · Expenses: ${money(t.expenses)} · Net: ${money(t.net)}</div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Next: commissions, driver accountability, export.
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
    const totalCuft = rows.reduce((sum, r) => sum + (Number(r.cuft) || 0), 0);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">Track items and estimated cubic feet.</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Items:</strong> ${rows.length}</div>
          <div><strong>Est. Total Cu Ft:</strong> ${Math.round(totalCuft * 10) / 10}</div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Item</span>
            <input id="invName" type="text" placeholder="Sofa, dresser, 20 boxes..." />
          </label>
          <label class="field" style="min-width:160px;">
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
                    <div class="job-sub">Est. cu ft: <strong>${escapeHtml(String(r.cuft ?? 0))}</strong></div>
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
      state.inventory.push(normalizeInventoryItem({ name, category, cuft, createdAt:Date.now(), updatedAt:Date.now() }));
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

      row.name = name.trim();
      row.category = category.trim();
      row.cuft = Number.isFinite(Number(cuft)) ? Math.max(0, Number(cuft)) : row.cuft;
      row.updatedAt = Date.now();

      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // Scanner (starter)
  // ---------------------------
  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Starter: paste text. Next: camera/photo parsing.</div>
        </div>

        <div class="muted">
          For now, this is a “classification stub”:
          it guesses whether the text looks like a receipt vs inventory list.
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          <label class="field">
            <span>Paste scanned text</span>
            <textarea id="scanText" rows="6" placeholder="Paste receipt or item list text here..."></textarea>
          </label>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" type="button" id="scanAnalyze">Analyze</button>
            <button class="btn" type="button" id="scanClear">Clear</button>
          </div>

          <div id="scanResult" class="day-totals" style="display:none;"></div>
        </div>
      </div>
    `;

    $("#scanClear")?.addEventListener("click", () => {
      $("#scanText").value = "";
      const r = $("#scanResult");
      r.style.display = "none";
      r.innerHTML = "";
    });

    $("#scanAnalyze")?.addEventListener("click", () => {
      const text = ($("#scanText")?.value || "").trim();
      if (!text) return alert("Paste some text first.");

      const result = classifyScanText(text);
      const box = $("#scanResult");
      box.style.display = "block";
      box.innerHTML = `
        <div><strong>Type:</strong> ${escapeHtml(result.type)}</div>
        <div><strong>Confidence:</strong> ${escapeHtml(result.confidence)}</div>
        <div style="margin-top:6px;"><strong>Why:</strong> ${escapeHtml(result.why)}</div>
        <div style="margin-top:6px;" class="muted">Next step: auto-create a Receipt or Inventory entry from parsed fields.</div>
      `;

      // store scan history
      state.scans.push({ id: makeId("scan"), text, result, createdAt: Date.now() });
      persist();
    });
  }

  // Simple heuristic classifier (no AI yet, just useful)
  function classifyScanText(text) {
    const t = text.toLowerCase();

    const receiptSignals = [
      "subtotal", "total", "tax", "change", "cash", "visa", "mastercard",
      "receipt", "store", "merchant", "thank you", "transaction", "approved",
      "$", "amt", "balance"
    ];

    const inventorySignals = [
      "sofa", "couch", "dresser", "bed", "mattress", "table", "chair",
      "box", "boxes", "lamp", "tv", "mirror", "nightstand", "cabinet",
      "appliance", "fridge", "refrigerator", "washer", "dryer"
    ];

    let rScore = 0, iScore = 0;
    for (const s of receiptSignals) if (t.includes(s)) rScore++;
    for (const s of inventorySignals) if (t.includes(s)) iScore++;

    // Money pattern boosts receipt
    if (/\$\s*\d+(\.\d{2})?/.test(text)) rScore += 2;
    if (/(\d+)\s*x\s*/i.test(text)) iScore += 1; // "2x chairs" style

    if (rScore >= iScore + 2) {
      return { type: "Receipt", confidence: "High", why: `Receipt signals (${rScore}) beat inventory signals (${iScore}).` };
    }
    if (iScore >= rScore + 2) {
      return { type: "Inventory", confidence: "High", why: `Inventory signals (${iScore}) beat receipt signals (${rScore}).` };
    }
    if (rScore === 0 && iScore === 0) {
      return { type: "Unknown", confidence: "Low", why: "No strong keywords found." };
    }
    return { type: rScore >= iScore ? "Receipt (maybe)" : "Inventory (maybe)", confidence: "Medium", why: `Mixed signals: receipt=${rScore}, inventory=${iScore}.` };
  }

  // ---------------------------
  // Modals: Job
  // ---------------------------
  function openJobModal(jobId = null) {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (!overlay || !modal) return;

    const isEdit = !!jobId;
    state.editingJobId = jobId;

    const title = $("#jobModalTitle");
    if (title) title.textContent = isEdit ? "Edit Job" : "Add Job";

    $("#jobError").hidden = true;
    $("#jobDelete").hidden = !isEdit;

    const job = isEdit ? state.jobs.find(j => j.id === jobId) : normalizeJob({ date: ymd(state.currentDate) });

    $("#jobDate").value = job.date;
    $("#jobCustomer").value = job.customer || "";
    $("#jobPickup").value = job.pickup || "";
    $("#jobDropoff").value = job.dropoff || "";
    $("#jobAmount").value = String(job.amount ?? 0);
    $("#jobStatus").value = job.status || STATUS.scheduled;
    $("#jobNotes").value = job.notes || "";

    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeJobModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (overlay) overlay.hidden = true;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    state.editingJobId = null;
  }

  function saveJobFromModal() {
    const date = ($("#jobDate")?.value || "").trim();
    const customer = ($("#jobCustomer")?.value || "").trim();
    const pickup = ($("#jobPickup")?.value || "").trim();
    const dropoff = ($("#jobDropoff")?.value || "").trim();
    const amount = clampMoney($("#jobAmount")?.value ?? 0);
    const status = ($("#jobStatus")?.value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes")?.value || "").trim();

    if (!date) return showJobError("Date is required.");
    if (!customer) return showJobError("Customer is required.");

    const isEdit = !!state.editingJobId;

    if (isEdit) {
      const job = state.jobs.find(j => j.id === state.editingJobId);
      if (!job) return showJobError("Job not found.");

      job.date = date;
      job.customer = customer;
      job.pickup = pickup;
      job.dropoff = dropoff;
      job.amount = amount;
      job.status = STATUS[status] ? status : STATUS.scheduled;
      job.notes = notes;
      job.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        id: makeId("job"),
        date,
        customer,
        pickup,
        dropoff,
        amount,
        status: STATUS[status] ? status : STATUS.scheduled,
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeJobModal();
    renderAll();
  }

  function deleteJobFromModal() {
    const id = state.editingJobId;
    if (!id) return;
    if (!confirm("Delete this job?")) return;

    state.jobs = state.jobs.filter(j => j.id !== id);
    state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));

    persist();
    closeJobModal();
    renderAll();
  }

  function showJobError(msg) {
    const box = $("#jobError");
    if (!box) return alert(msg);
    box.textContent = msg;
    box.hidden = false;
  }

  // ---------------------------
  // Modals: Receipt
  // ---------------------------
  function openReceiptModal(receiptId = null) {
    const overlay = $("#modalOverlay");
    const modal = $("#receiptModal");
    if (!overlay || !modal) return;

    const isEdit = !!receiptId;
    state.editingReceiptId = receiptId;

    const title = $("#receiptModalTitle");
    if (title) title.textContent = isEdit ? "Edit Receipt" : "Add Receipt";

    $("#receiptError").hidden = true;
    $("#receiptDelete").hidden = !isEdit;

    const r = isEdit ? state.receipts.find(x => x.id === receiptId) : normalizeReceipt({ date: ymd(state.currentDate) });

    $("#receiptDate").value = r.date;
    $("#receiptVendor").value = r.vendor || "";
    $("#receiptCategory").value = r.category || "";
    $("#receiptAmount").value = String(r.amount ?? 0);
    $("#receiptLinkedJobId").value = r.linkedJobId || "";
    $("#receiptNotes").value = r.notes || "";

    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeReceiptModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#receiptModal");
    if (overlay) overlay.hidden = true;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    state.editingReceiptId = null;
  }

  function saveReceiptFromModal() {
    const date = ($("#receiptDate")?.value || "").trim();
    const vendor = ($("#receiptVendor")?.value || "").trim();
    const category = ($("#receiptCategory")?.value || "").trim();
    const amount = clampMoney($("#receiptAmount")?.value ?? 0);
    const linkedJobId = ($("#receiptLinkedJobId")?.value || "").trim();
    const notes = ($("#receiptNotes")?.value || "").trim();

    if (!date) return showReceiptError("Date is required.");
    if (!vendor) return showReceiptError("Vendor is required.");
    if (amount <= 0) return showReceiptError("Amount must be greater than 0.");

    const isEdit = !!state.editingReceiptId;

    if (isEdit) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return showReceiptError("Receipt not found.");

      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.linkedJobId = linkedJobId;
      r.notes = notes;
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date,
        vendor,
        category,
        amount,
        linkedJobId,
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeReceiptModal();
    renderAll();
  }

  function deleteReceiptFromModal() {
    const id = state.editingReceiptId;
    if (!id) return;
    if (!confirm("Delete this receipt?")) return;
    state.receipts = state.receipts.filter(r => r.id !== id);
    persist();
    closeReceiptModal();
    renderAll();
  }

  function showReceiptError(msg) {
    const box = $("#receiptError");
    if (!box) return alert(msg);
    box.textContent = msg;
    box.hidden = false;
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
    if (state.view === "drivers") renderRoster("drivers", "drivers", "Driver");
    if (state.view === "trucks") renderRoster("trucks", "trucks", "Truck");
    if (state.view === "dispatch") renderDispatch();
    if (state.view === "finance") renderFinance();
    if (state.view === "inventory") renderInventory();
    if (state.view === "scanner") renderScanner();
  }

  // ---------------------------
  // Bind UI
  // ---------------------------
  function bindNav() {
    // sidebar routing
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.dataset.view;
        if (v) setView(v);
      });
    });

    // topbar navigation
    $("#btnToday")?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    // calendar controls
    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = startOfDay(now);
      renderAll();
    });

    // topbar modals
    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    // modal buttons
    $("#jobModalClose")?.addEventListener("click", closeJobModal);
    $("#jobCancel")?.addEventListener("click", closeJobModal);
    $("#jobSave")?.addEventListener("click", saveJobFromModal);
    $("#jobDelete")?.addEventListener("click", deleteJobFromModal);

    $("#receiptModalClose")?.addEventListener("click", closeReceiptModal);
    $("#receiptCancel")?.addEventListener("click", closeReceiptModal);
    $("#receiptSave")?.addEventListener("click", saveReceiptFromModal);
    $("#receiptDelete")?.addEventListener("click", deleteReceiptFromModal);

    // click overlay closes any open modal
    $("#modalOverlay")?.addEventListener("click", () => {
      closeJobModal();
      closeReceiptModal();
    });
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    setPill("JS: ready ✅", true);

    // normalize saved data defensively
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.drivers = (state.drivers || []).map(x => normalizeNamedRow(x, "drv"));
    state.trucks = (state.trucks || []).map(x => normalizeNamedRow(x, "trk"));
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);

    persist();
    bindNav();

    // start where HTML starts
    setView($("#view-dashboard") ? "dashboard" : "day");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
