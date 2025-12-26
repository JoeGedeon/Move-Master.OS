/* =========================================================
   Fleet CRM — apps_v5.js (FULL - Architecture-Compatible)
   Based on your last working model + upgrades:
   - Safe navigation binding (data-view) so buttons actually route
   - Calendar auto-build if #calendarGrid/#monthLabel missing
   - Dashboard widgets auto-build if missing
   - Inventory module (CRUD + totals) using #view-inventory (or inject)
   - Keeps existing structure. No required HTML edits.
   ========================================================= */

(() => {
  "use strict";

  console.log("✅ apps_v5.js loaded (arch-compatible)");

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

  const monthName = (m) =>
    ["January","February","March","April","May","June","July","August","September","October","November","December"][m];

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
    try { fn(); }
    catch (e) { console.error("[Fleet]", e); }
  }

  // ---------------------------
  // Storage
  // ---------------------------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";
  const LS_INVENTORY = "fleet_inventory_v5";

  const STATUS = { scheduled: "scheduled", completed: "completed", cancelled: "cancelled" };
  const STATUS_LABEL = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" };

  const RECEIPT_CATEGORIES = ["Fuel","Tolls","Supplies","Parking","Meals","Maintenance","Lodging","Other"];

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveArray(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  }

  // ---------------------------
  // Normalizers
  // ---------------------------
  function normalizeJob(j) {
    const job = { ...(j || {}) };
    if (!job.id) job.id = makeId("job");
    if (!job.date) job.date = ymd(startOfDay(new Date()));
    if (!job.status || !STATUS_LABEL[job.status]) job.status = STATUS.scheduled;

    job.customer = (job.customer || "").trim();
    job.pickup = (job.pickup || "").trim();
    job.dropoff = (job.dropoff || "").trim();
    job.amount = clampMoney(job.amount ?? 0);
    job.notes = (job.notes || "").trim();

    job.driver = (job.driver || "").trim();
    job.truck = (job.truck || "").trim();

    if (!job.createdAt) job.createdAt = Date.now();
    job.updatedAt = job.updatedAt || job.createdAt;
    return job;
  }

  function normalizeReceipt(r) {
    const rec = { ...(r || {}) };
    if (!rec.id) rec.id = makeId("rcpt");
    if (!rec.date) rec.date = ymd(startOfDay(new Date()));

    rec.vendor = (rec.vendor || "").trim();
    rec.category = (rec.category || "").trim();
    rec.amount = clampMoney(rec.amount ?? 0);
    rec.notes = (rec.notes || "").trim();
    rec.jobId = (rec.jobId || "").trim();

    if (!rec.createdAt) rec.createdAt = Date.now();
    rec.updatedAt = rec.updatedAt || rec.createdAt;
    return rec;
  }

  function normalizeInventoryItem(it) {
    const o = { ...(it || {}) };
    if (!o.id) o.id = makeId("inv");
    o.name = (o.name || "").trim();
    o.sku = (o.sku || "").trim();
    o.category = (o.category || "General").trim() || "General";
    o.qty = Math.max(0, Math.floor(Number(o.qty ?? 0) || 0));
    o.unitCost = clampMoney(o.unitCost ?? 0);
    o.lowStock = Math.max(0, Math.floor(Number(o.lowStock ?? 0) || 0));
    o.notes = (o.notes || "").trim();
    o.active = o.active !== false;
    if (!o.createdAt) o.createdAt = Date.now();
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
    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
    inventory: loadArray(LS_INVENTORY).map(normalizeInventoryItem),
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_INVENTORY, state.inventory);
  }

  // Seed so widgets are not empty on day 1
  function seedIfEmpty() {
    if (state.jobs.length === 0 && state.receipts.length === 0) {
      const t = ymd(state.currentDate);
      state.jobs = [
        normalizeJob({ date: t, customer: "Sample Job A", pickup: "Pickup", dropoff: "Dropoff", amount: 900, status: STATUS.scheduled }),
        normalizeJob({ date: t, customer: "Sample Job B", pickup: "Pickup", dropoff: "Dropoff", amount: 1200, status: STATUS.completed }),
      ];
      state.receipts = [
        normalizeReceipt({ date: t, vendor: "Shell", category: "Fuel", amount: 67.89, notes: "Fuel" }),
        normalizeReceipt({ date: t, vendor: "Home Depot", category: "Supplies", amount: 32.10, notes: "Supplies" }),
      ];
    }
    if (state.inventory.length === 0) {
      state.inventory = [
        normalizeInventoryItem({ name: "Stretch Wrap", sku: "WRAP-001", category: "Supplies", qty: 12, unitCost: 8.99, lowStock: 5 }),
        normalizeInventoryItem({ name: "Moving Blankets", sku: "BLKT-010", category: "Supplies", qty: 30, unitCost: 12.5, lowStock: 10 }),
      ];
    }
    persist();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) {
    return state.jobs.filter((j) => j.date === dateStr);
  }

  function receiptsByDate(dateStr) {
    return state.receipts.filter((r) => r.date === dateStr);
  }

  function sumJobRevenue(dateStr) {
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumReceiptExpense(dateStr) {
    let total = 0;
    for (const r of receiptsByDate(dateStr)) total += clampMoney(r.amount);
    return clampMoney(total);
  }

  function receiptCategoryTotals(dateStr) {
    const map = new Map();
    for (const r of receiptsByDate(dateStr)) {
      const key = r.category || "Uncategorized";
      map.set(key, clampMoney((map.get(key) || 0) + clampMoney(r.amount)));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
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
    return { revenue: clampMoney(revenue), expenses: clampMoney(expenses), net: clampMoney(revenue - expenses) };
  }

  // ---------------------------
  // View switching (your existing architecture)
  // expects: #view-dashboard, #view-calendar, #view-day, #view-inventory (optional)
  // and nav buttons with [data-view="dashboard"] etc.
  // ---------------------------
  function setView(name) {
    state.view = name;

    // If your CSS uses .active to show/hide panels:
    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
  }

  // ---------------------------
  // Safety: ensure required containers exist (without breaking layout)
  // ---------------------------
  function ensureDashboardWidgets() {
    const dashView = $("#view-dashboard");
    if (!dashView) return;

    // Month snapshot / stats target
    let stats = $("#dashboardStats") || $("#monthSnapshot");
    if (!stats) {
      stats = document.createElement("div");
      stats.id = "dashboardStats";
      stats.style.marginTop = "10px";
      dashView.appendChild(stats);
    }

    // Quick calendar target
    let quick = $("#dashboardCalendar");
    if (!quick) {
      quick = document.createElement("div");
      quick.id = "dashboardCalendar";
      quick.style.marginTop = "12px";
      dashView.appendChild(quick);
    }
  }

  function ensureCalendarLayout() {
    const calView = $("#view-calendar");
    if (!calView) return;

    let label = $("#monthLabel") || $("#calendarLabel");
    let grid = $("#calendarGrid");

    // If calendar pieces are missing, inject a safe calendar block
    if (!label || !grid) {
      // Try not to overwrite existing content, just append a block
      const wrap = document.createElement("div");
      wrap.className = "panel";
      wrap.style.marginTop = "10px";
      wrap.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">Calendar</div>
          <div class="panel-sub" id="monthLabel"></div>
        </div>
        <div id="calendarGrid" style="margin-top:12px;"></div>
      `;
      calView.appendChild(wrap);
      label = $("#monthLabel") || label;
      grid = $("#calendarGrid") || grid;
    }

    // If your grid has no display rules in CSS, give it a safe default
    if (grid && !grid.style.display) {
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "repeat(7, 1fr)";
      grid.style.gap = "8px";
    }
  }

  function ensureInventoryView() {
    // Only if you have a view container or inventory nav exists
    const invView = $("#view-inventory");
    const invBtn = $$("[data-view]").find(b => (b.dataset.view || "") === "inventory");
    if (!invView && !invBtn) return;

    // If you don't have #view-inventory, we safely create it under the same parent as other views
    if (!invView) {
      const anyView = $$('[id^="view-"]')[0];
      if (anyView && anyView.parentElement) {
        const section = document.createElement("section");
        section.id = "view-inventory";
        section.className = "view";
        anyView.parentElement.appendChild(section);
      }
    }
  }

  // ---------------------------
  // Dashboard render
  // ---------------------------
  function renderDashboard() {
    ensureDashboardWidgets();

    const el = $("#dashboardStats") || $("#monthSnapshot");
    if (!el) return;

    const todayStr = ymd(state.currentDate);
    const jobsToday = jobsByDate(todayStr);
    const receiptsToday = receiptsByDate(todayStr);

    const revToday = sumJobRevenue(todayStr);
    const expToday = sumReceiptExpense(todayStr);
    const netToday = clampMoney(revToday - expToday);

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const mt = monthTotals(y, m);

    el.innerHTML = `
      <div><strong>Today:</strong> ${todayStr}</div>
      <div>Jobs: ${jobsToday.length} · Receipts: ${receiptsToday.length}</div>
      <div>Revenue: <strong>${money(revToday)}</strong> · Expenses: <strong>${money(expToday)}</strong> · Net: <strong>${money(netToday)}</strong></div>
      <div style="margin-top:8px; opacity:.9;">
        <strong>${monthName(m)} ${y}</strong> · Revenue ${money(mt.revenue)} · Expenses ${money(mt.expenses)} · Net ${money(mt.net)}
      </div>
    `;

    const quick = $("#dashboardCalendar");
    if (quick) renderQuickCalendar(quick);

    // Optional dashboard buttons if you have them
    $("#openCalendar")?.addEventListener("click", () => setView("calendar"));
    $("#openDay")?.addEventListener("click", () => setView("day"));
  }

  function renderQuickCalendar(container) {
    const y = state.currentDate.getFullYear();
    const m = state.currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "6px";

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (sameDay(d, state.currentDate)) btn.classList.add("active");
      if (jobsByDate(dateStr).some(j => j.status !== STATUS.cancelled)) btn.classList.add("has-jobs");
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
  // Full month calendar
  // ---------------------------
  function renderCalendar() {
    ensureCalendarLayout();

    const grid = $("#calendarGrid");
    const label = $("#monthLabel") || $("#calendarLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();

    label.textContent = `${monthName(m)} ${y}`;
    grid.innerHTML = "";

    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (const d of dow) {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      h.style.opacity = "0.85";
      grid.appendChild(h);
    }

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = startOfDay(new Date());

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      pad.style.minHeight = "54px";
      grid.appendChild(pad);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      cell.style.minHeight = "64px";
      cell.style.textAlign = "left";
      cell.style.padding = "10px";
      cell.style.borderRadius = "12px";
      cell.style.border = "1px solid rgba(255,255,255,0.12)";
      cell.style.background = "rgba(255,255,255,0.06)";
      cell.style.color = "inherit";

      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      const jc = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(dateStr).length;

      cell.innerHTML = `
        <div class="num" style="font-weight:800;">${day}</div>
        <div class="markerbar" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
          ${jc ? `<span class="chip chip-jobs">${jc} job${jc===1?"":"s"}</span>` : ""}
          ${rc ? `<span class="chip chip-receipts">🧾 ${rc}</span>` : ""}
        </div>
      `;

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ---------------------------
  // Day workspace render (jobs + receipts module injected safely)
  // ---------------------------
  function renderDay() {
    const dateStr = ymd(state.currentDate);

    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace – ${dateStr}`;

    renderDayJobs(dateStr);
    renderDayReceipts(dateStr);

    $("#openCalendar")?.addEventListener("click", () => setView("calendar"));
  }

  function renderDayJobs(dateStr) {
    const list = $("#dayJobsList") || $("#dayJobs");
    if (!list) return;

    const jobs = jobsByDate(dateStr).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const rev = sumJobRevenue(dateStr);
    const exp = sumReceiptExpense(dateStr);
    const net = clampMoney(rev - exp);

    list.innerHTML = "";

    const totals = document.createElement("div");
    totals.className = "day-totals";
    totals.innerHTML = `
      <div><strong>Totals</strong></div>
      <div>Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}</div>
    `;
    list.appendChild(totals);

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "muted empty";
      empty.textContent = "No jobs for this day yet.";
      list.appendChild(empty);
      return;
    }

    jobs.forEach((job) => {
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
          <button class="btn" type="button" data-job-open="${escapeHtml(job.id)}">Edit</button>
          <button class="btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
        </div>
      `;

      list.appendChild(row);
    });

    $$("[data-job-status]", list).forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-job-status");
        const val = e.target.value;
        const j = state.jobs.find((x) => x.id === id);
        if (!j) return;
        j.status = STATUS_LABEL[val] ? val : STATUS.scheduled;
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-job-del]", list).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter((j) => j.id !== id);
        state.receipts = state.receipts.map((r) => r.jobId === id ? normalizeReceipt({ ...r, jobId: "", updatedAt: Date.now() }) : r);
        persist();
        renderAll();
      });
    });

    $$("[data-job-open]", list).forEach((btn) => {
      btn.addEventListener("click", () => openJobEditor(btn.getAttribute("data-job-open")));
    });
  }

  function openJobEditor(jobId) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    // Prompt-based editor (no HTML dependency)
    const customer = prompt("Customer:", job.customer || "");
    if (customer === null) return;
    const pickup = prompt("Pickup address:", job.pickup || "");
    if (pickup === null) return;
    const dropoff = prompt("Dropoff address:", job.dropoff || "");
    if (dropoff === null) return;
    const amount = prompt("Amount ($):", String(job.amount ?? 0));
    if (amount === null) return;

    job.customer = customer.trim();
    job.pickup = pickup.trim();
    job.dropoff = dropoff.trim();
    job.amount = clampMoney(amount);
    job.updatedAt = Date.now();

    persist();
    renderAll();
  }

  function renderDayReceipts(dateStr) {
    let host = $("#dayReceiptsList");
    const dayView = $("#view-day");

    if (!host && dayView) {
      let injected = $("#__injectedDayReceipts");
      if (!injected) {
        injected = document.createElement("div");
        injected.id = "__injectedDayReceipts";
        injected.style.marginTop = "14px";
        dayView.appendChild(injected);
      }
      host = injected;
    }
    if (!host) return;

    const receipts = receiptsByDate(dateStr).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const total = sumReceiptExpense(dateStr);
    const cats = receiptCategoryTotals(dateStr);

    const jobs = jobsByDate(dateStr);
    const jobOptions = [
      `<option value="">(Not linked)</option>`,
      ...jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Receipts – ${dateStr}</div>
          <div class="panel-sub">Track expenses for the day. Link to jobs when relevant.</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Expenses:</strong> ${money(total)}</div>
          <div>${cats.length ? cats.map(([k,v]) => `${escapeHtml(k)} ${money(v)}`).slice(0,4).join(" · ") : "No categories yet"}</div>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Vendor</span>
            <input id="rcptVendor" type="text" placeholder="Shell, Home Depot, Toll" />
          </label>

          <label class="field" style="min-width:160px;">
            <span>Amount</span>
            <input id="rcptAmount" type="number" step="0.01" placeholder="0.00" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Category</span>
            <select id="rcptCategory">
              <option value="">Uncategorized</option>
              ${RECEIPT_CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>

          <label class="field" style="min-width:220px;">
            <span>Link to Job (optional)</span>
            <select id="rcptJobId">${jobOptions}</select>
          </label>

          <label class="field" style="min-width:260px;">
            <span>Notes</span>
            <input id="rcptNotes" type="text" placeholder="receipt #, reason, etc." />
          </label>

          <button id="rcptAddBtn" class="btn primary" type="button">Add Receipt</button>
        </div>

        <div id="rcptError" class="modal-error" style="margin-top:10px;" hidden></div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            receipts.length
              ? receipts.map(r => {
                  const linked = r.jobId ? state.jobs.find(j => j.id === r.jobId) : null;
                  return `
                    <div class="receipt-row">
                      <div class="receipt-main">
                        <div class="receipt-title">
                          ${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")}
                          ${linked ? `<span class="chip chip-jobs" style="margin-left:8px;">Linked: ${escapeHtml(linked.customer || "Job")}</span>` : ""}
                        </div>
                        <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
                      </div>
                      <div class="receipt-actions">
                        <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
                        <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
                      </div>
                    </div>
                  `;
                }).join("")
              : `<div class="muted empty">No receipts for this day yet.</div>`
          }
        </div>
      </div>
    `;

    $("#rcptAddBtn")?.addEventListener("click", () => {
      const vendor = ($("#rcptVendor")?.value || "").trim();
      const amount = clampMoney($("#rcptAmount")?.value ?? 0);
      const category = ($("#rcptCategory")?.value || "").trim();
      const jobId = ($("#rcptJobId")?.value || "").trim();
      const notes = ($("#rcptNotes")?.value || "").trim();

      const errBox = $("#rcptError");
      const fail = (msg) => { if (errBox) { errBox.textContent = msg; errBox.hidden = false; } };

      if (!vendor) return fail("Vendor is required.");
      if (amount <= 0) return fail("Amount must be greater than 0.");
      if (errBox) { errBox.hidden = true; errBox.textContent = ""; }

      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date: dateStr,
        vendor,
        amount,
        category,
        jobId,
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      persist();
      renderAll();
    });

    $$("[data-rcpt-del]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter((r) => r.id !== id);
        persist();
        renderAll();
      });
    });

    $$("[data-rcpt-edit]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-edit");
        if (!id) return;
        openReceiptEditor(id);
      });
    });
  }

  function openReceiptEditor(receiptId) {
    const r = state.receipts.find((x) => x.id === receiptId);
    if (!r) return;

    const vendor = prompt("Vendor:", r.vendor || "");
    if (vendor === null) return;
    const amount = prompt("Amount:", String(r.amount ?? 0));
    if (amount === null) return;
    const category = prompt(`Category (e.g. ${RECEIPT_CATEGORIES.join(", ")}):`, r.category || "");
    if (category === null) return;
    const notes = prompt("Notes:", r.notes || "");
    if (notes === null) return;

    r.vendor = vendor.trim();
    r.amount = clampMoney(amount);
    r.category = category.trim();
    r.notes = notes.trim();
    r.updatedAt = Date.now();

    persist();
    renderAll();
  }

  // ---------------------------
  // Inventory Module (view-inventory)
  // ---------------------------
  function renderInventory() {
    ensureInventoryView();
    const host = $("#view-inventory");
    if (!host) return;

    const items = state.inventory.filter(i => i.active !== false).slice().sort((a,b) => (a.category===b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)));
    const low = items.filter(i => i.qty <= (i.lowStock || 0)).length;
    const totalValue = clampMoney(items.reduce((sum, i) => sum + clampMoney(i.qty * (i.unitCost || 0)), 0));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">${items.length} item(s) · ${low} low-stock · Value ${money(totalValue)}</div>
        </div>

        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Name</span>
            <input id="invName" type="text" placeholder="Tape, Wrap, Dollies..." />
          </label>
          <label class="field" style="min-width:150px;">
            <span>SKU</span>
            <input id="invSku" type="text" placeholder="optional" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Category</span>
            <input id="invCat" type="text" placeholder="Supplies" />
          </label>
          <label class="field" style="min-width:110px;">
            <span>Qty</span>
            <input id="invQty" type="number" step="1" value="0" />
          </label>
          <label class="field" style="min-width:130px;">
            <span>Unit Cost</span>
            <input id="invCost" type="number" step="0.01" value="0" />
          </label>
          <label class="field" style="min-width:130px;">
            <span>Low Stock</span>
            <input id="invLow" type="number" step="1" value="0" />
          </label>
          <label class="field" style="min-width:260px; flex:1;">
            <span>Notes</span>
            <input id="invNotes" type="text" placeholder="optional" />
          </label>
          <button class="btn primary" type="button" id="invAdd">Add</button>
        </div>
      </div>

      <div class="panel" style="margin-top:12px;">
        <div class="panel-header">
          <div class="panel-title">Items</div>
          <div class="panel-sub">+/- for fast adjustments</div>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            items.length ? items.map(i => {
              const isLow = i.qty <= (i.lowStock || 0);
              return `
                <div class="job-row ${isLow ? "is-cancelled" : ""}">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(i.name || "Item")} ${i.sku ? `<span class="muted">(${escapeHtml(i.sku)})</span>` : ""}</div>
                    <div class="job-sub">
                      Category: <strong>${escapeHtml(i.category)}</strong> ·
                      Qty: <strong>${escapeHtml(i.qty)}</strong>${isLow ? ` · <strong>LOW</strong>` : ""} ·
                      Unit Cost: <strong>${money(i.unitCost || 0)}</strong> ·
                      Value: <strong>${money((i.unitCost || 0) * (i.qty || 0))}</strong>
                    </div>
                    ${i.notes ? `<div class="job-sub">${escapeHtml(i.notes)}</div>` : ""}
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-inv-minus="${escapeHtml(i.id)}">-1</button>
                    <button class="btn" type="button" data-inv-plus="${escapeHtml(i.id)}">+1</button>
                    <button class="btn" type="button" data-inv-edit="${escapeHtml(i.id)}">Edit</button>
                    <button class="btn danger" type="button" data-inv-del="${escapeHtml(i.id)}">Delete</button>
                  </div>
                </div>
              `;
            }).join("") : `<div class="muted empty">No inventory items yet.</div>`
          }
        </div>
      </div>
    `;

    $("#invAdd")?.addEventListener("click", () => {
      const name = ($("#invName")?.value || "").trim();
      const sku = ($("#invSku")?.value || "").trim();
      const category = ($("#invCat")?.value || "General").trim() || "General";
      const qty = Math.max(0, Math.floor(Number($("#invQty")?.value ?? 0) || 0));
      const unitCost = clampMoney($("#invCost")?.value ?? 0);
      const lowStock = Math.max(0, Math.floor(Number($("#invLow")?.value ?? 0) || 0));
      const notes = ($("#invNotes")?.value || "").trim();
      if (!name) return;

      state.inventory.push(normalizeInventoryItem({ name, sku, category, qty, unitCost, lowStock, notes }));
      persist();
      renderAll();
    });

    $$("[data-inv-plus]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-plus");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;
        it.qty = Math.max(0, (it.qty || 0) + 1);
        it.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-inv-minus]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-minus");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;
        it.qty = Math.max(0, (it.qty || 0) - 1);
        it.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-inv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-del");
        if (!id) return;
        if (!confirm("Delete this inventory item?")) return;
        state.inventory = state.inventory.filter(x => x.id !== id);
        persist();
        renderAll();
      });
    });

    $$("[data-inv-edit]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-edit");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;

        const name = prompt("Name:", it.name || "");
        if (name === null) return;
        const sku = prompt("SKU:", it.sku || "");
        if (sku === null) return;
        const category = prompt("Category:", it.category || "General");
        if (category === null) return;
        const qty = prompt("Qty:", String(it.qty ?? 0));
        if (qty === null) return;
        const unitCost = prompt("Unit Cost:", String(it.unitCost ?? 0));
        if (unitCost === null) return;
        const lowStock = prompt("Low Stock:", String(it.lowStock ?? 0));
        if (lowStock === null) return;
        const notes = prompt("Notes:", it.notes || "");
        if (notes === null) return;

        it.name = name.trim();
        it.sku = sku.trim();
        it.category = (category || "General").trim() || "General";
        it.qty = Math.max(0, Math.floor(Number(qty) || 0));
        it.unitCost = clampMoney(unitCost);
        it.lowStock = Math.max(0, Math.floor(Number(lowStock) || 0));
        it.notes = notes.trim();
        it.updatedAt = Date.now();

        persist();
        renderAll();
      });
    });
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
        state.view === "inventory" ? "Inventory" :
        "Workspace";
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "inventory") renderInventory();

    // Keep dashboard widgets fresh even if you render multiple panels at once
    // (uncomment if your layout shows dashboard + day together)
    // renderDashboard();
  }

  // ---------------------------
  // Navigation bindings (robust)
  // ---------------------------
  function bindNav() {
    // Remove old handlers by using delegation (less fragile)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-view]");
      if (!btn) return;

      const view = (btn.dataset.view || "").trim();
      if (!view) return;

      e.preventDefault();
      setView(view);
    }, true);

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
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    seedIfEmpty();

    // Normalize stored data (in case older saves exist)
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    persist();

    // Ensure missing UI bits don’t cause blank pages
    ensureDashboardWidgets();
    ensureCalendarLayout();
    ensureInventoryView();

    bindNav();

    // default view: dashboard if exists, else day, else calendar
    if ($("#view-dashboard")) setView("dashboard");
    else if ($("#view-day")) setView("day");
    else if ($("#view-calendar")) setView("calendar");
    else {
      // if your HTML uses a different system, still render dashboard widgets
      renderAll();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
