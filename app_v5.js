/* FleetPro / Move-Master.OS — app_v5.js (FULL)
   Stable foundation + smarter logic:
   - Views: dashboard / calendar / day (+ placeholders)
   - Toolbar date nav: Today / Prev / Next
   - Job status: scheduled/completed/cancelled
   - Calendar markers per day: "2S · 1C · 1X"
   - Day Workspace: list jobs + inline status change + delete
   - Day totals by status + revenue (cancelled excluded)
   - Dashboard quick calendar + wiring to open calendar/day
   - Dashboard buttons: Open Calendar / Open Today (supports common IDs + data-action)
   - Defensive: missing elements won’t crash the app
*/

(() => {
  "use strict";

  // =========================
  // Helpers
  // =========================
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

  function safeOnClick(el, fn) {
    if (!el) return;
    el.addEventListener("click", (e) => {
      try { fn(e); } catch (e2) { err(e2); }
    });
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // =========================
  // Constants / Status
  // =========================
  const STATUS = {
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
  };

  const STATUS_LABEL = {
    [STATUS.scheduled]: "Scheduled",
    [STATUS.completed]: "Completed",
    [STATUS.cancelled]: "Cancelled",
  };

  // =========================
  // Storage
  // =========================
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

  // =========================
  // State
  // =========================
  const state = {
    activeView: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    jobs: loadJobs(),
  };

  // =========================
  // Status pill (optional)
  // =========================
  function setJsPill(ok, message) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = message || (ok ? "JS: loaded" : "JS: error");
    pill.classList.toggle("ok", !!ok);
    pill.classList.toggle("bad", !ok);
  }

  // =========================
  // View switching
  // =========================
  function setActiveView(viewName) {
    state.activeView = viewName;

    $$(".view").forEach((v) => v.classList.remove("active"));
    const panel = $(`#view-${viewName}`);
    if (panel) panel.classList.add("active");
    else warn(`Missing view container: #view-${viewName}`);

    // highlight sidebar buttons if present
    $$("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-view") === viewName);
    });

    updateContextLine();
    renderAll();
  }

  function updateContextLine() {
    const el = $("#contextLine");
    if (!el) return;

    if (state.activeView === "dashboard") el.textContent = "Foundation mode (Smart)";
    else if (state.activeView === "calendar") el.textContent = "Calendar navigation (Month)";
    else if (state.activeView === "day") el.textContent = `Day Workspace: ${ymd(state.currentDate)}`;
    else el.textContent = "Coming soon";
  }

  function bindSidebarNav() {
    const items = $$("[data-view]");
    items.forEach((el) => {
      safeOnClick(el, (e) => {
        e.preventDefault();
        const v = el.getAttribute("data-view");
        if (v) setActiveView(v);
      });
    });
  }

  // =========================
  // Aggregations (status + totals)
  // =========================
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

  // =========================
  // Toolbar date navigation
  // =========================
  function bindToolbarDateNav() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    safeOnClick(btnToday, () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      updateContextLine();
      renderAll();
    });

    safeOnClick(btnPrev, () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() - 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      updateContextLine();
      renderAll();
    });

    safeOnClick(btnNext, () => {
      if (state.activeView === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        const d = new Date(state.currentDate);
        d.setDate(d.getDate() + 1);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      updateContextLine();
      renderAll();
    });
  }

  // Calendar view month nav (optional)
  function bindCalendarMonthNav() {
    safeOnClick($("#calPrev"), () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderFullMonthCalendar();
    });
    safeOnClick($("#calToday"), () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderFullMonthCalendar();
    });
    safeOnClick($("#calNext"), () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderFullMonthCalendar();
    });
  }

  // =========================
  // Dashboard rendering + wiring
  // =========================
  function renderDashboard() {
    // Today line
    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `${ymd(state.currentDate)} · ${state.currentDate.toDateString()}`;

    // Month snapshot
    const snapshot = $("#monthSnapshot");
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const counts = monthStatusCounts(y, m);
    const revenue = sumRevenueForMonth(y, m);
    if (snapshot) snapshot.textContent = `Month: S ${counts.s} · C ${counts.c} · X ${counts.x} · Revenue $${revenue.toFixed(2)}`;

    // Optional today stats spot
    const todayStats = $("#todayStats");
    if (todayStats) {
      const ds = getDayStatusCounts(ymd(state.currentDate));
      const totals = calculateDayTotals(ymd(state.currentDate));
      const rev = totals.scheduled.amount + totals.completed.amount;
      todayStats.textContent = `Today: S ${ds.s} · C ${ds.c} · X ${ds.x} · $${rev.toFixed(2)}`;
    }

    renderDashboardQuickCalendar();
    wireDashboardOpenButtons();
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

      // IMPORTANT: clicking a day can open Day or Calendar. We’ll open Day (more useful),
      // but we also provide separate "Open Calendar" button.
      safeOnClick(btn, () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setActiveView("day"); // day workspace is the “work” screen
      });

      container.appendChild(btn);
    }
  }

  // Dashboard “Open Calendar” and “Open Today” buttons (supports multiple possible IDs)
  function wireDashboardOpenButtons() {
    // Open Calendar possibilities
    const openCalendarCandidates = [
      $("#openCalendar"), $("#openCalendarBtn"), $("#btnOpenCalendar"),
      $("#dashboardOpenCalendar"), $("#btnCalendar"),
      ...$$('[data-action="open-calendar"]'),
    ].filter(Boolean);

    openCalendarCandidates.forEach((el) => {
      // prevent double-wiring
      if (el.dataset._wiredOpenCalendar) return;
      el.dataset._wiredOpenCalendar = "1";

      safeOnClick(el, (e) => {
        e.preventDefault?.();
        // Ensure month cursor aligns with currentDate
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        setActiveView("calendar");
      });
    });

    // Open Today possibilities
    const openTodayCandidates = [
      $("#openToday"), $("#openTodayBtn"), $("#btnOpenToday"),
      $("#dashboardOpenToday"),
      ...$$('[data-action="open-today"]'),
    ].filter(Boolean);

    openTodayCandidates.forEach((el) => {
      if (el.dataset._wiredOpenToday) return;
      el.dataset._wiredOpenToday = "1";

      safeOnClick(el, (e) => {
        e.preventDefault?.();
        state.currentDate = startOfDay(new Date());
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        setActiveView("day");
      });
    });

    // Optional: if your “Today card” itself should open Day Workspace when tapped
    const todayCard = $("#todayCard") || $("#dashboardTodayCard");
    if (todayCard && !todayCard.dataset._wiredTodayCard) {
      todayCard.dataset._wiredTodayCard = "1";
      safeOnClick(todayCard, () => setActiveView("day"));
    }
  }

  // =========================
  // Full Month Calendar rendering
  // =========================
  function renderFullMonthCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) {
      warn("Missing #calendarGrid. Full calendar cannot render.");
      return;
    }

    const label = $("#monthLabel");
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    if (label) label.textContent = `${monthName(m)} ${y}`;

    grid.innerHTML = "";

    // Weekday headers
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

    // Leading padding cells
    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

    // Day cells
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
      } else {
        markers.textContent = "";
      }

      cell.appendChild(num);
      cell.appendChild(markers);

      safeOnClick(cell, () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setActiveView("day");
      });

      grid.appendChild(cell);
    }
  }

  // =========================
  // Day Workspace rendering (Jobs list + totals + inline status)
  // =========================
  function renderDayWorkspace() {
    const dateStr = ymd(state.currentDate);

    // Optional header
    setText("dayTitle", `Day Workspace: ${dateStr}`);

    const list = $("#dayJobsList");
    if (!list) return;

    const jobs = state.jobs
      .filter((j) => j.date === dateStr)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    list.innerHTML = "";

    // Totals bar (auto totals by status)
    const totals = calculateDayTotals(dateStr);
    const totalsBar = document.createElement("div");
    totalsBar.className = "day-totals";
    const revenue = totals.scheduled.amount + totals.completed.amount;
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

      // Status dropdown (inline)
      const sel = document.createElement("select");
      sel.className = "job-status";
      sel.innerHTML = `
        <option value="${STATUS.scheduled}">${STATUS_LABEL[STATUS.scheduled]}</option>
        <option value="${STATUS.completed}">${STATUS_LABEL[STATUS.completed]}</option>
        <option value="${STATUS.cancelled}">${STATUS_LABEL[STATUS.cancelled]}</option>
      `;
      sel.value = STATUS_LABEL[j.status] ? j.status : STATUS.scheduled;

      sel.addEventListener("change", () => {
        updateJobStatus(j.id, sel.value);
      });

      // Delete button
      const del = document.createElement("button");
      del.type = "button";
      del.className = "job-delete";
      del.textContent = "Delete";
      safeOnClick(del, () => deleteJob(j.id));

      right.appendChild(sel);
      right.appendChild(del);

      row.appendChild(left);
      row.appendChild(right);

      list.appendChild(row);
    }
  }

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

  // =========================
  // Add Job Modal (status dropdown supported)
  // =========================
  function bindJobModal() {
    const btnAddJob = $("#btnAddJob");
    const modal = $("#jobModal");
    const overlay = $("#modalOverlay");
    const closeX = $("#jobModalClose");
    const cancel = $("#jobCancel");
    const save = $("#jobSave");
    const errorBox = $("#jobError");

    const fields = {
      date: $("#jobDate"),
      customer: $("#jobCustomer"),
      pickup: $("#jobPickup"),
      dropoff: $("#jobDropoff"),
      amount: $("#jobAmount"),
      notes: $("#jobNotes"),
      status: $("#jobStatus"), // IMPORTANT: if HTML doesn’t have it, defaults to scheduled
    };

    const open = () => {
      if (!modal || !overlay) return;

      fields.date && (fields.date.value = ymd(state.currentDate));
      fields.customer && (fields.customer.value = "");
      fields.pickup && (fields.pickup.value = "");
      fields.dropoff && (fields.dropoff.value = "");
      fields.amount && (fields.amount.value = "0");
      fields.notes && (fields.notes.value = "");
      fields.status && (fields.status.value = STATUS.scheduled);

      if (errorBox) {
        errorBox.hidden = true;
        errorBox.textContent = "";
      }

      overlay.hidden = false;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      fields.customer?.focus?.();
    };

    const close = () => {
      if (!modal || !overlay) return;
      overlay.hidden = true;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    };

    const showError = (msg) => {
      if (!errorBox) return;
      errorBox.textContent = msg;
      errorBox.hidden = false;
    };

    const onSave = () => {
      try {
        const job = normalizeJob({
          id: makeId(),
          date: fields.date?.value || ymd(state.currentDate),
          customer: fields.customer?.value?.trim() || "",
          pickup: fields.pickup?.value?.trim() || "",
          dropoff: fields.dropoff?.value?.trim() || "",
          amount: clampMoney(fields.amount?.value ?? 0),
          notes: fields.notes?.value?.trim() || "",
          status: fields.status?.value || STATUS.scheduled,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        // Minimal validation
        if (!job.date) return showError("Date is required.");

        state.jobs.push(job);
        saveJobs();

        // move focus to job date
        const d = new Date(job.date);
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);

        close();
        renderAll();
      } catch (e) {
        err("Save job failed:", e);
        showError("Save failed. Check console.");
      }
    };

    safeOnClick(btnAddJob, open);
    safeOnClick(closeX, close);
    safeOnClick(cancel, close);
    safeOnClick(overlay, close);
    safeOnClick(save, onSave);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // =========================
  // Render pipeline
  // =========================
  function renderAll() {
    updateContextLine();

    if (state.activeView === "dashboard") renderDashboard();
    else if (state.activeView === "calendar") renderFullMonthCalendar();
    else if (state.activeView === "day") renderDayWorkspace();
    else {
      // keep these updated even on placeholder views
      renderDashboard(); // safe: it checks elements
    }
  }

  // =========================
  // Init
  // =========================
  function init() {
    try {
      // normalize once and persist
      state.jobs = (state.jobs || []).map(normalizeJob);
      saveJobs();

      bindSidebarNav();
      bindToolbarDateNav();
      bindCalendarMonthNav();
      bindJobModal();

      setActiveView("dashboard");

      setJsPill(true, "JS: loaded");
      log("Initialized OK");
    } catch (e) {
      setJsPill(false, "JS: error");
      err("Init failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
