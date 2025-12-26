/* =========================================================
   Move-Master.OS — mm_app_001.js (FULL, matches your HTML)
   ---------------------------------------------------------
   Works with your posted HTML:
   - Buttons: .nav-item[data-view]
   - Views: #view-dashboard, #view-calendar, #view-day, etc.
   - Calendar containers: #dashboardCalendar, #calendarGrid, #monthLabel
   - Day containers: #dayJobsList, #dayReceiptsList
   - Modals: #jobModal, #receiptModal, #modalOverlay
   - Pill: #jsPill

   Features:
   - Router (sidebar + views)
   - Dashboard stats
   - Quick calendar
   - Full month calendar
   - Day workspace lists
   - Add/Edit/Delete Job
   - Add/Edit/Delete Receipt
   - LocalStorage persistence
   ========================================================= */

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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

  // ---------- Storage ----------
  const LS_JOBS = "mm_jobs_v5";
  const LS_RECEIPTS = "mm_receipts_v5";

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

  const VIEWS = [
    "dashboard","calendar","day","drivers","trucks","dispatch","finance","inventory","scanner"
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

  // ---------- State ----------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
    editingJobId: null,
    editingReceiptId: null,
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
  }

  // Seed once so UI isn’t empty
  function seedIfEmpty() {
    if (state.jobs.length || state.receipts.length) return;

    const today = ymd(state.currentDate);
    const jobId = makeId("job");
    state.jobs.push(normalizeJob({
      id: jobId,
      date: today,
      customer: "Sample Customer",
      pickup: "Pickup Address",
      dropoff: "Dropoff Address",
      amount: 1250,
      status: STATUS.scheduled,
      notes: "Seed job to prove the app is working",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    state.receipts.push(normalizeReceipt({
      id: makeId("rcpt"),
      date: today,
      vendor: "Shell",
      category: "Fuel",
      amount: 64.25,
      notes: "Seed receipt",
      jobId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    persist();
  }

  // ---------- Aggregations ----------
  const jobsByDate = (ds) => state.jobs.filter(j => j.date === ds);
  const receiptsByDate = (ds) => state.receipts.filter(r => r.date === ds);

  function sumRevenue(ds) {
    let total = 0;
    for (const j of jobsByDate(ds)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumExpenses(ds) {
    let total = 0;
    for (const r of receiptsByDate(ds)) total += clampMoney(r.amount);
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
    return { revenue: clampMoney(revenue), expenses: clampMoney(expenses), net: clampMoney(revenue - expenses) };
  }

  // ---------- JS Pill ----------
  function setPill(ok, text) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.classList.remove("ok","bad");
    pill.classList.add(ok ? "ok" : "bad");
    pill.textContent = text;
  }

  // ---------- Router ----------
  function setView(name) {
    if (!VIEWS.includes(name)) name = "dashboard";
    state.view = name;

    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${name}`)?.classList.add("active");

    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
  }

  // ---------- Render: Dashboard ----------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);
    $("#todayLine") && ($("#todayLine").textContent = todayStr);

    const revToday = sumRevenue(todayStr);
    const expToday = sumExpenses(todayStr);
    const netToday = clampMoney(revToday - expToday);

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const mt = monthTotals(y, m);

    $("#todayStats") && ($("#todayStats").innerHTML = `
      <div><b>Jobs:</b> ${jobsByDate(todayStr).length}</div>
      <div><b>Receipts:</b> ${receiptsByDate(todayStr).length}</div>
      <div><b>Revenue:</b> ${money(revToday)}</div>
      <div><b>Expenses:</b> ${money(expToday)}</div>
      <div><b>Net:</b> ${money(netToday)}</div>
    `);

    $("#monthSnapshot") && ($("#monthSnapshot").innerHTML = `
      <div><b>${escapeHtml(monthName(m))} ${y}</b></div>
      <div>Revenue: <b>${money(mt.revenue)}</b></div>
      <div>Expenses: <b>${money(mt.expenses)}</b></div>
      <div>Net: <b>${money(mt.net)}</b></div>
    `);

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
      const ds = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (ds === ymd(state.currentDate)) btn.classList.add("active");
      if (jobsByDate(ds).some(j => j.status !== STATUS.cancelled)) btn.classList.add("has-jobs");
      if (receiptsByDate(ds).length) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      container.appendChild(btn);
    }
  }

  // ---------- Render: Full Calendar ----------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel");
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

    const todayStr = ymd(startOfDay(new Date()));

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const ds = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (ds === todayStr) cell.classList.add("today");
      if (ds === ymd(state.currentDate)) cell.classList.add("selected");

      const dayJobs = jobsByDate(ds);
      const jc = dayJobs.filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      if (dayJobs.some(j => j.status === STATUS.completed)) cell.classList.add("has-completed");
      if (dayJobs.some(j => j.status === STATUS.scheduled)) cell.classList.add("has-scheduled");
      if (dayJobs.some(j => j.status === STATUS.cancelled)) cell.classList.add("has-cancelled");
      if (rc) cell.classList.add("has-receipts");

      cell.innerHTML = `
        <div class="num">${day}</div>
        <div class="markerbar">
          ${jc ? `<span class="chip chip-jobs">${jc} job${jc === 1 ? "" : "s"}</span>` : ""}
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

  // ---------- Render: Day Workspace ----------
  function renderDay() {
    const ds = ymd(state.currentDate);
    $("#dayTitle") && ($("#dayTitle").textContent = `Day Workspace — ${ds}`);
    renderDayJobs(ds);
    renderDayReceipts(ds);
  }

  function renderDayJobs(ds) {
    const list = $("#dayJobsList");
    if (!list) return;

    const jobs = jobsByDate(ds).slice().sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
    const rev = sumRevenue(ds);
    const exp = sumExpenses(ds);
    const net = clampMoney(rev - exp);

    list.innerHTML = `
      <div class="day-totals">
        <div><b>Totals</b></div>
        <div>Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}</div>
      </div>
    `;

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No jobs for this day yet.";
      list.appendChild(empty);
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
            <option value="scheduled" ${job.status===STATUS.scheduled?"selected":""}>Scheduled</option>
            <option value="completed" ${job.status===STATUS.completed?"selected":""}>Completed</option>
            <option value="cancelled" ${job.status===STATUS.cancelled?"selected":""}>Cancelled</option>
          </select>
          <button class="btn" type="button" data-job-edit="${escapeHtml(job.id)}">Edit</button>
          <button class="btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
        </div>
      `;
      list.appendChild(row);
    }

    $$("[data-job-status]", list).forEach(sel => {
      sel.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-job-status");
        const j = state.jobs.find(x => x.id === id);
        if (!j) return;
        const val = e.target.value;
        j.status = STATUS_LABEL[val] ? val : STATUS.scheduled;
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-job-edit]", list).forEach(btn => {
      btn.addEventListener("click", () => openJobModal(btn.getAttribute("data-job-edit")));
    });

    $$("[data-job-del]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter(j => j.id !== id);
        state.receipts = state.receipts.map(r => (r.jobId===id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r));
        persist();
        renderAll();
      });
    });
  }

  function renderDayReceipts(ds) {
    const list = $("#dayReceiptsList");
    if (!list) return;

    const receipts = receiptsByDate(ds).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const total = sumExpenses(ds);

    list.innerHTML = `
      <div class="day-totals">
        <div><b>Receipts</b></div>
        <div>Total Expenses: ${money(total)}</div>
      </div>
    `;

    if (!receipts.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No receipts for this day yet.";
      list.appendChild(empty);
      return;
    }

    for (const r of receipts) {
      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")}</div>
          <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
        </div>
        <div class="receipt-actions">
          <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
          <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
        </div>
      `;
      list.appendChild(row);
    }

    $$("[data-rcpt-edit]", list).forEach(btn => {
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")));
    });

    $$("[data-rcpt-del]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== id);
        persist();
        renderAll();
      });
    });
  }

  // ---------- Modal helpers ----------
  function showOverlay(show) {
    const ov = $("#modalOverlay");
    if (ov) ov.hidden = !show;
  }

  function closeJobModal() {
    showOverlay(false);
    const m = $("#jobModal");
    if (m) { m.hidden = true; m.setAttribute("aria-hidden","true"); }
    state.editingJobId = null;
  }

  function closeReceiptModal() {
    showOverlay(false);
    const m = $("#receiptModal");
    if (m) { m.hidden = true; m.setAttribute("aria-hidden","true"); }
    state.editingReceiptId = null;
  }

  // ---------- Job modal ----------
  function openJobModal(jobId = null) {
    const modal = $("#jobModal");
    if (!modal) return;

    const isEdit = Boolean(jobId);
    state.editingJobId = jobId;

    $("#jobModalTitle") && ($("#jobModalTitle").textContent = isEdit ? "Edit Job" : "Add Job");

    const job = isEdit ? state.jobs.find(j => j.id === jobId) : null;

    $("#jobDate").value = (job?.date || ymd(state.currentDate));
    $("#jobCustomer").value = (job?.customer || "");
    $("#jobPickup").value = (job?.pickup || "");
    $("#jobDropoff").value = (job?.dropoff || "");
    $("#jobAmount").value = String(job?.amount ?? 0);
    $("#jobNotes").value = (job?.notes || "");
    $("#jobStatus").value = (job?.status || STATUS.scheduled);

    const del = $("#jobDelete");
    if (del) del.hidden = !isEdit;

    const err = $("#jobError");
    if (err) { err.hidden = true; err.textContent = ""; }

    showOverlay(true);
    modal.hidden = false;
    modal.setAttribute("aria-hidden","false");
  }

  function saveJobFromModal() {
    const err = $("#jobError");
    const fail = (msg) => { if (err) { err.textContent = msg; err.hidden = false; } };

    const date = ($("#jobDate")?.value || "").trim();
    const customer = ($("#jobCustomer")?.value || "").trim();
    const pickup = ($("#jobPickup")?.value || "").trim();
    const dropoff = ($("#jobDropoff")?.value || "").trim();
    const amount = clampMoney($("#jobAmount")?.value ?? 0);
    const status = ($("#jobStatus")?.value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!customer) return fail("Customer is required.");
    if (amount < 0) return fail("Amount cannot be negative.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingJobId) {
      const j = state.jobs.find(x => x.id === state.editingJobId);
      if (!j) return fail("Could not find that job.");
      j.date = date; j.customer = customer; j.pickup = pickup; j.dropoff = dropoff;
      j.amount = amount; j.status = STATUS_LABEL[status] ? status : STATUS.scheduled;
      j.notes = notes; j.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        id: makeId("job"),
        date, customer, pickup, dropoff, amount,
        status: STATUS_LABEL[status] ? status : STATUS.scheduled,
        notes, createdAt: Date.now(), updatedAt: Date.now(),
      }));
    }

    persist();
    closeJobModal();
    state.currentDate = startOfDay(new Date(date));
    state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    setView("day");
  }

  function deleteJobFromModal() {
    const id = state.editingJobId;
    if (!id) return;
    if (!confirm("Delete this job?")) return;

    state.jobs = state.jobs.filter(j => j.id !== id);
    state.receipts = state.receipts.map(r => (r.jobId===id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r));

    persist();
    closeJobModal();
    renderAll();
  }

  // ---------- Receipt modal ----------
  function openReceiptModal(receiptId = null) {
    const modal = $("#receiptModal");
    if (!modal) return;

    const isEdit = Boolean(receiptId);
    state.editingReceiptId = receiptId;

    $("#receiptModalTitle") && ($("#receiptModalTitle").textContent = isEdit ? "Edit Receipt" : "Add Receipt");

    const rec = isEdit ? state.receipts.find(r => r.id === receiptId) : null;

    $("#receiptDate").value = (rec?.date || ymd(state.currentDate));
    $("#receiptVendor").value = (rec?.vendor || "");
    $("#receiptCategory").value = (rec?.category || "");
    $("#receiptAmount").value = String(rec?.amount ?? 0);
    $("#receiptLinkedJobId").value = (rec?.jobId || "");
    $("#receiptNotes").value = (rec?.notes || "");

    const del = $("#receiptDelete");
    if (del) del.hidden = !isEdit;

    const err = $("#receiptError");
    if (err) { err.hidden = true; err.textContent = ""; }

    showOverlay(true);
    modal.hidden = false;
    modal.setAttribute("aria-hidden","false");
  }

  function saveReceiptFromModal() {
    const err = $("#receiptError");
    const fail = (msg) => { if (err) { err.textContent = msg; err.hidden = false; } };

    const date = ($("#receiptDate")?.value || "").trim();
    const vendor = ($("#receiptVendor")?.value || "").trim();
    const category = ($("#receiptCategory")?.value || "").trim();
    const amount = clampMoney($("#receiptAmount")?.value ?? 0);
    const jobId = ($("#receiptLinkedJobId")?.value || "").trim();
    const notes = ($("#receiptNotes")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Could not find that receipt.");
      r.date = date; r.vendor = vendor; r.category = category; r.amount = amount;
      r.jobId = jobId; r.notes = notes; r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, jobId, notes,
        createdAt: Date.now(), updatedAt: Date.now(),
      }));
    }

    persist();
    closeReceiptModal();
    state.currentDate = startOfDay(new Date(date));
    state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    setView("day");
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

  // ---------- Render all ----------
  function renderAll() {
    const dateStr = ymd(state.currentDate);

    if ($("#contextLine")) {
      $("#contextLine").textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view.charAt(0).toUpperCase() + state.view.slice(1);
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
  }

  // ---------- Bindings ----------
  function bindNav() {
    $$(".nav-item[data-view]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setView(btn.dataset.view);
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

    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    $("#jobCancel")?.addEventListener("click", closeJobModal);
    $("#jobModalClose")?.addEventListener("click", closeJobModal);
    $("#jobSave")?.addEventListener("click", saveJobFromModal);
    $("#jobDelete")?.addEventListener("click", deleteJobFromModal);

    $("#receiptCancel")?.addEventListener("click", closeReceiptModal);
    $("#receiptModalClose")?.addEventListener("click", closeReceiptModal);
    $("#receiptSave")?.addEventListener("click", saveReceiptFromModal);
    $("#receiptDelete")?.addEventListener("click", deleteReceiptFromModal);

    $("#modalOverlay")?.addEventListener("click", () => {
      closeJobModal();
      closeReceiptModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeJobModal();
        closeReceiptModal();
      }
    });
  }

  // ---------- Boot ----------
  function init() {
    try {
      seedIfEmpty();
      state.jobs = state.jobs.map(normalizeJob);
      state.receipts = state.receipts.map(normalizeReceipt);
      persist();

      bindNav();

      setPill(true, "JS: ready ✅");
      setView("dashboard");
    } catch (e) {
      console.error(e);
      setPill(false, "JS: error ❌");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
