/* =========================================================
   Move-Master.OS — apps_v5_1.js (FULL STABLE BASE + SMART SCANNER)
   Matches your HTML architecture exactly:
   - Sidebar buttons: .nav-item[data-view]
   - Views: #view-dashboard, #view-calendar, #view-day,
            #view-drivers, #view-trucks, #view-dispatch,
            #view-finance, #view-inventory, #view-scanner
   - Topbar: #btnPrev #btnToday #btnNext #btnAddJob #btnAddReceipt
   - Calendar: #monthLabel #calendarGrid #dashboardCalendar
   - Day workspace: #dayTitle #dayJobsList #dayReceiptsList
   - Modals: #modalOverlay, #jobModal fields..., #receiptModal fields...
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
      alert("JS error. Open DevTools console for details.");
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
  // Domain normalizers
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
    o.date = (o.date || ymd(startOfDay(new Date()))).trim();
    o.item = (o.item || "").trim();
    o.category = (o.category || "Furniture").trim();
    o.cuft = Number(o.cuft);
    if (!Number.isFinite(o.cuft)) o.cuft = 0;
    o.cuft = Math.round(o.cuft * 10) / 10; // 0.1 precision
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeScan(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("scan");
    o.date = (o.date || ymd(startOfDay(new Date()))).trim();
    o.kind = (o.kind || "").trim(); // "receipt" | "inventory"
    o.raw = (o.raw || "").trim();
    o.result = o.result || {};
    o.createdAt = o.createdAt || Date.now();
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

    dispatch: loadArray(LS.dispatch) || [],
    finance: loadArray(LS.finance) || [],

    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans).map(normalizeScan),

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
  // View/router
  // ---------------------------
  function setView(name) {
    state.view = name;

    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));

    // Clean up nav labels (remove coming soon text)
    $$("[data-view]").forEach((btn) => {
      const v = btn.dataset.view;
      if (!v) return;
      const clean = v[0].toUpperCase() + v.slice(1);
      // Keep Dashboard/Calendar/Day Workspace intact
      if (["dashboard","calendar","day"].includes(v)) return;
      btn.textContent = clean;
    });

    renderAll();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) { return state.jobs.filter(j => j.date === dateStr); }
  function receiptsByDate(dateStr) { return state.receipts.filter(r => r.date === dateStr); }
  function inventoryByDate(dateStr) { return state.inventory.filter(i => i.date === dateStr); }

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

  function sumInvCuft(dateStr) {
    let total = 0;
    for (const i of inventoryByDate(dateStr)) total += Number(i.cuft) || 0;
    total = Math.round(total * 10) / 10;
    return total;
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
      const cuft = sumInvCuft(todayStr);

      todayStats.innerHTML = `
        <div>Jobs: <strong>${jobsByDate(todayStr).length}</strong></div>
        <div>Receipts: <strong>${receiptsByDate(todayStr).length}</strong></div>
        <div>Inventory items: <strong>${inventoryByDate(todayStr).length}</strong> · Est cu ft: <strong>${cuft.toFixed(1)}</strong></div>
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

    $$("[data-job-del]", host).forEach((btn) => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-job-del");
      if (!id) return;
      if (!confirm("Delete this job?")) return;
      state.jobs = state.jobs.filter(j => j.id !== id);
      state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));
      persist();
      renderAll();
    }));
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
          <div class="receipt-sub">${escapeHtml(r.date)} · ${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
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

    $$("[data-rcpt-del]", host).forEach((btn) => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-rcpt-del");
      if (!id) return;
      if (!confirm("Delete this receipt?")) return;
      state.receipts = state.receipts.filter(r => r.id !== id);
      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // Drivers / Trucks
  // ---------------------------
  function renderSimpleRoster(viewName, arrKey, singularLabel) {
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

  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Starter view. Next step: assign drivers/trucks to jobs by date.</div>
        </div>
        <div class="muted">
          Dispatch is active. Next: a table for selected date that assigns Driver + Truck to each Job.
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
          <div class="panel-sub">Month snapshot driven by Jobs + Receipts.</div>
        </div>

        <div class="day-totals">
          <div><strong>${MONTHS[m]} ${y}</strong></div>
          <div>Revenue: ${money(t.revenue)} · Expenses: ${money(t.expenses)} · Net: ${money(t.net)}</div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Next step: commission rules, driver accountability, receipt categories by driver, export.
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

    const dateStr = ymd(state.currentDate);
    const rows = inventoryByDate(dateStr);
    const totalCuft = sumInvCuft(dateStr);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">Track items (furniture/boxes) and estimated cubic feet. Tied to selected date.</div>
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

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.item || "Item")} <span class="muted">(${escapeHtml(r.category)})</span></div>
                    <div class="job-sub">Est. ${Number(r.cuft).toFixed(1)} cu ft ${r.notes ? "· " + escapeHtml(r.notes) : ""}</div>
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
      const item = ($("#invName")?.value || "").trim();
      const category = ($("#invCat")?.value || "Furniture").trim();
      const cuft = Number($("#invCuft")?.value ?? 0);
      if (!item) return alert("Item name is required.");
      state.inventory.push(normalizeInventoryItem({
        date: dateStr,
        item,
        category,
        cuft: Number.isFinite(cuft) ? cuft : 0,
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
      const item = prompt("Item:", row.item || "");
      if (item === null) return;
      const category = prompt("Category (Furniture/Boxes/Appliance/Other):", row.category || "Furniture");
      if (category === null) return;
      const cuft = prompt("Estimated cu ft:", String(row.cuft ?? 0));
      if (cuft === null) return;

      row.item = item.trim();
      row.category = category.trim() || "Other";
      row.cuft = Number(cuft);
      if (!Number.isFinite(row.cuft)) row.cuft = 0;
      row.cuft = Math.round(row.cuft * 10) / 10;
      row.updatedAt = Date.now();

      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // SMART SCANNER (local classifier + extractor)
  // ---------------------------
  const RECEIPT_CATS = [
    { cat: "Fuel", keys: ["shell","chevron","bp","exxon","sunoco","gas","fuel","diesel"] },
    { cat: "Tolls", keys: ["toll","ezpass","e-zpass","sunpass"] },
    { cat: "Parking", keys: ["parking","garage","meter"] },
    { cat: "Meals", keys: ["restaurant","cafe","mcdonald","burger","pizza","taco","coffee","meal"] },
    { cat: "Supplies", keys: ["home depot","lowes","u-haul","harbor freight","supplies","boxes","tape","wrap"] },
    { cat: "Maintenance", keys: ["oil","service","repair","auto","tire","mechanic","maintenance"] },
    { cat: "Lodging", keys: ["hotel","inn","motel","marriott","hilton"] },
  ];

  // Rough cu-ft table. Not perfect. But useful. Like humans, occasionally.
  const CUFT_TABLE = [
    { keys:["sectional"], cuft: 100 },
    { keys:["sofa","couch"], cuft: 70 },
    { keys:["loveseat"], cuft: 50 },
    { keys:["recliner"], cuft: 35 },
    { keys:["king bed","king mattress"], cuft: 70 },
    { keys:["queen bed","queen mattress"], cuft: 60 },
    { keys:["full bed","double mattress"], cuft: 50 },
    { keys:["twin bed","twin mattress"], cuft: 35 },
    { keys:["dresser"], cuft: 30 },
    { keys:["chest"], cuft: 25 },
    { keys:["nightstand"], cuft: 10 },
    { keys:["dining table"], cuft: 45 },
    { keys:["table"], cuft: 35 },
    { keys:["chair"], cuft: 10 },
    { keys:["tv stand"], cuft: 20 },
    { keys:["tv"], cuft: 15 },
    { keys:["desk"], cuft: 35 },
    { keys:["bookcase","bookshelf"], cuft: 25 },
    { keys:["mirror"], cuft: 10 },
    { keys:["box","boxes"], cuft: 3 },          // per box
    { keys:["wardrobe"], cuft: 45 },
    { keys:["fridge","refrigerator"], cuft: 55 },
    { keys:["washer"], cuft: 35 },
    { keys:["dryer"], cuft: 35 },
    { keys:["stove","range"], cuft: 45 },
    { keys:["microwave"], cuft: 8 },
  ];

  function classifyText(raw) {
    const t = (raw || "").toLowerCase();

    const receiptSignals = [
      "$", "subtotal", "tax", "total", "visa", "mastercard", "amex", "debit", "credit",
      "auth", "approved", "change", "cashier", "receipt", "transaction", "store", "item"
    ];
    const invSignals = [
      "sofa","couch","dresser","bed","mattress","box","boxes","table","chair","tv","desk",
      "bookcase","bookshelf","fridge","washer","dryer","stove","wardrobe","nightstand"
    ];

    let r = 0, i = 0;
    for (const s of receiptSignals) if (t.includes(s)) r++;
    for (const s of invSignals) if (t.includes(s)) i++;

    // quantity patterns increase inventory likelihood
    if (/\b(\d+)\s*(x|pcs|pieces)\b/.test(t)) i += 2;
    if (/\bqty\b/.test(t)) i += 1;

    // money pattern increases receipt likelihood
    if (/\$\s*\d+(\.\d{2})?/.test(t)) r += 3;

    if (r > i) return "receipt";
    if (i > r) return "inventory";

    // tie-breaker: if any money pattern, call it receipt
    if (/\d+\.\d{2}/.test(t) || /\$\s*\d+/.test(t)) return "receipt";
    return "inventory";
  }

  function guessReceiptCategory(raw) {
    const t = (raw || "").toLowerCase();
    for (const rule of RECEIPT_CATS) {
      for (const k of rule.keys) {
        if (t.includes(k)) return rule.cat;
      }
    }
    return "Other";
  }

  function extractAmount(raw) {
    const t = (raw || "").replace(/,/g, "");
    // Prefer "total" lines if present
    const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

    // Look for totals
    for (const ln of lines.slice().reverse()) {
      if (/total/i.test(ln) && /(\d+\.\d{2})/.test(ln)) {
        const m = ln.match(/(\d+\.\d{2})/g);
        if (m && m.length) return clampMoney(m[m.length - 1]);
      }
    }

    // Fallback: largest money-ish number
    const nums = t.match(/\d+\.\d{2}/g) || [];
    let best = 0;
    for (const n of nums) {
      const v = Number(n);
      if (Number.isFinite(v) && v > best) best = v;
    }
    return clampMoney(best);
  }

  function extractDate(raw) {
    const t = raw || "";
    // Common formats: 12/27/2025, 12-27-25, 2025-12-27
    const m1 = t.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
    if (m1) {
      let mm = Number(m1[1]), dd = Number(m1[2]), yy = Number(m1[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) return ymd(d);
    }
    const m2 = t.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
    if (m2) {
      const yy = Number(m2[1]), mm = Number(m2[2]), dd = Number(m2[3]);
      const d = new Date(yy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) return ymd(d);
    }
    return ymd(state.currentDate);
  }

  function extractVendor(raw) {
    const lines = (raw || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) return "";
    // vendor is usually first non-empty line, but avoid lines that are just numbers
    for (const ln of lines.slice(0, 4)) {
      if (ln.length < 2) continue;
      if (/^\d+(\.\d+)?$/.test(ln)) continue;
      if (/total|subtotal|tax/i.test(ln)) continue;
      return ln.slice(0, 40);
    }
    return lines[0].slice(0, 40);
  }

  function parseInventoryLines(raw) {
    const lines = (raw || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    // also support comma-separated
    if (lines.length <= 1 && raw.includes(",")) {
      return raw.split(",").map(x => x.trim()).filter(Boolean);
    }
    return lines;
  }

  function parseQtyAndName(line) {
    // supports: "2x chair", "3 chairs", "qty 4 boxes"
    const l = (line || "").trim();
    let qty = 1;
    let name = l;

    const m1 = l.match(/^\s*(\d+)\s*(x|pcs|pieces)\s*(.+)$/i);
    if (m1) {
      qty = Number(m1[1]) || 1;
      name = m1[3].trim();
      return { qty, name };
    }

    const m2 = l.match(/^\s*(\d+)\s+(.+)$/);
    if (m2) {
      qty = Number(m2[1]) || 1;
      name = m2[2].trim();
      return { qty, name };
    }

    const m3 = l.match(/qty\s*[:\-]?\s*(\d+)\s+(.+)$/i);
    if (m3) {
      qty = Number(m3[1]) || 1;
      name = m3[2].trim();
      return { qty, name };
    }

    return { qty, name };
  }

  function estimateCuftForItem(name, qty) {
    const t = (name || "").toLowerCase();
    for (const row of CUFT_TABLE) {
      for (const k of row.keys) {
        if (t.includes(k)) {
          const base = row.cuft;
          const q = Number(qty) || 1;
          return Math.round((base * q) * 10) / 10;
        }
      }
    }
    // unknown item guess
    const q = Number(qty) || 1;
    return Math.round((15 * q) * 10) / 10; // generic fallback
  }

  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Paste text from a receipt or an inventory list. (Next step later: photo + OCR)</div>
        </div>

        <label class="field">
          <span>Paste text to classify</span>
          <textarea id="scanInput" rows="7" placeholder="Paste receipt text or furniture list..."></textarea>
        </label>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:10px;">
          <button class="btn primary" type="button" id="scanAnalyze">Analyze</button>
          <button class="btn" type="button" id="scanClear">Clear</button>
          <div class="muted">Tied to selected date: <strong>${escapeHtml(ymd(state.currentDate))}</strong></div>
        </div>

        <div id="scanResult" style="margin-top:12px;"></div>

        <div style="margin-top:12px;" class="muted">
          This is a local classifier right now. When you wire Supabase + Edge Functions, we’ll do real extraction + image scanning.
        </div>
      </div>
    `;

    $("#scanClear")?.addEventListener("click", () => {
      $("#scanInput").value = "";
      $("#scanResult").innerHTML = "";
    });

    $("#scanAnalyze")?.addEventListener("click", () => {
      const raw = ($("#scanInput")?.value || "").trim();
      if (!raw) return alert("Paste something first.");

      const kind = classifyText(raw);
      const dateStr = ymd(state.currentDate);

      if (kind === "receipt") {
        const vendor = extractVendor(raw);
        const amount = extractAmount(raw);
        const date = extractDate(raw);
        const category = guessReceiptCategory(raw);

        const result = { kind, vendor, amount, date, category };
        state.scans.unshift(normalizeScan({ date: dateStr, kind, raw, result, createdAt: Date.now() }));
        persist();

        $("#scanResult").innerHTML = `
          <div class="day-totals">
            <div><strong>Detected:</strong> Receipt</div>
            <div>Vendor: <strong>${escapeHtml(vendor || "(unknown)")}</strong></div>
            <div>Date: <strong>${escapeHtml(date)}</strong></div>
            <div>Amount: <strong>${money(amount)}</strong></div>
            <div>Category guess: <strong>${escapeHtml(category)}</strong></div>
          </div>

          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" type="button" id="scanSaveReceipt">Save as Receipt</button>
            <button class="btn" type="button" id="scanOpenReceipts">Go to Day Workspace</button>
          </div>
        `;

        $("#scanSaveReceipt")?.addEventListener("click", () => {
          state.receipts.push(normalizeReceipt({
            date,
            vendor,
            category,
            amount,
            notes: "Saved from Scanner",
            linkedJobId: "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
          persist();
          alert("Receipt saved.");
          renderAll();
        });

        $("#scanOpenReceipts")?.addEventListener("click", () => setView("day"));
        return;
      }

      // inventory path
      const lines = parseInventoryLines(raw);
      const parsed = lines.map(line => {
        const { qty, name } = parseQtyAndName(line);
        const cuft = estimateCuftForItem(name, qty);
        return { line, qty, name, cuft };
      });

      const total = parsed.reduce((s, x) => s + (Number(x.cuft) || 0), 0);
      const totalFix = Math.round(total * 10) / 10;

      const result = { kind, items: parsed, totalCuft: totalFix };
      state.scans.unshift(normalizeScan({ date: dateStr, kind, raw, result, createdAt: Date.now() }));
      persist();

      $("#scanResult").innerHTML = `
        <div class="day-totals">
          <div><strong>Detected:</strong> Inventory / Furniture list</div>
          <div>Lines: <strong>${parsed.length}</strong> · Est total cu ft: <strong>${totalFix.toFixed(1)}</strong></div>
        </div>

        <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
          ${parsed.slice(0, 20).map(x => `
            <div class="job-row">
              <div class="job-main">
                <div class="job-title">${escapeHtml(x.name)}</div>
                <div class="job-sub">Qty ${x.qty} · Est ${Number(x.cuft).toFixed(1)} cu ft</div>
              </div>
            </div>
          `).join("")}
          ${parsed.length > 20 ? `<div class="muted">Showing first 20 lines…</div>` : ""}
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="scanSaveInventory">Save items to Inventory</button>
          <button class="btn" type="button" id="scanOpenInventory">Open Inventory</button>
        </div>
      `;

      $("#scanSaveInventory")?.addEventListener("click", () => {
        const date = ymd(state.currentDate);
        for (const x of parsed) {
          state.inventory.push(normalizeInventoryItem({
            date,
            item: x.name,
            category: "Furniture",
            cuft: x.cuft,
            notes: "Saved from Scanner",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }));
        }
        persist();
        alert("Inventory items saved.");
        renderAll();
      });

      $("#scanOpenInventory")?.addEventListener("click", () => setView("inventory"));
    });
  }

  // ---------------------------
  // Modals: Job
  // ---------------------------
  function openOverlay() { $("#modalOverlay").hidden = false; }
  function closeOverlay() { $("#modalOverlay").hidden = true; }

  function openJobModal(jobId = null) {
    const modal = $("#jobModal");
    if (!modal) return;

    state.editingJobId = jobId;

    const isEdit = !!jobId;
    $("#jobModalTitle").textContent = isEdit ? "Edit Job" : "Add Job";

    const job = isEdit ? state.jobs.find(j => j.id === jobId) : null;

    $("#jobDate").value = (job?.date || ymd(state.currentDate));
    $("#jobCustomer").value = (job?.customer || "");
    $("#jobPickup").value = (job?.pickup || "");
    $("#jobDropoff").value = (job?.dropoff || "");
    $("#jobAmount").value = String(job?.amount ?? 0);
    $("#jobStatus").value = (job?.status || STATUS.scheduled);
    $("#jobNotes").value = (job?.notes || "");

    $("#jobDelete").hidden = !isEdit;

    $("#jobError").hidden = true;
    $("#jobError").textContent = "";

    openOverlay();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeJobModal() {
    const modal = $("#jobModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    closeOverlay();
    state.editingJobId = null;
  }

  function saveJobFromModal() {
    const date = ($("#jobDate").value || ymd(state.currentDate)).trim();
    const customer = ($("#jobCustomer").value || "").trim();
    const pickup = ($("#jobPickup").value || "").trim();
    const dropoff = ($("#jobDropoff").value || "").trim();
    const amount = clampMoney($("#jobAmount").value ?? 0);
    const status = ($("#jobStatus").value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes").value || "").trim();

    const err = $("#jobError");
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };

    if (!customer) return fail("Customer is required.");
    if (!date) return fail("Date is required.");
    if (!STATUS[status]) return fail("Invalid status.");

    if (state.editingJobId) {
      const j = state.jobs.find(x => x.id === state.editingJobId);
      if (!j) return fail("Job not found.");
      j.date = date;
      j.customer = customer;
      j.pickup = pickup;
      j.dropoff = dropoff;
      j.amount = amount;
      j.status = status;
      j.notes = notes;
      j.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        date, customer, pickup, dropoff, amount, status, notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeJobModal();
    renderAll();
  }

  function deleteJobFromModal() {
    if (!state.editingJobId) return;
    if (!confirm("Delete this job?")) return;

    const id = state.editingJobId;
    state.jobs = state.jobs.filter(j => j.id !== id);
    state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"" }) : r));
    persist();

    closeJobModal();
    renderAll();
  }

  // ---------------------------
  // Modals: Receipt
  // ---------------------------
  function openReceiptModal(receiptId = null) {
    const modal = $("#receiptModal");
    if (!modal) return;

    state.editingReceiptId = receiptId;
    const isEdit = !!receiptId;
    $("#receiptModalTitle").textContent = isEdit ? "Edit Receipt" : "Add Receipt";

    const r = isEdit ? state.receipts.find(x => x.id === receiptId) : null;

    $("#receiptDate").value = (r?.date || ymd(state.currentDate));
    $("#receiptVendor").value = (r?.vendor || "");
    $("#receiptCategory").value = (r?.category || "");
    $("#receiptAmount").value = String(r?.amount ?? 0);
    $("#receiptLinkedJobId").value = (r?.linkedJobId || "");
    $("#receiptNotes").value = (r?.notes || "");

    $("#receiptDelete").hidden = !isEdit;
    $("#receiptError").hidden = true;
    $("#receiptError").textContent = "";

    openOverlay();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeReceiptModal() {
    const modal = $("#receiptModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    closeOverlay();
    state.editingReceiptId = null;
  }

  function saveReceiptFromModal() {
    const date = ($("#receiptDate").value || ymd(state.currentDate)).trim();
    const vendor = ($("#receiptVendor").value || "").trim();
    const category = ($("#receiptCategory").value || "").trim();
    const amount = clampMoney($("#receiptAmount").value ?? 0);
    const linkedJobId = ($("#receiptLinkedJobId").value || "").trim();
    const notes = ($("#receiptNotes").value || "").trim();

    const err = $("#receiptError");
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };

    if (!vendor) return fail("Vendor is required.");
    if (!date) return fail("Date is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Receipt not found.");
      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.linkedJobId = linkedJobId;
      r.notes = notes;
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        date, vendor, category, amount, linkedJobId, notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeReceiptModal();
    renderAll();
  }

  function deleteReceiptFromModal() {
    if (!state.editingReceiptId) return;
    if (!confirm("Delete this receipt?")) return;
    const id = state.editingReceiptId;
    state.receipts = state.receipts.filter(r => r.id !== id);
    persist();
    closeReceiptModal();
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
        state.view === "drivers" ? "Drivers" :
        state.view === "trucks" ? "Trucks" :
        state.view === "dispatch" ? "Dispatch" :
        state.view === "finance" ? "Finance" :
        state.view === "inventory" ? "Inventory" :
        state.view === "scanner" ? "Scanner" :
        "Workspace";
    }

    // Render view-specific
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderSimpleRoster("drivers", "drivers", "Driver");
    if (state.view === "trucks") renderSimpleRoster("trucks", "trucks", "Truck");
    if (state.view === "dispatch") renderDispatch();
    if (state.view === "finance") renderFinance();
    if (state.view === "inventory") renderInventory();
    if (state.view === "scanner") renderScanner();
  }

  // ---------------------------
  // Navigation bindings
  // ---------------------------
  function bindNav() {
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.dataset.view;
        if (v) setView(v);
      });
    });

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

    // Topbar actions
    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    // Modal events
    $("#modalOverlay")?.addEventListener("click", () => {
      // close whichever is open
      if (!$("#jobModal").hidden) closeJobModal();
      if (!$("#receiptModal").hidden) closeReceiptModal();
    });

    $("#jobModalClose")?.addEventListener("click", closeJobModal);
    $("#jobCancel")?.addEventListener("click", closeJobModal);
    $("#jobSave")?.addEventListener("click", saveJobFromModal);
    $("#jobDelete")?.addEventListener("click", deleteJobFromModal);

    $("#receiptModalClose")?.addEventListener("click", closeReceiptModal);
    $("#receiptCancel")?.addEventListener("click", closeReceiptModal);
    $("#receiptSave")?.addEventListener("click", saveReceiptFromModal);
    $("#receiptDelete")?.addEventListener("click", deleteReceiptFromModal);

    // Escape key closes modals
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#jobModal").hidden) closeJobModal();
      if (!$("#receiptModal").hidden) closeReceiptModal();
    });
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
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    state.scans = (state.scans || []).map(normalizeScan);
    persist();

    bindNav();

    // default view
    if ($("#view-dashboard")) setView("dashboard");
    else if ($("#view-day")) setView("day");
    else if ($("#view-calendar")) setView("calendar");
    else renderAll();

    setPill("JS: ready ✅", true);
    console.log("✅ apps_v5_1.js ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
