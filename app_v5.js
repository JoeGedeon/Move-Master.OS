/* FleetPro / Move-Master.OS — app_v5.js
   Single-file, defensive JS. Works even if some optional elements are missing.
*/
(() => {
  "use strict";

  // ========= Helpers =========
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

  // ========= State =========
  const state = {
    currentDate: startOfDay(new Date()), // drives dashboard + day workspace + toolbar
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // drives full month view
    activeView: "dashboard",
    jobs: []
  };

  // ========= LocalStorage =========
  const LS_KEY = "fleetpro_jobs_v1";

  function loadJobs() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      state.jobs = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.jobs)) state.jobs = [];
    } catch (e) {
      warn("Failed to load jobs:", e);
      state.jobs = [];
    }
  }

  function saveJobs() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.jobs));
    } catch (e) {
      warn("Failed to save jobs:", e);
    }
  }

  // ========= UI: Status pill =========
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

    // Show requested view (by id: view-dashboard, view-calendar, view-day, etc.)
    const viewEl = $(`#view-${viewName}`);
    if (viewEl) viewEl.classList.add("active");
    else warn(`Missing view container: #view-${viewName}`);

    // Sidebar highlighting: any element with [data-view]
    $$("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    updateContextLine();
    // When entering calendar, render calendar
    if (viewName === "calendar") renderFullMonthCalendar();
    if (viewName === "dashboard") renderDashboardQuickCalendar(); // safe even if missing
    if (viewName === "day") renderDayWorkspace();
  }

  function bindSidebarNav() {
    const navItems = $$("[data-view]");
    if (!navItems.length) {
      // fallback: try sidebar buttons by text ids if any (optional)
      warn("No [data-view] sidebar items found. View switching may rely on your existing handlers.");
      return;
    }
    navItems.forEach((el) => {
      el.addEventListener("click", () => {
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
    else if (state.activeView === "calendar") el.textContent = "navigation (Month)";
    else if (state.activeView === "day") el.textContent = "Day Workspace";
    else el.textContent = "Coming soon";
  }

  // ========= Toolbar date navigation (Today / Prev / Next) =========
  function bindToolbarDateNav() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    const goToday = () => {
      state.currentDate = startOfDay(new Date());
      renderDashboardTodayCard();
      renderDashboardQuickCalendar();
      if (state.activeView === "day") renderDayWorkspace();
    };

    const goPrev = () => {
      state.currentDate = new Date(state.currentDate);
      state.currentDate.setDate(state.currentDate.getDate() - 1);
      state.currentDate = startOfDay(state.currentDate);
      renderDashboardTodayCard();
      renderDashboardQuickCalendar();
      if (state.activeView === "day") renderDayWorkspace();
    };

    const goNext = () => {
      state.currentDate = new Date(state.currentDate);
      state.currentDate.setDate(state.currentDate.getDate() + 1);
      state.currentDate = startOfDay(state.currentDate);
      renderDashboardTodayCard();
      renderDashboardQuickCalendar();
      if (state.activeView === "day") renderDayWorkspace();
    };

    if (btnToday) btnToday.addEventListener("click", goToday);
    if (btnPrev) btnPrev.addEventListener("click", goPrev);
    if (btnNext) btnNext.addEventListener("click", goNext);
  }

  // ========= Dashboard rendering =========
  function renderDashboardTodayCard() {
    const todayLine = $("#todayLine");
    if (todayLine) {
      const d = state.currentDate;
      todayLine.textContent = `${ymd(d)} · ${d.toDateString()}`;
    }

    const monthSnapshot = $("#monthSnapshot");
    if (monthSnapshot) {
      // basic snapshot from stored jobs this month
      const m = state.currentDate.getMonth();
      const y = state.currentDate.getFullYear();
      const jobsThisMonth = state.jobs.filter((j) => {
        const jd = j?.date ? new Date(j.date) : null;
        return jd && jd.getFullYear() === y && jd.getMonth() === m;
      });
      monthSnapshot.textContent = `Jobs: ${jobsThisMonth.length} · Receipts: 0 · Expenses: $0`;
    }
  }

  // ========= Quick Calendar (Dashboard) =========
  // This is a "pills grid" in #dashboardCalendar, NOT the full month view.
  // It will NEVER write into #calendarGrid.
  function renderDashboardQuickCalendar() {
    const container = $("#dashboardCalendar");
    if (!container) return; // optional

    const base = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    container.innerHTML = "";

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (sameDay(d, state.currentDate)) btn.classList.add("active");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        renderDashboardTodayCard();
        renderDashboardQuickCalendar();
        // optionally jump to day workspace
        // setActiveView("day");
      });

      container.appendChild(btn);
    }
  }

  // ========= Full Month Calendar (Calendar view) =========
  function bindCalendarMonthNav() {
    const prev = $("#calPrev");
    const next = $("#calNext");
    const today = $("#calToday");

    const goPrevMonth = () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderFullMonthCalendar();
    };
    const goNextMonth = () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderFullMonthCalendar();
    };
    const goThisMonth = () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderFullMonthCalendar();
    };

    if (prev) prev.addEventListener("click", goPrevMonth);
    if (next) next.addEventListener("click", goNextMonth);
    if (today) today.addEventListener("click", goThisMonth);
  }

  function renderFullMonthCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) {
      warn("Missing #calendarGrid. Full calendar cannot render.");
      return;
    }

    // Update month label if present
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

    // Compute padding days
    const firstDay = new Date(y, m, 1);
    const firstDow = firstDay.getDay(); // 0-6
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Leading blanks
    for (let i = 0; i < firstDow; i++) {
      const blank = document.createElement("div");
      blank.className = "day pad";
      blank.textContent = "";
      grid.appendChild(blank);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      cell.textContent = String(day);

      // Highlight today (real today), and selected date
      const realToday = startOfDay(new Date());
      if (sameDay(d, realToday)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      // Mark if jobs exist on that day
      const hasJobs = state.jobs.some((j) => j?.date && ymd(new Date(j.date)) === ymd(d));
      if (hasJobs) cell.classList.add("has-jobs");

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        renderDashboardTodayCard();
        renderDashboardQuickCalendar();
        // Go to day workspace on tap, because that’s useful
        setActiveView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ========= Day Workspace =========
  function renderDayWorkspace() {
    const title = $("#dayTitle");
    if (title) title.textContent = state.currentDate.toDateString();

    // If you have job list containers, populate them (optional)
    const list = $("#dayJobsList");
    if (list) {
      list.innerHTML = "";
      const key = ymd(state.currentDate);
      const jobs = state.jobs.filter((j) => j?.date === key);

      if (!jobs.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "No jobs for this day.";
        list.appendChild(empty);
      } else {
        jobs.forEach((j) => {
          const row = document.createElement("div");
          row.className = "job-row";
          row.textContent = `${j.customer || "Customer"} · $${Number(j.amount || 0).toFixed(2)}`;
          list.appendChild(row);
        });
      }
    }
  }

  // ========= Job Modal (optional but supported) =========
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
      notes: $("#jobNotes")
    };

    const open = () => {
      if (!modal || !overlay) return;

      if (fields.date) fields.date.value = ymd(state.currentDate);
      if (fields.customer) fields.customer.value = "";
      if (fields.pickup) fields.pickup.value = "";
      if (fields.dropoff) fields.dropoff.value = "";
      if (fields.amount) fields.amount.value = "0";
      if (fields.notes) fields.notes.value = "";

      if (errorBox) errorBox.hidden = true;

      overlay.hidden = false;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
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
        const job = {
          id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
          date: fields.date?.value || ymd(state.currentDate),
          customer: fields.customer?.value?.trim() || "",
          pickup: fields.pickup?.value?.trim() || "",
          dropoff: fields.dropoff?.value?.trim() || "",
          amount: Number(fields.amount?.value || 0),
          notes: fields.notes?.value?.trim() || ""
        };

        if (!job.date) return showError("Date is required.");
        // Customer can be optional, but you can enforce it if you want.

        state.jobs.push(job);
        saveJobs();

        // refresh UI
        renderDashboardTodayCard();
        renderDashboardQuickCalendar();
        if (state.activeView === "calendar") renderFullMonthCalendar();
        if (state.activeView === "day") renderDayWorkspace();

        close();
      } catch (e) {
        err("Job save failed:", e);
        showError("Save failed. Check console.");
      }
    };

    if (btnAddJob) btnAddJob.addEventListener("click", open);
    if (closeX) closeX.addEventListener("click", close);
    if (cancel) cancel.addEventListener("click", close);
    if (overlay) overlay.addEventListener("click", close);
    if (save) save.addEventListener("click", onSave);

    // ESC close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // ========= Init =========
  function init() {
    try {
      loadJobs();

      bindSidebarNav();
      bindToolbarDateNav();
      bindCalendarMonthNav();
      bindJobModal();

      renderDashboardTodayCard();
      renderDashboardQuickCalendar();

      // Set default view (dashboard)
      setActiveView("dashboard");

      setJsPill(true, "JS: loaded");
      log("Initialized OK");
    } catch (e) {
      setJsPill(false, "JS: error");
      err("Init failed:", e);
    }
  }

  // Run after DOM exists
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
