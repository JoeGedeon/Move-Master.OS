/* Move-Master.OS / FleetPro — app_v5.js (FULL)
   Includes:
   - Views: dashboard / calendar / day
   - Toolbar Today/Prev/Next
   - Jobs: Add/Edit/Delete + status
   - Receipts: Add/Edit/Delete
   - Day totals: Revenue / Expenses / Net
   - Calendar polish:
     * Compact markers (S/C/X + receipt indicator)
     * Hover/tap tooltip preview on calendar days
     * Consistent month rendering + clean nav
   - Defensive init + overlay safety
*/

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const log = (...a) => console.log("[FleetPro]", ...a);
  const warn = (...a) => console.warn("[FleetPro]", ...a);
  const err = (...a) => console.error("[FleetPro]", ...a);

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

  function safe(fn) {
    try { fn(); } catch (e) { err(e); }
  }

  // ---------------------------
  // Status
  // ---------------------------
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

  // ---------------------------
  // Storage keys
  // ---------------------------
  const LS_KEY_JOBS = "fleetpro_jobs_v1";
  const LS_KEY_RECEIPTS = "fleetpro_receipts_v1";

  function makeId(prefix = "id") {
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      warn("Failed to load", key, e);
      return [];
    }
  }

  function saveArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
      warn("Failed to save", key, e);
    }
  }

  // ---------------------------
  // Normalize models
  // ---------------------------
  function normalizeJob(j) {
    const job = { ...(j || {}) };
    if (!job.id) job.id = makeId("job");
    if (!job.date) job.date = ymd(startOfDay(new Date()));
    if (!job.status || !STATUS_LABEL[job.status]) job.status = STATUS.scheduled;
    job.amount = clampMoney(job.amount ?? 0);
    job.customer = (job.customer || "").trim();
    job.pickup = (job.pickup || "").trim();
    job.dropoff = (job.dropoff || "").trim();
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
    rec.linkedJobId = (rec.linkedJobId || "").trim();
    if (!rec.createdAt) rec.createdAt = Date.now();
    rec.updatedAt = rec.updatedAt || rec.createdAt;
    return rec;
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    activeView: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS_KEY_JOBS).map(normalizeJob),
    receipts: loadArray(LS_KEY_RECEIPTS).map(normalizeReceipt),

    jobModalMode: "add",
    editingJobId: null,

    receiptModalMode: "add",
    editingReceiptId: null,
  };

  function persistAll() {
    saveArray(LS_KEY_JOBS, state.jobs);
    saveArray(LS_KEY_RECEIPTS, state.receipts);
  }

  // ---------------------------
  // Status pill
  // ---------------------------
  function setJsPill(ok, message) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = message || (ok ? "JS: loaded" : "JS: error");
    pill.classList.toggle("ok", !!ok);
    pill.classList.toggle("bad", !ok);
  }

  // ---------------------------
  // Overlay safety
  // ---------------------------
  function forceHideOverlays() {
    const overlay = $("#modalOverlay");
    if (overlay) overlay.hidden = true;

    const jobModal = $("#jobModal");
    if (jobModal) { jobModal.hidden = true; jobModal.setAttribute("aria-hidden", "true"); }

    const receiptModal = $("#receiptModal");
    if (receiptModal) { receiptModal.hidden = true; receiptModal.setAttribute("aria-hidden", "true"); }

    hideCalTip();
  }

  // ---------------------------
  // View switching
  // ---------------------------
  function updateContextLine() {
    const el = $("#contextLine");
    if (!el) return;

    if (state.activeView === "dashboard") el.textContent = "Foundation mode (Smart)";
    else if (state.activeView === "calendar") el.textContent = "Calendar (Polished)";
    else if (state.activeView === "day") el.textContent = `Day Workspace: ${ymd(state.currentDate)}`;
    else el.textContent = "Coming soon";
  }

  function setActiveView(viewName) {
    state.activeView = viewName;

    $$('[id^="view-"]').forEach((p) => p.classList.remove("active"));
    const panel = $(`#view-${viewName}`);
    if (panel) panel.classList.add("active");
    else warn(`Missing view panel: #view-${viewName}`);

    $$("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-view") === viewName);
    });

    updateContextLine();
    renderAll();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function getDayStatusCounts(dateStr) {
    let s = 0, c = 0, x = 0;
    for (const j of state.jobs) {
      if (j.date !== dateStr) continue;
      if (j.status === STATUS.completed) c++;
      else if (j.status === STATUS.cancelled) x++;
      else s++;
    }
    return { s, c, x, total: s + c + x };
  }

  function calculateDayJobTotals(dateStr) {
    const totals = {
      scheduled: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
    };

    for (const j of state.jobs) {
      if (j.date !== dateStr) continue;
      const st = STATUS_LABEL[j.status] ? j.status : STATUS.scheduled;
      totals[st].count += 1;
      if (st !== STATUS.cancelled) totals[st].amount += clampMoney(j.amount);
    }

    totals.scheduled.amount = clampMoney(totals.scheduled.amount);
    totals.completed.amount = clampMoney(totals.completed.amount);
    totals.cancelled.amount = 0;

    return totals;
  }

  function calculateDayReceiptTotals(dateStr) {
    let count = 0;
    let amount = 0;
    for (const r of state.receipts) {
      if (r.date !== dateStr) continue;
      count += 1;
      amount += clampMoney(r.amount);
    }
    return { count, amount: clampMoney(amount) };
  }

  function monthStatusCounts(year, monthIndex) {
    let s = 0, c = 0, x = 0;
    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      if (j.status === STATUS.completed) c++;
      else if (j.status === STATUS.cancelled) x++;
      else s++;
    }
    return { s, c, x, total: s + c + x };
  }

  function sumRevenueForMonth(year, monthIndex) {
    let total = 0;
    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumExpensesForMonth(year, monthIndex) {
    let total = 0;
    for (const r of state.receipts) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      total += clampMoney(r.amount);
    }
    return clampMoney(total);
  }

  // ---------------------------
  // Calendar tooltip (polish)
  // ---------------------------
  function ensureCalTip() {
    let tip = $("#calTip");
    if (tip) return tip;

    tip = document.createElement("div");
    tip.id = "calTip";
    tip.className = "cal-tip";
    tip.hidden = true;
    tip.innerHTML = `<div class="cal-tip-inner"></div>`;
    document.body.appendChild(tip);
    return tip;
  }

  function showCalTip(anchorEl, dateStr) {
    const tip = ensureCalTip();
    const inner = $(".cal-tip-inner", tip);
    if (!inner) return;

    const counts = getDayStatusCounts(dateStr);
    const jt = calculateDayJobTotals(dateStr);
    const rt = calculateDayReceiptTotals(dateStr);
    const rev = jt.scheduled.amount + jt.completed.amount;
    const net = clampMoney(rev - rt.amount);

    inner.innerHTML = `
      <div class="cal-tip-title">${dateStr}</div>
      <div class="cal-tip-row">Jobs: S ${counts.s} · C ${counts.c} · X ${counts.x}</div>
      <div class="cal-tip-row">Revenue: $${rev.toFixed(2)}</div>
      <div class="cal-tip-row">Expenses: $${rt.amount.toFixed(2)} (${rt.count})</div>
      <div class="cal-tip-row"><strong>Net:</strong> $${net.toFixed(2)}</div>
    `;

    const rect = anchorEl.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 260, Math.max(12, rect.left));
    const y = Math.min(window.innerHeight - 140, rect.bottom + 10);

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.hidden = false;
  }

  function hideCalTip() {
    const tip = $("#calTip");
    if (tip) tip.hidden = true;
  }

  // Hide tooltip when scrolling or clicking elsewhere
  function bindCalTipAutoHide() {
    document.addEventListener("scroll", hideCalTip, true);
    document.addEventListener("click", (e) => {
      const tip = $("#calTip");
      if (!tip) return;
      if (tip.contains(e.target)) return;
      // If clicking inside a calendar day, keep it (calendar click will navigate anyway)
      hideCalTip();
    });
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderDashboard() {
    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `${ymd(state.currentDate)} · ${state.currentDate.toDateString()}`;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();

    const counts = monthStatusCounts(y, m);
    const revenue = sumRevenueForMonth(y, m);
    const expenses = sumExpensesForMonth(y, m);
    const net = clampMoney(revenue - expenses);

    const snapshot = $("#monthSnapshot");
    if (snapshot) {
      snapshot.textContent =
        `Month: S ${counts.s} · C ${counts.c} · X ${counts.x} · ` +
        `Revenue $${revenue.toFixed(2)} · Expenses $${expenses.toFixed(2)} · Net $${net.toFixed(2)}`;
    }

    const todayStats = $("#todayStats");
    if (todayStats) {
      const ds = getDayStatusCounts(ymd(state.currentDate));
      const jt = calculateDayJobTotals(ymd(state.currentDate));
      const rt = calculateDayReceiptTotals(ymd(state.currentDate));
      const rev = jt.scheduled.amount + jt.completed.amount;
      const netDay = clampMoney(rev - rt.amount);
      todayStats.textContent =
        `Today: S ${ds.s} · C ${ds.c} · X ${ds.x} · ` +
        `Rev $${rev.toFixed(2)} · Exp $${rt.amount.toFixed(2)} · Net $${netDay.toFixed(2)}`;
    }

    renderDashboardQuickCalendar();
  }

  function renderDashboardQuickCalendar() {
    const container = $("#dashboardCalendar");
    if (!container) return;

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

      const counts = getDayStatusCounts(dateStr);
      const rTot = calculateDayReceiptTotals(dateStr);
      if (counts.total > 0) btn.classList.add("has-jobs");
      if (rTot.count > 0) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setActiveView("day");
      });

      container.appendChild(btn);
    }
  }

  // Polished month calendar
  function renderFullMonthCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) return;

    const label = $("#monthLabel");
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    if (label) label.textContent = `${monthName(m)} ${y}`;

    grid.innerHTML = "";

    // weekday headers
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
    const today = startOfDay(new Date());

    // Leading pads
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
      cell.dataset.date = dateStr;

      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(day);

      // Marker bar (polished)
      const bar = document.createElement("div");
      bar.className = "markerbar";

      const counts = getDayStatusCounts(dateStr);
      if (counts.total > 0) {
        const txt = [];
        if (counts.s) txt.push(`${counts.s}S`);
        if (counts.c) txt.push(`${counts.c}C`);
        if (counts.x) txt.push(`${counts.x}X`);

        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = txt.join(" · ");
        bar.appendChild(chip);

        if (counts.s) cell.classList.add("has-scheduled");
        if (counts.c) cell.classList.add("has-completed");
        if (counts.x) cell.classList.add("has-cancelled");
        cell.classList.add("has-jobs");
      }

      const rt = calculateDayReceiptTotals(dateStr);
      if (rt.count > 0) {
        const rc = document.createElement("span");
        rc.className = "chip chip-receipts";
        rc.textContent = `🧾 $${rt.amount.toFixed(0)}`;
        bar.appendChild(rc);
        cell.classList.add("has-receipts");
      }

      cell.appendChild(num);
      cell.appendChild(bar);

      // hover / long press tooltip
      cell.addEventListener("mouseenter", () => showCalTip(cell, dateStr));
      cell.addEventListener("mouseleave", hideCalTip);

      // tap on mobile
      cell.addEventListener("touchstart", () => showCalTip(cell, dateStr), { passive: true });

      // click to open day workspace
      cell.addEventListener("click", () => {
        hideCalTip();
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setActiveView("day");
      });

      grid.appendChild(cell);
    }
  }

  function renderDayWorkspace() {
    const dateStr = ymd(state.currentDate);

    const dayTitle = $("#dayTitle");
    if (dayTitle) dayTitle.textContent = `Day Workspace: ${dateStr}`;

    // Jobs list
    const jobsList = $("#dayJobsList");
    if (jobsList) {
      const jobs = state.jobs
        .filter((j) => j.date === dateStr)
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      jobsList.innerHTML = "";

      const jt = calculateDayJobTotals(dateStr);
      const rt = calculateDayReceiptTotals(dateStr);
      const revenue = jt.scheduled.amount + jt.completed.amount;
      const net = clampMoney(revenue - rt.amount);

      const totalsBar = document.createElement("div");
      totalsBar.className = "day-totals";
      totalsBar.innerHTML = `
        <div><strong>Totals</strong></div>
        <div>Scheduled: ${jt.scheduled.count} · $${jt.scheduled.amount.toFixed(2)}</div>
        <div>Completed: ${jt.completed.count} · $${jt.completed.amount.toFixed(2)}</div>
        <div>Cancelled: ${jt.cancelled.count}</div>
        <div><strong>Revenue:</strong> $${revenue.toFixed(2)} · <strong>Expenses:</strong> $${rt.amount.toFixed(2)} · <strong>Net:</strong> $${net.toFixed(2)}</div>
      `;
      jobsList.appendChild(totalsBar);

      if (!jobs.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "No jobs for this day yet.";
        jobsList.appendChild(empty);
      } else {
        for (const j of jobs) {
          const row = document.createElement("div");
          row.className = "job-row";
          if (j.status === STATUS.cancelled) row.classList.add("is-cancelled");
          if (j.status === STATUS.completed) row.classList.add("is-completed");

          const left = document.createElement("div");
          left.className = "job-main";

          const title = document.createElement("div");
          title.className = "job-title";
          title.textContent = j.customer || "Customer";

          const sub = document.createElement("div");
          sub.className = "job-sub";
          sub.textContent = `${j.pickup || "Pickup"} → ${j.dropoff || "Dropoff"} · $${clampMoney(j.amount).toFixed(2)}`;

          left.appendChild(title);
          left.appendChild(sub);

          const right = document.createElement("div");
          right.className = "job-actions";

          const sel = document.createElement("select");
          sel.className = "job-status";
          sel.innerHTML = `
            <option value="${STATUS.scheduled}">${STATUS_LABEL.scheduled}</option>
            <option value="${STATUS.completed}">${STATUS_LABEL.completed}</option>
            <option value="${STATUS.cancelled}">${STATUS_LABEL.cancelled}</option>
          `;
          sel.value = STATUS_LABEL[j.status] ? j.status : STATUS.scheduled;
          sel.addEventListener("change", () => updateJobStatus(j.id, sel.value));

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => openJobModalEdit(j.id));

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn danger";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            if (confirm("Delete this job?")) deleteJob(j.id);
          });

          right.appendChild(sel);
          right.appendChild(editBtn);
          right.appendChild(delBtn);

          row.appendChild(left);
          row.appendChild(right);

          jobsList.appendChild(row);
        }
      }
    }

    // Receipts list
    const recList = $("#dayReceiptsList");
    if (recList) {
      const receipts = state.receipts
        .filter((r) => r.date === dateStr)
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      recList.innerHTML = "";

      const rt = calculateDayReceiptTotals(dateStr);

      const header = document.createElement("div");
      header.className = "receipts-header";
      header.innerHTML = `<strong>Receipts</strong> · ${rt.count} · $${rt.amount.toFixed(2)}`;
      recList.appendChild(header);

      if (!receipts.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "No receipts for this day yet.";
        recList.appendChild(empty);
      } else {
        for (const r of receipts) {
          const row = document.createElement("div");
          row.className = "receipt-row";

          const left = document.createElement("div");
          left.className = "receipt-main";
          left.innerHTML = `
            <div class="receipt-title">${r.vendor || "Vendor"} · ${r.category || "Category"}</div>
            <div class="receipt-sub">$${clampMoney(r.amount).toFixed(2)} · ${r.notes || ""}</div>
          `;

          const right = document.createElement("div");
          right.className = "receipt-actions";

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => openReceiptModalEdit(r.id));

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn danger";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            if (confirm("Delete this receipt?")) deleteReceipt(r.id);
          });

          right.appendChild(editBtn);
          right.appendChild(delBtn);

          row.appendChild(left);
          row.appendChild(right);

          recList.appendChild(row);
        }
      }
    }
  }

  function renderAll() {
    updateContextLine();
    if (state.activeView === "dashboard") renderDashboard();
    if (state.activeView === "calendar") renderFullMonthCalendar();
    if (state.activeView === "day") renderDayWorkspace();
  }

  // ---------------------------
  // Jobs CRUD
  // ---------------------------
  function updateJobStatus(jobId, newStatus) {
    if (!STATUS_LABEL[newStatus]) newStatus = STATUS.scheduled;
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    state.jobs[idx].status = newStatus;
    state.jobs[idx].updatedAt = Date.now();
    persistAll();
    renderAll();
  }

  function deleteJob(jobId) {
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    state.jobs.splice(idx, 1);
    persistAll();
    renderAll();
  }

  function upsertJob(job) {
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    if (idx === -1) state.jobs.push(job);
    else state.jobs[idx] = job;
    persistAll();
  }

  // ---------------------------
  // Receipts CRUD
  // ---------------------------
  function deleteReceipt(receiptId) {
    const idx = state.receipts.findIndex((r) => r.id === receiptId);
    if (idx === -1) return;
    state.receipts.splice(idx, 1);
    persistAll();
    renderAll();
  }

  function upsertReceipt(rec) {
    const idx = state.receipts.findIndex((r) => r.id === rec.id);
    if (idx === -1) state.receipts.push(rec);
    else state.receipts[idx] = rec;
    persistAll();
  }

  // ---------------------------
  // Job Modal
  // ---------------------------
  function jobModalEls() {
    return {
      modal: $("#jobModal"),
      overlay: $("#modalOverlay"),
      title: $("#jobModalTitle"),
      error: $("#jobError"),
      btnSave: $("#jobSave"),
      btnCancel: $("#jobCancel"),
      btnClose: $("#jobModalClose"),
      btnDelete: $("#jobDelete"),

      fDate: $("#jobDate"),
      fCustomer: $("#jobCustomer"),
      fPickup: $("#jobPickup"),
      fDropoff: $("#jobDropoff"),
      fAmount: $("#jobAmount"),
      fNotes: $("#jobNotes"),
      fStatus: $("#jobStatus"),
    };
  }

  function openJobModalAdd() {
    const el = jobModalEls();
    if (!el.modal || !el.overlay) return;

    state.jobModalMode = "add";
    state.editingJobId = null;

    if (el.title) el.title.textContent = "Add Job";
    if (el.error) { el.error.hidden = true; el.error.textContent = ""; }
    if (el.btnDelete) el.btnDelete.hidden = true;

    if (el.fDate) el.fDate.value = ymd(state.currentDate);
    if (el.fCustomer) el.fCustomer.value = "";
    if (el.fPickup) el.fPickup.value = "";
    if (el.fDropoff) el.fDropoff.value = "";
    if (el.fAmount) el.fAmount.value = "0";
    if (el.fNotes) el.fNotes.value = "";
    if (el.fStatus) el.fStatus.value = STATUS.scheduled;

    el.overlay.hidden = false;
    el.modal.hidden = false;
    el.modal.setAttribute("aria-hidden", "false");
  }

  function openJobModalEdit(jobId) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return;

    const el = jobModalEls();
    if (!el.modal || !el.overlay) return;

    state.jobModalMode = "edit";
    state.editingJobId = jobId;

    if (el.title) el.title.textContent = "Edit Job";
    if (el.error) { el.error.hidden = true; el.error.textContent = ""; }
    if (el.btnDelete) el.btnDelete.hidden = false;

    if (el.fDate) el.fDate.value = job.date || ymd(state.currentDate);
    if (el.fCustomer) el.fCustomer.value = job.customer || "";
    if (el.fPickup) el.fPickup.value = job.pickup || "";
    if (el.fDropoff) el.fDropoff.value = job.dropoff || "";
    if (el.fAmount) el.fAmount.value = String(clampMoney(job.amount ?? 0));
    if (el.fNotes) el.fNotes.value = job.notes || "";
    if (el.fStatus) el.fStatus.value = job.status || STATUS.scheduled;

    el.overlay.hidden = false;
    el.modal.hidden = false;
    el.modal.setAttribute("aria-hidden", "false");
  }

  function closeJobModal() {
    const el = jobModalEls();
    if (el.overlay) el.overlay.hidden = true;
    if (el.modal) { el.modal.hidden = true; el.modal.setAttribute("aria-hidden", "true"); }
    state.jobModalMode = "add";
    state.editingJobId = null;
  }

  function showJobModalError(msg) {
    const el = jobModalEls();
    if (!el.error) return;
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function readJobFromModal() {
    const el = jobModalEls();
    return {
      date: el.fDate?.value || ymd(state.currentDate),
      customer: el.fCustomer?.value?.trim() || "",
      pickup: el.fPickup?.value?.trim() || "",
      dropoff: el.fDropoff?.value?.trim() || "",
      amount: clampMoney(el.fAmount?.value ?? 0),
      notes: el.fNotes?.value?.trim() || "",
      status: STATUS_LABEL[el.fStatus?.value] ? el.fStatus.value : STATUS.scheduled,
    };
  }

  function onJobModalSave() {
    const data = readJobFromModal();
    if (!data.date) return showJobModalError("Date is required.");

    if (state.jobModalMode === "edit" && state.editingJobId) {
      const existing = state.jobs.find((j) => j.id === state.editingJobId);
      if (!existing) return showJobModalError("Job not found.");

      const updated = normalizeJob({ ...existing, ...data, updatedAt: Date.now() });
      upsertJob(updated);

      const d = new Date(updated.date);
      state.currentDate = startOfDay(d);
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

      closeJobModal();
      renderAll();
      return;
    }

    const created = normalizeJob({ id: makeId("job"), ...data, createdAt: Date.now(), updatedAt: Date.now() });
    upsertJob(created);

    const d = new Date(created.date);
    state.currentDate = startOfDay(d);
    state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

    closeJobModal();
    renderAll();
  }

  function onJobModalDelete() {
    if (!(state.jobModalMode === "edit" && state.editingJobId)) return;
    if (!confirm("Delete this job?")) return;
    deleteJob(state.editingJobId);
    closeJobModal();
  }

  function bindJobModalButtons() {
    $("#btnAddJob")?.addEventListener("click", () => safe(openJobModalAdd));

    const el = jobModalEls();
    el.btnSave?.addEventListener("click", () => safe(onJobModalSave));
    el.btnCancel?.addEventListener("click", () => safe(closeJobModal));
    el.btnClose?.addEventListener("click", () => safe(closeJobModal));
    el.overlay?.addEventListener("click", () => {
      if (!el.modal?.hidden) safe(closeJobModal);
    });
    el.btnDelete?.addEventListener("click", () => safe(onJobModalDelete));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") safe(closeJobModal);
    });
  }

  // ---------------------------
  // Receipt Modal
  // ---------------------------
  function receiptModalEls() {
    return {
      modal: $("#receiptModal"),
      overlay: $("#modalOverlay"),
      title: $("#receiptModalTitle"),
      error: $("#receiptError"),
      btnSave: $("#receiptSave"),
      btnCancel: $("#receiptCancel"),
      btnClose: $("#receiptModalClose"),
      btnDelete: $("#receiptDelete"),

      fDate: $("#receiptDate"),
      fVendor: $("#receiptVendor"),
      fCategory: $("#receiptCategory"),
      fAmount: $("#receiptAmount"),
      fNotes: $("#receiptNotes"),
      fLinkedJobId: $("#receiptLinkedJobId"),
    };
  }

  function openReceiptModalAdd() {
    const el = receiptModalEls();
    if (!el.modal || !el.overlay) return;

    state.receiptModalMode = "add";
    state.editingReceiptId = null;

    if (el.title) el.title.textContent = "Add Receipt";
    if (el.error) { el.error.hidden = true; el.error.textContent = ""; }
    if (el.btnDelete) el.btnDelete.hidden = true;

    if (el.fDate) el.fDate.value = ymd(state.currentDate);
    if (el.fVendor) el.fVendor.value = "";
    if (el.fCategory) el.fCategory.value = "";
    if (el.fAmount) el.fAmount.value = "0";
    if (el.fNotes) el.fNotes.value = "";
    if (el.fLinkedJobId) el.fLinkedJobId.value = "";

    el.overlay.hidden = false;
    el.modal.hidden = false;
    el.modal.setAttribute("aria-hidden", "false");
  }

  function openReceiptModalEdit(receiptId) {
    const rec = state.receipts.find((r) => r.id === receiptId);
    if (!rec) return;

    const el = receiptModalEls();
    if (!el.modal || !el.overlay) return;

    state.receiptModalMode = "edit";
    state.editingReceiptId = receiptId;

    if (el.title) el.title.textContent = "Edit Receipt";
    if (el.error) { el.error.hidden = true; el.error.textContent = ""; }
    if (el.btnDelete) el.btnDelete.hidden = false;

    if (el.fDate) el.fDate.value = rec.date || ymd(state.currentDate);
    if (el.fVendor) el.fVendor.value = rec.vendor || "";
    if (el.fCategory) el.fCategory.value = rec.category || "";
    if (el.fAmount) el.fAmount.value = String(clampMoney(rec.amount ?? 0));
    if (el.fNotes) el.fNotes.value = rec.notes || "";
    if (el.fLinkedJobId) el.fLinkedJobId.value = rec.linkedJobId || "";

    el.overlay.hidden = false;
    el.modal.hidden = false;
    el.modal.setAttribute("aria-hidden", "false");
  }

  function closeReceiptModal() {
    const el = receiptModalEls();
    if (el.overlay) el.overlay.hidden = true;
    if (el.modal) { el.modal.hidden = true; el.modal.setAttribute("aria-hidden", "true"); }
    state.receiptModalMode = "add";
    state.editingReceiptId = null;
  }

  function showReceiptModalError(msg) {
    const el = receiptModalEls();
    if (!el.error) return;
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function readReceiptFromModal() {
    const el = receiptModalEls();
    return {
      date: el.fDate?.value || ymd(state.currentDate),
      vendor: el.fVendor?.value?.trim() || "",
      category: el.fCategory?.value?.trim() || "",
      amount: clampMoney(el.fAmount?.value ?? 0),
      notes: el.fNotes?.value?.trim() || "",
      linkedJobId: el.fLinkedJobId?.value?.trim() || "",
    };
  }

  function onReceiptModalSave() {
    const data = readReceiptFromModal();
    if (!data.date) return showReceiptModalError("Date is required.");
    if (!data.vendor) return showReceiptModalError("Vendor is required.");
    if (data.amount <= 0) return showReceiptModalError("Amount must be > 0.");

    if (state.receiptModalMode === "edit" && state.editingReceiptId) {
      const existing = state.receipts.find((r) => r.id === state.editingReceiptId);
      if (!existing) return showReceiptModalError("Receipt not found.");

      const updated = normalizeReceipt({ ...existing, ...data, updatedAt: Date.now() });
      upsertReceipt(updated);

      const d = new Date(updated.date);
      state.currentDate = startOfDay(d);
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

      closeReceiptModal();
      renderAll();
      return;
    }

    const created = normalizeReceipt({ id: makeId("rcpt"), ...data, createdAt: Date.now(), updatedAt: Date.now() });
    upsertReceipt(created);

    const d = new Date(created.date);
    state.currentDate = startOfDay(d);
    state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

    closeReceiptModal();
    renderAll();
  }

  function onReceiptModalDelete() {
    if (!(state.receiptModalMode === "edit" && state.editingReceiptId)) return;
    if (!confirm("Delete this receipt?")) return;
    deleteReceipt(state.editingReceiptId);
    closeReceiptModal();
  }

  function bindReceiptModalButtons() {
    $("#btnAddReceipt")?.addEventListener("click", () => safe(openReceiptModalAdd));

    const el = receiptModalEls();
    el.btnSave?.addEventListener("click", () => safe(onReceiptModalSave));
    el.btnCancel?.addEventListener("click", () => safe(closeReceiptModal));
    el.btnClose?.addEventListener("click", () => safe(closeReceiptModal));
    el.overlay?.addEventListener("click", () => {
      if (!el.modal?.hidden) safe(closeReceiptModal);
    });
    el.btnDelete?.addEventListener("click", () => safe(onReceiptModalDelete));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") safe(closeReceiptModal);
    });
  }

  // ---------------------------
  // Navigation bindings
  // ---------------------------
  function bindSidebarNav() {
    $$("[data-view]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const v = el.getAttribute("data-view");
        if (v) setActiveView(v);
      });
    });
  }

  function bindToolbarDateNav() {
    $("#btnToday")?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      hideCalTip();
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() - 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      hideCalTip();
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() + 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      hideCalTip();
      renderAll();
    });
  }

  function bindCalendarMonthNav() {
    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      hideCalTip();
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      hideCalTip();
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      hideCalTip();
      renderAll();
    });
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    forceHideOverlays();

    // normalize once and persist
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    persistAll();

    bindSidebarNav();
    bindToolbarDateNav();
    bindCalendarMonthNav();
    bindJobModalButtons();
    bindReceiptModalButtons();
    bindCalTipAutoHide();

    setActiveView("dashboard");

    setJsPill(true, "JS: loaded");
    log("Init OK");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
