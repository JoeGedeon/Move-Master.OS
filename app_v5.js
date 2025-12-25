/* FleetPro / Move-Master.OS — app_v5.js (FULL, EDIT JOBS)
   Includes:
   - Views: dashboard / calendar / day
   - Toolbar Today/Prev/Next
   - Jobs CRUD (Add + Edit + Delete)
   - Job status: scheduled/completed/cancelled
   - Calendar markers per day: "2S · 1C · 1X"
   - Day Workspace list + inline status dropdown + totals by status
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
  // Storage
  // ---------------------------
  const LS_KEY_JOBS = "fleetpro_jobs_v1";

  function makeId() {
    try { return crypto.randomUUID(); }
    catch { return `job_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  function normalizeJob(j) {
    const job = { ...(j || {}) };
    if (!job.id) job.id = makeId();
    if (!job.date) job.date = ymd(startOfDay(new Date()));
    if (!job.status || !STATUS_LABEL[job.status]) job.status = STATUS.scheduled;
    job.amount = clampMoney(job.amount ?? 0);
    if (!job.createdAt) job.createdAt = Date.now();
    job.updatedAt = job.updatedAt || job.createdAt;
    return job;
  }

  function loadJobs() {
    try {
      const raw = localStorage.getItem(LS_KEY_JOBS);
      const jobs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(jobs)) return [];
      return jobs.map(normalizeJob);
    } catch (e) {
      warn("Failed to load jobs:", e);
      return [];
    }
  }

  function saveJobs() {
    try {
      localStorage.setItem(LS_KEY_JOBS, JSON.stringify(state.jobs));
    } catch (e) {
      warn("Failed to save jobs:", e);
    }
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    activeView: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    jobs: loadJobs(),
    // modal state
    jobModalMode: "add",     // "add" | "edit"
    editingJobId: null,
  };

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
    const modal = $("#jobModal");
    if (overlay) overlay.hidden = true;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  // ---------------------------
  // View switching
  // ---------------------------
  function updateContextLine() {
    const el = $("#contextLine");
    if (!el) return;

    if (state.activeView === "dashboard") el.textContent = "Foundation mode (Smart)";
    else if (state.activeView === "calendar") el.textContent = "Calendar navigation (Month)";
    else if (state.activeView === "day") el.textContent = `Day Workspace: ${ymd(state.currentDate)}`;
    else el.textContent = "Coming soon";
  }

  function setActiveView(viewName) {
    state.activeView = viewName;

    // Hide panels (any element with id starting view-)
    $$('[id^="view-"]').forEach((p) => p.classList.remove("active"));

    const panel = $(`#view-${viewName}`);
    if (panel) panel.classList.add("active");
    else warn(`Missing view panel: #view-${viewName}`);

    // Highlight sidebar items if present
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

  function calculateDayTotals(dateStr) {
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

    const snapshot = $("#monthSnapshot");
    if (snapshot) snapshot.textContent = `Month: S ${counts.s} · C ${counts.c} · X ${counts.x} · Revenue $${revenue.toFixed(2)}`;

    const todayStats = $("#todayStats");
    if (todayStats) {
      const ds = getDayStatusCounts(ymd(state.currentDate));
      const totals = calculateDayTotals(ymd(state.currentDate));
      const rev = totals.scheduled.amount + totals.completed.amount;
      todayStats.textContent = `Today: S ${ds.s} · C ${ds.c} · X ${ds.x} · $${rev.toFixed(2)}`;
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
      if (counts.total > 0) btn.classList.add("has-jobs");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setActiveView("day");
      });

      container.appendChild(btn);
    }
  }

  function renderFullMonthCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) return;

    const label = $("#monthLabel");
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    if (label) label.textContent = `${monthName(m)} ${y}`;

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

      const markers = document.createElement("div");
      markers.className = "markers";

      const counts = getDayStatusCounts(dateStr);
      if (counts.total > 0) {
        const parts = [];
        if (counts.s) { parts.push(`${counts.s}S`); cell.classList.add("has-scheduled"); }
        if (counts.c) { parts.push(`${counts.c}C`); cell.classList.add("has-completed"); }
        if (counts.x) { parts.push(`${counts.x}X`); cell.classList.add("has-cancelled"); }
        markers.textContent = parts.join(" · ");
        cell.classList.add("has-jobs");
      }

      cell.appendChild(num);
      cell.appendChild(markers);

      cell.addEventListener("click", () => {
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

    const list = $("#dayJobsList");
    if (!list) return;

    const jobs = state.jobs
      .filter((j) => j.date === dateStr)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    list.innerHTML = "";

    // Totals bar
    const totals = calculateDayTotals(dateStr);
    const revenue = totals.scheduled.amount + totals.completed.amount;

    const totalsBar = document.createElement("div");
    totalsBar.className = "day-totals";
    totalsBar.innerHTML = `
      <div><strong>Totals</strong></div>
      <div>Scheduled: ${totals.scheduled.count} · $${totals.scheduled.amount.toFixed(2)}</div>
      <div>Completed: ${totals.completed.count} · $${totals.completed.amount.toFixed(2)}</div>
      <div>Cancelled: ${totals.cancelled.count}</div>
      <div><strong>Revenue:</strong> $${revenue.toFixed(2)} (cancelled excluded)</div>
    `;
    list.appendChild(totalsBar);

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No jobs for this day yet.";
      list.appendChild(empty);
      return;
    }

    for (const j of jobs) {
      const row = document.createElement("div");
      row.className = "job-row";
      row.dataset.jobId = j.id;

      // visual flags (CSS optional)
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

      // Inline status dropdown
      const sel = document.createElement("select");
      sel.className = "job-status";
      sel.innerHTML = `
        <option value="${STATUS.scheduled}">${STATUS_LABEL.scheduled}</option>
        <option value="${STATUS.completed}">${STATUS_LABEL.completed}</option>
        <option value="${STATUS.cancelled}">${STATUS_LABEL.cancelled}</option>
      `;
      sel.value = STATUS_LABEL[j.status] ? j.status : STATUS.scheduled;
      sel.addEventListener("change", () => {
        updateJobStatus(j.id, sel.value);
      });

      // Edit button
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "job-edit";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openJobModalEdit(j.id));

      // Delete button (quick)
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "job-delete";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        if (confirm("Delete this job?")) deleteJob(j.id);
      });

      right.appendChild(sel);
      right.appendChild(editBtn);
      right.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(right);

      list.appendChild(row);
    }
  }

  function renderAll() {
    updateContextLine();

    // keep these safe
    if (state.activeView === "dashboard") renderDashboard();
    if (state.activeView === "calendar") renderFullMonthCalendar();
    if (state.activeView === "day") renderDayWorkspace();
  }

  // ---------------------------
  // Job operations
  // ---------------------------
  function updateJobStatus(jobId, newStatus) {
    if (!STATUS_LABEL[newStatus]) newStatus = STATUS.scheduled;
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    state.jobs[idx].status = newStatus;
    state.jobs[idx].updatedAt = Date.now();
    saveJobs();
    renderAll();
  }

  function deleteJob(jobId) {
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;
    state.jobs.splice(idx, 1);
    saveJobs();
    renderAll();
  }

  function upsertJob(job) {
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    if (idx === -1) state.jobs.push(job);
    else state.jobs[idx] = job;
    saveJobs();
  }

  // ---------------------------
  // Job Modal (Add + Edit)
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
    el.fCustomer?.focus?.();
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
    el.fCustomer?.focus?.();
  }

  function closeJobModal() {
    const el = jobModalEls();
    if (el.overlay) el.overlay.hidden = true;
    if (el.modal) {
      el.modal.hidden = true;
      el.modal.setAttribute("aria-hidden", "true");
    }
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

    const date = el.fDate?.value || ymd(state.currentDate);
    const customer = el.fCustomer?.value?.trim() || "";
    const pickup = el.fPickup?.value?.trim() || "";
    const dropoff = el.fDropoff?.value?.trim() || "";
    const amount = clampMoney(el.fAmount?.value ?? 0);
    const notes = el.fNotes?.value?.trim() || "";
    const status = STATUS_LABEL[el.fStatus?.value] ? el.fStatus.value : STATUS.scheduled;

    return { date, customer, pickup, dropoff, amount, notes, status };
  }

  function validateJobData(data) {
    if (!data.date) return "Date is required.";
    // optional: enforce customer
    // if (!data.customer) return "Customer is required.";
    return "";
  }

  function onJobModalSave() {
    const data = readJobFromModal();
    const v = validateJobData(data);
    if (v) return showJobModalError(v);

    if (state.jobModalMode === "edit" && state.editingJobId) {
      const existing = state.jobs.find((j) => j.id === state.editingJobId);
      if (!existing) return showJobModalError("Job not found.");

      const updated = normalizeJob({
        ...existing,
        ...data,
        updatedAt: Date.now(),
      });

      upsertJob(updated);

      // update cursors to edited job date
      const d = new Date(updated.date);
      state.currentDate = startOfDay(d);
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

      closeJobModal();
      renderAll();
      return;
    }

    // add mode
    const created = normalizeJob({
      id: makeId(),
      ...data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

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
    // Add Job button
    const btnAddJob = $("#btnAddJob");
    btnAddJob?.addEventListener("click", () => safe(openJobModalAdd));

    // modal buttons
    const el = jobModalEls();
    el.btnSave?.addEventListener("click", () => safe(onJobModalSave));
    el.btnCancel?.addEventListener("click", () => safe(closeJobModal));
    el.btnClose?.addEventListener("click", () => safe(closeJobModal));
    el.overlay?.addEventListener("click", () => safe(closeJobModal));
    el.btnDelete?.addEventListener("click", () => safe(onJobModalDelete));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") safe(closeJobModal);
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
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    btnToday?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      renderAll();
    });

    btnPrev?.addEventListener("click", () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() - 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    btnNext?.addEventListener("click", () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() + 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });
  }

  function bindCalendarMonthNav() {
    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderAll();
    });
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    forceHideOverlays();

    // normalize saved jobs once
    state.jobs = (state.jobs || []).map(normalizeJob);
    saveJobs();

    bindSidebarNav();
    bindToolbarDateNav();
    bindCalendarMonthNav();
    bindJobModalButtons();

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
