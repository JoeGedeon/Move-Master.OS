/* =========================================================
   Fleet CRM — apps_v5.js (FULL)
   Next Update: RECEIPTS MODULE + Job Linking + Totals
   ---------------------------------------------------------
   Works with existing layout. No required HTML edits.
   - Views: dashboard / calendar / day / receipts (if present)
   - Jobs: status editing (existing day list assumed), safe if absent
   - Receipts: Add/Edit/Delete, categories, link to job, totals
   - Month calendar: markers for jobs + receipts
   - LocalStorage persistence
   ========================================================= */

(() => {
  "use strict";

  console.log("✅ apps_v5.js loaded");

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
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function safe(fn) { try { fn(); } catch (e) { console.error("[Fleet]", e); } }

  // ---------------------------
  // Storage
  // ---------------------------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";

  const STATUS = {
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
  };

  const STATUS_LABEL = {
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  const RECEIPT_CATEGORIES = [
    "Fuel",
    "Tolls",
    "Supplies",
    "Parking",
    "Meals",
    "Maintenance",
    "Lodging",
    "Other",
  ];

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

    // optional fields (future-proof)
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
    rec.jobId = (rec.jobId || "").trim(); // link to job (optional)

    if (!rec.createdAt) rec.createdAt = Date.now();
    rec.updatedAt = rec.updatedAt || rec.createdAt;
    return rec;
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

    // receipt modal state
    receiptMode: "add",
    editingReceiptId: null,
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
  }

  // ---------------------------
  // View switching (uses your existing view containers if present)
  // expects: #view-dashboard, #view-calendar, #view-day, #view-receipts (optional)
  // and nav buttons with [data-view="dashboard"] etc.
  // ---------------------------
  function setView(name) {
    state.view = name;

    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
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
  // Dashboard render (uses #dashboardStats if present)
  // ---------------------------
  function renderDashboard() {
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

    // Optional: quick calendar container if you have it
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
  // Full month calendar (expects #calendarGrid and #monthLabel or #calendarLabel)
  // ---------------------------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel") || $("#calendarLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();

    label.textContent = `${monthName(m)} ${y}`;
    grid.innerHTML = "";

    // Optional DOW header if your CSS supports it
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    if (!grid.classList.contains("no-dow")) {
      for (const d of dow) {
        const h = document.createElement("div");
        h.className = "dow";
        h.textContent = d;
        grid.appendChild(h);
      }
    }

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = startOfDay(new Date());

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
      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(day);

      const marker = document.createElement("div");
      marker.className = "markerbar";

      const jc = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(dateStr).length;

      if (jc) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `${jc} job${jc === 1 ? "" : "s"}`;
        marker.appendChild(chip);
      }
      if (rc) {
        const chip = document.createElement("span");
        chip.className = "chip chip-receipts";
        chip.textContent = `🧾 ${rc}`;
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
  // Day workspace render (expects #dayTitle, #dayJobsList or #dayJobs, and #dayReceiptsList optional)
  // If day jobs container not present, it won’t crash.
  // ---------------------------
  function renderDay() {
    const dateStr = ymd(state.currentDate);

    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace – ${dateStr}`;

    renderDayJobs(dateStr);
    renderDayReceipts(dateStr);

    // Optional "Open calendar" or similar buttons
    $("#openCalendar")?.addEventListener("click", () => setView("calendar"));
  }

  function renderDayJobs(dateStr) {
    // Supports either #dayJobsList or #dayJobs
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

    // Bind job status change
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

    // Bind delete
    $$("[data-job-del]", list).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter((j) => j.id !== id);
        // unlink receipts pointing to this job
        state.receipts = state.receipts.map((r) => r.jobId === id ? normalizeReceipt({ ...r, jobId: "", updatedAt: Date.now() }) : r);
        persist();
        renderAll();
      });
    });

    // Bind edit (if you already have a job modal in your HTML, we’ll use it)
    $$("[data-job-open]", list).forEach((btn) => {
      btn.addEventListener("click", () => openJobEditor(btn.getAttribute("data-job-open")));
    });
  }

  // ---------------------------
  // Job Editor (NO REQUIRED HTML)
  // If you have #jobModal & fields, it uses them. If not, uses prompt-based safe editor.
  // ---------------------------
  function openJobEditor(jobId) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    const modal = $("#jobModal");
    const overlay = $("#modalOverlay");

    // If your existing modal exists, fill and show it
    if (modal && overlay && $("#jobCustomer") && $("#jobPickup") && $("#jobDropoff") && $("#jobAmount") && $("#jobDate")) {
      overlay.hidden = false;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");

      $("#jobDate").value = job.date;
      $("#jobCustomer").value = job.customer || "";
      $("#jobPickup").value = job.pickup || "";
      $("#jobDropoff").value = job.dropoff || "";
      $("#jobAmount").value = String(job.amount ?? 0);
      $("#jobNotes") && ($("#jobNotes").value = job.notes || "");
      $("#jobStatus") && ($("#jobStatus").value = job.status || STATUS.scheduled);

      // Save handler
      $("#jobSave")?.addEventListener("click", () => {
        job.date = $("#jobDate").value || job.date;
        job.customer = ($("#jobCustomer").value || "").trim();
        job.pickup = ($("#jobPickup").value || "").trim();
        job.dropoff = ($("#jobDropoff").value || "").trim();
        job.amount = clampMoney($("#jobAmount").value ?? job.amount);
        if ($("#jobNotes")) job.notes = ($("#jobNotes").value || "").trim();
        if ($("#jobStatus")) job.status = STATUS_LABEL[$("#jobStatus").value] ? $("#jobStatus").value : job.status;

        job.updatedAt = Date.now();
        persist();
        closeJobModal();
        renderAll();
      }, { once: true });

      $("#jobCancel")?.addEventListener("click", closeJobModal, { once: true });
      $("#jobModalClose")?.addEventListener("click", closeJobModal, { once: true });
      overlay.addEventListener("click", closeJobModal, { once: true });

      return;
    }

    // Fallback editor (keeps you moving even if modal HTML isn’t present)
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

  function closeJobModal() {
    $("#modalOverlay") && ($("#modalOverlay").hidden = true);
    $("#jobModal") && ($("#jobModal").hidden = true, $("#jobModal").setAttribute("aria-hidden","true"));
  }

  // ---------------------------
  // Day Receipts render
  // Expects #dayReceiptsList OR injects into #view-day if missing.
  // ---------------------------
  function renderDayReceipts(dateStr) {
    let host = $("#dayReceiptsList");

    // If there isn't a dedicated receipts list area in day view, inject one safely
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

    // Build job options list for linking
    const jobs = jobsByDate(dateStr);
    const jobOptions = [
      `<option value="">(Not linked)</option>`,
      ...jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Receipts – ${dateStr}</div>
          <div class="panel-sub">Track driver/company expenses for the day. Link receipts to jobs when relevant.</div>
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
            <select id="rcptJobId">
              ${jobOptions}
            </select>
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

    // Bind Add
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

    // Bind Delete
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

    // Bind Edit
    $$("[data-rcpt-edit]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-edit");
        if (!id) return;
        openReceiptEditor(id);
      });
    });
  }

  // ---------------------------
  // Receipt Editor (no required HTML)
  // If you have a receipt modal in HTML later, we can wire it. For now: safe prompt editor.
  // ---------------------------
  function openReceiptEditor(receiptId) {
    const r = state.receipts.find((x) => x.id === receiptId);
    if (!r) return;

    const vendor = prompt("Vendor:", r.vendor || "");
    if (vendor === null) return;
    const amount = prompt("Amount:", String(r.amount ?? 0));
    if (amount === null) return;

    const category = prompt(
      `Category (examples: ${RECEIPT_CATEGORIES.join(", ")}):`,
      r.category || ""
    );
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
  // Receipts view (if you have #view-receipts)
  // Shows month-to-date receipts summary and list.
  // ---------------------------
  function renderReceiptsView() {
    const host = $("#view-receipts") || $("#view-finances") || null;
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();

    const monthReceipts = state.receipts
      .filter((r) => {
        const d = new Date(r.date);
        return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
      })
      .slice()
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    let total = 0;
    const catMap = new Map();
    for (const r of monthReceipts) {
      total += clampMoney(r.amount);
      const k = r.category || "Uncategorized";
      catMap.set(k, clampMoney((catMap.get(k) || 0) + clampMoney(r.amount)));
    }
    total = clampMoney(total);

    const catLines = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Receipts – ${monthName(m)} ${y}</div>
          <div class="panel-sub">Month-to-date expense tracking.</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Expenses (MTD):</strong> ${money(total)}</div>
          <div>${catLines.length ? catLines.slice(0,6).map(([k,v]) => `${escapeHtml(k)} ${money(v)}`).join(" · ") : "No receipts yet"}</div>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            monthReceipts.length
              ? monthReceipts.map(r => {
                  const linked = r.jobId ? state.jobs.find(j => j.id === r.jobId) : null;
                  return `
                    <div class="receipt-row">
                      <div class="receipt-main">
                        <div class="receipt-title">
                          ${escapeHtml(r.date)} · ${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")}
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
              : `<div class="muted empty">No receipts recorded this month yet.</div>`
          }
        </div>
      </div>
    `;

    // bind edit/del in receipts view
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

  // ---------------------------
  // Render all
  // ---------------------------
  function renderAll() {
    // context line if you have one
    const ctx = $("#contextLine");
    if (ctx) {
      const dateStr = ymd(state.currentDate);
      ctx.textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view === "receipts" ? "Receipts" :
        "Workspace";
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "receipts") renderReceiptsView();

    // If your app shows dashboard + other components simultaneously, you can also refresh these:
    // renderDashboard();
    // renderCalendar();
    // renderDay();
  }

  // ---------------------------
  // Navigation bindings
  // Expects:
  // - buttons with [data-view]
  // - toolbar buttons: #btnToday #btnPrev #btnNext (optional)
  // - calendar month nav: #calPrev #calNext #calToday (optional)
  // ---------------------------
  function bindNav() {
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (btn.dataset.view) setView(btn.dataset.view);
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
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    // normalize stored data (in case older saves exist)
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    persist();

    bindNav();

    // default view: dashboard if exists, else day
    if ($("#view-dashboard")) setView("dashboard");
    else if ($("#view-day")) setView("day");
    else if ($("#view-calendar")) setView("calendar");
    else renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
