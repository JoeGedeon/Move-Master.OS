/* FleetPro / Move-Master.OS — app_v5.js
   Next Logic Layer: Job Status + Calendar Markers

   FEATURES:
   - Job.status: scheduled (default) | completed | cancelled
   - Add Job modal supports status (if #jobStatus exists)
   - Day Workspace shows jobs for the selected date + inline status dropdown + delete
   - Full Month Calendar renders per-day status markers (S/C/X counts)
   - Dashboard today + month snapshot show counts by status and revenue (cancelled excluded)
   - Defensive: logs missing elements and keeps running
*/

(() => {
  "use strict";

  // ========= Helpers =========
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

   function calculateDayTotals(dateStr) {
  let totals = {
    scheduled: { count: 0, amount: 0 },
    completed: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 }
  };

  state.jobs.forEach(j => {
    if (j.date !== dateStr) return;
    totals[j.status].count += 1;
    if (j.status !== "cancelled") {
      totals[j.status].amount += Number(j.amount || 0);
    }
  });

  return totals;
}
  const log = (...a) => console.log("[FleetPro]", ...a);
  const warn = (...a) => console.warn("[FleetPro]", ...a);
  const error = (...a) => console.error("[FleetPro]", ...a);

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

  const STATUS = /** @type {const} */ ({
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
  });

  const STATUS_LABEL = {
    [STATUS.scheduled]: "Scheduled",
    [STATUS.completed]: "Completed",
    [STATUS.cancelled]: "Cancelled",
  };

  // ========= LocalStorage =========
  const LS_KEY = "fleetpro_jobs_v1"; // keep same so you don’t lose data

  function loadJobs() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const jobs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(jobs)) return [];
      // Backfill status for older jobs
      return jobs.map((j) => normalizeJob(j));
    } catch (e) {
      warn("Failed to load jobs:", e);
      return [];
    }
  }

  function saveJobs() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.jobs));
    } catch (e) {
      warn("Failed to save jobs:", e);
    }
  }

  // ========= Job normalization / validation =========
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

  function validateJob(job) {
    if (!job.date) return "Date is required.";
    // customer/pickup/dropoff can be optional in early version
    return "";
  }

  function makeId() {
    // UUID if available; fallback
    try {
      return crypto.randomUUID();
    } catch {
      return `job_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    }
  }

  // ========= State =========
  const state = {
    currentDate: startOfDay(new Date()),     // toolbar date cursor + selected date
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // month view cursor
    activeView: "dashboard",
    jobs: loadJobs(),
  };

  // ========= Status pill =========
  function setJsPill(ok, msg) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = msg || (ok ? "JS: loaded" : "JS: error");
    pill.classList.toggle("ok", !!ok);
    pill.classList.toggle("bad", !ok);
  }

  // ========= View switching =========
  function setActiveView(viewName) {
    state.activeView = viewName;

    // Hide all views
    $$(".view").forEach((v) => v.classList.remove("active"));

    const viewEl = $(`#view-${viewName}`);
    if (viewEl) viewEl.classList.add("active");
    else warn(`Missing view container: #view-${viewName}`);

    // Sidebar highlighting
    $$("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    updateContextLine();
    renderAll();
  }

  function bindSidebarNav() {
    const navItems = $$("[data-view]");
    if (!navItems.length) {
      warn("No [data-view] sidebar items found.");
      return;
    }
    navItems.forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const v = el.getAttribute("data-view");
        if (v) setActiveView(v);
      });
    });
  }

  // ========= Context line =========
  function updateContextLine() {
    const el = $("#contextLine");
    if (!el) return;

    if (state.activeView === "dashboard") el.textContent = "Foundation mode (Smart)";
    else if (state.activeView === "calendar") el.textContent = "Calendar navigation (Month)";
    else if (state.activeView === "day") el.textContent = `Day Workspace: ${ymd(state.currentDate)}`;
    else el.textContent = "Coming soon";
  }

  // ========= Toolbar date navigation =========
  function bindToolbarDateNav() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    const goToday = () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      updateContextLine();
      renderAll();
    };

    const goPrev = () => {
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
    };

    const goNext = () => {
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
    };

    btnToday?.addEventListener("click", goToday);
    btnPrev?.addEventListener("click", goPrev);
    btnNext?.addEventListener("click", goNext);
  }

  // ========= Calendar month nav buttons (optional) =========
  function bindCalendarMonthNav() {
    const prev = $("#calPrev");
    const today = $("#calToday");
    const next = $("#calNext");

    prev?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderFullMonthCalendar();
    });

    today?.addEventListener("click", () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderFullMonthCalendar();
    });

    next?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderFullMonthCalendar();
    });
  }

  // ========= Aggregation for markers / dashboard =========
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

  function sumRevenueForDate(dateStr) {
    // scheduled + completed count as revenue, cancelled excluded
    let total = 0;
    for (const j of state.jobs) {
      if (j.date !== dateStr) continue;
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumRevenueForMonth(year, monthIndex) {
    let total = 0;
    for (const j of state.jobs) {
      if (!j.date) continue;
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

  // ========= Dashboard rendering =========
  function renderDashboardTodayCard() {
    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `${ymd(state.currentDate)} · ${state.currentDate.toDateString()}`;

    const snapshot = $("#monthSnapshot");
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();

    const counts = monthStatusCounts(y, m);
    const revenue = sumRevenueForMonth(y, m);

    if (snapshot) {
      snapshot.textContent = `Month: S ${counts.s} · C ${counts.c} · X ${counts.x} · Revenue $${revenue.toFixed(2)}`;
    }

    // Optional “today stats” if you have a spot
    const todayStats = $("#todayStats");
    if (todayStats) {
      const ds = getDayStatusCounts(ymd(state.currentDate));
      const rev = sumRevenueForDate(ymd(state.currentDate));
      todayStats.textContent = `Today: S ${ds.s} · C ${ds.c} · X ${ds.x} · $${rev.toFixed(2)}`;
    }
  }

  // ========= Quick Calendar (dashboard) =========
  function renderDashboardQuickCalendar() {
    const container = $("#dashboardCalendar");
    if (!container) return; // optional

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
  setActiveView("calendar");
});
        // Clicking a day should take you to Day Workspace (useful)
        setActiveView("day");
      });

      container.appendChild(btn);
    }
  }

  // ========= Full Month Calendar (Calendar view) =========
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

    // Leading pads
    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      pad.textContent = "";
      grid.appendChild(pad);
    }

    // Day cells
    const today = startOfDay(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      // Number
      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(day);

      // Markers
      const counts = getDayStatusCounts(dateStr);
      const markers = document.createElement("div");
      markers.className = "markers";

      if (counts.total > 0) {
        // S/C/X display like: "2S 1C" etc
        const parts = [];
        if (counts.s) parts.push(`${counts.s}S`);
        if (counts.c) parts.push(`${counts.c}C`);
        if (counts.x) parts.push(`${counts.x}X`);
        markers.textContent = parts.join(" · ");
        // status-based classes so CSS can color
        if (counts.c) cell.classList.add("has-completed");
        if (counts.s) cell.classList.add("has-scheduled");
        if (counts.x) cell.classList.add("has-cancelled");
      } else {
        markers.textContent = "";
      }

      cell.appendChild(num);
      cell.appendChild(markers);

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        updateContextLine();
        setActiveView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ========= Day Workspace (Jobs list + status editing) =========
  function renderDayWorkspace() {
    // Titles (optional)
    const dayTitle = $("#dayTitle");
    if (dayTitle) dayTitle.textContent = `Day Workspace: ${ymd(state.currentDate)}`;

    const list = $("#dayJobsList"); // optional container
    if (!list) {
      // nothing to render into, but app still works
      return;
    }

    const dateStr = ymd(state.currentDate);
    const jobs = state.jobs
      .filter((j) => j.date === dateStr)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    list.innerHTML = "";
     const totals = calculateDayTotals(dateStr);

const totalsBar = document.createElement("div");
totalsBar.className = "day-totals";
totalsBar.innerHTML = `
  <strong>Totals</strong><br>
  Scheduled: ${totals.scheduled.count} · $${totals.scheduled.amount.toFixed(2)}<br>
  Completed: ${totals.completed.count} · $${totals.completed.amount.toFixed(2)}<br>
  Cancelled: ${totals.cancelled.count}
`;
list.appendChild(totalsBar);

    // Stats line (optional)
    const stats = document.createElement("div");
    stats.className = "day-stats";
    const counts = getDayStatusCounts(dateStr);
    const rev = sumRevenueForDate(dateStr);
    stats.textContent = `S ${counts.s} · C ${counts.c} · X ${counts.x} · Revenue $${rev.toFixed(2)}`;
    list.appendChild(stats);

    if (jobs.length === 0) {
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

      // Status dropdown
      const sel = document.createElement("select");
      sel.className = "job-status";
      sel.innerHTML = `
        <option value="${STATUS.scheduled}">Scheduled</option>
        <option value="${STATUS.completed}">Completed</option>
        <option value="${STATUS.cancelled}">Cancelled</option>
      `;
      sel.value = j.status || STATUS.scheduled;

      sel.addEventListener("change", () => {
        updateJobStatus(j.id, sel.value);
      });

      // Delete
      const del = document.createElement("button");
      del.type = "button";
      del.className = "job-delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        deleteJob(j.id);
      });

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

    // re-render affected views
    renderDashboardTodayCard();
    if (state.activeView === "calendar") renderFullMonthCalendar();
    if (state.activeView === "day") renderDayWorkspace();
  }

  function deleteJob(jobId) {
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return;

    state.jobs.splice(idx, 1);
    saveJobs();

    renderDashboardTodayCard();
    if (state.activeView === "calendar") renderFullMonthCalendar();
    if (state.activeView === "day") renderDayWorkspace();
    // dashboard quick calendar markers
    if (state.activeView === "dashboard") renderDashboardQuickCalendar();
  }

  // ========= Job Modal (Add Job) =========
  function bindJobModal() {
    const modal = $("#jobModal");
    const overlay = $("#modalOverlay");
    const btnAddJob = $("#btnAddJob");
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
      status: $("#jobStatus"), // optional; add this to HTML for dropdown
    };

    const open = () => {
      if (!modal || !overlay) return;

      if (fields.date) fields.date.value = ymd(state.currentDate);
      if (fields.customer) fields.customer.value = "";
      if (fields.pickup) fields.pickup.value = "";
      if (fields.dropoff) fields.dropoff.value = "";
      if (fields.amount) fields.amount.value = "0";
      if (fields.notes) fields.notes.value = "";
      if (fields.status) fields.status.value = STATUS.scheduled;

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

        const v = validateJob(job);
        if (v) return showError(v);

        state.jobs.push(job);
        saveJobs();

        // update cursors to job date
        state.currentDate = startOfDay(new Date(job.date));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);

        close();
        updateContextLine();
        renderAll();
      } catch (e) {
        error("Job save failed:", e);
        showError("Save failed. Check console.");
      }
    };

    btnAddJob?.addEventListener("click", open);
    closeX?.addEventListener("click", close);
    cancel?.addEventListener("click", close);
    overlay?.addEventListener("click", close);
    save?.addEventListener("click", onSave);

    // ESC close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // ========= Render pipeline =========
  function renderAll() {
    // Always keep dashboard stats updated if those elements exist
    renderDashboardTodayCard();

    if (state.activeView === "dashboard") {
      renderDashboardQuickCalendar();
    } else if (state.activeView === "calendar") {
      renderFullMonthCalendar();
    } else if (state.activeView === "day") {
      renderDayWorkspace();
    }
  }

  // ========= Init =========
  function init() {
    try {
      // Normalize loaded jobs once
      state.jobs = (state.jobs || []).map(normalizeJob);
      saveJobs(); // write back normalized

      bindSidebarNav();
      bindToolbarDateNav();
      bindCalendarMonthNav();
      bindJobModal();

      // default view
      setActiveView("dashboard");

      setJsPill(true, "JS: loaded");
      log("Initialized OK");
    } catch (e) {
      setJsPill(false, "JS: error");
      error("Init failed:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
