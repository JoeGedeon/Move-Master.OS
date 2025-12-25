/* FleetPro / Move-Master.OS — app_v5.js
   Foundation (Smart):
   - Sidebar view switching
   - Toolbar date nav (Today/Prev/Next)
   - Dashboard quick calendar (pill grid)
   - Full Month Calendar view (weekday headers + padding days)
   - Add Job modal (open/close/save; localStorage-backed)
   - Honest JS badge: flips to "JS: loaded" only after init succeeds
   - Defensive: logs missing elements and continues
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const log = (...a) => console.log("[FleetPro]", ...a);

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const safeSetText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  const safeShow = (el) => {
    if (!el) return;
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
  };
  const safeHide = (el) => {
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  };

  const setBadge = (state, detail = "") => {
    const pill = document.getElementById("jsPill");
    if (!pill) return;
    if (state === "loaded") pill.textContent = "JS: loaded";
    else if (state === "error") pill.textContent = `JS: error${detail ? " (" + detail + ")" : ""}`;
    else pill.textContent = "JS: not loaded";
  };

  // ---------- Storage ----------
  const STORAGE = {
    jobs: "fleetpro.jobs.v1",
    receipts: "fleetpro.receipts.v1",
    notes: "fleetpro.notes.v1",
    ui: "fleetpro.ui.v1",
  };

  const loadJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      log("loadJSON failed", key, e);
      return fallback;
    }
  };

  const saveJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      log("saveJSON failed", key, e);
      return false;
    }
  };

  // ---------- App State ----------
  const state = {
    focusDate: new Date(),        // the date toolbar nav controls
    activeView: "dashboard",      // dashboard | calendar | day | drivers | ...
    jobs: loadJSON(STORAGE.jobs, []),
    receipts: loadJSON(STORAGE.receipts, []),
    notes: loadJSON(STORAGE.notes, []),
    ui: loadJSON(STORAGE.ui, { activeView: "dashboard", focusYMD: null }),
  };

  if (state.ui?.focusYMD) {
    const parts = state.ui.focusYMD.split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(d.getTime())) state.focusDate = d;
    }
  }
  if (state.ui?.activeView) state.activeView = state.ui.activeView;

  // ---------- DOM References (tolerant) ----------
  const viewsRoot = $(".views") || document;
  const viewEls = {
    dashboard: $("#view-dashboard") || $("#viewDashboard") || $("#view-dashboard", viewsRoot),
    calendar: $("#view-calendar") || $("#viewCalendar") || $("#view-calendar", viewsRoot),
    day: $("#view-day") || $("#viewDay") || $("#view-day", viewsRoot),
    drivers: $("#view-drivers") || $("#viewDrivers") || $("#view-drivers", viewsRoot),
    trucks: $("#view-trucks") || $("#viewTrucks") || $("#view-trucks", viewsRoot),
    dispatch: $("#view-dispatch") || $("#viewDispatch") || $("#view-dispatch", viewsRoot),
    finance: $("#view-finance") || $("#viewFinance") || $("#view-finance", viewsRoot),
    inventory: $("#view-inventory") || $("#viewInventory") || $("#view-inventory", viewsRoot),
    ai: $("#view-ai") || $("#viewAI") || $("#view-ai", viewsRoot),
  };

  // Calendar containers (IDs we standardize on)
  const getDashboardCalendarEl = () => document.getElementById("dashboardCalendar");
  const getCalendarGridEl = () => document.getElementById("calendarGrid");

  // Toolbar buttons
  const btnToday = document.getElementById("btnToday");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");

  // Toolbar add buttons (modal triggers)
  const btnAddJob = document.getElementById("btnAddJob");

  // Header context line
  const contextLine = document.getElementById("contextLine");

  // ---------- View Switching ----------
  const allViewKeys = Object.keys(viewEls);

  const setActiveView = (key) => {
    if (!key || !viewEls[key]) {
      log("Unknown view:", key);
      return;
    }

    // hide all
    for (const k of allViewKeys) {
      const el = viewEls[k];
      if (!el) continue;
      el.classList.remove("active");
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }

    // show target
    viewEls[key].classList.add("active");
    viewEls[key].hidden = false;
    viewEls[key].setAttribute("aria-hidden", "false");
    state.activeView = key;
    state.ui.activeView = key;
    saveJSON(STORAGE.ui, state.ui);

    // update header context
    updateContextLine();
    // render what needs rendering
    renderAll();
  };

  const wireSidebarNav = () => {
    // Supports:
    // - elements with data-view="dashboard"
    // - links like href="#dashboard"
    // - buttons that have text matching view name (last resort)
    const candidates = $$("[data-view]");

    candidates.forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const key = (el.getAttribute("data-view") || "").trim();
        if (key) setActiveView(key);
      });
    });

    // Hash links
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const hash = (a.getAttribute("href") || "").slice(1);
        if (hash && viewEls[hash]) {
          e.preventDefault();
          setActiveView(hash);
        }
      });
    });
  };

  // ---------- Toolbar Date Nav ----------
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const updateContextLine = () => {
    if (!contextLine) return;
    const base = {
      dashboard: "Foundation mode (Smart)",
      calendar: "Calendar navigation (Month)",
      day: `Day Workspace: ${ymd(state.focusDate)}`,
      drivers: "Drivers (coming soon)",
      trucks: "Trucks (coming soon)",
      dispatch: "Dispatch (coming soon)",
      finance: "Finance (coming soon)",
      inventory: "Inventory (coming soon)",
      ai: "AI Scanner (coming soon)",
    };
    contextLine.textContent = base[state.activeView] || "Foundation mode (Smart)";
  };

  const wireToolbar = () => {
    if (btnToday) {
      btnToday.addEventListener("click", () => {
        state.focusDate = new Date();
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        updateContextLine();
        renderAll();
      });
    }
    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        // In calendar view: move a month. Else: move a day.
        if (state.activeView === "calendar") {
          const d = new Date(state.focusDate);
          d.setMonth(d.getMonth() - 1);
          state.focusDate = d;
        } else {
          state.focusDate = addDays(state.focusDate, -1);
        }
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        updateContextLine();
        renderAll();
      });
    }
    if (btnNext) {
      btnNext.addEventListener("click", () => {
        if (state.activeView === "calendar") {
          const d = new Date(state.focusDate);
          d.setMonth(d.getMonth() + 1);
          state.focusDate = d;
        } else {
          state.focusDate = addDays(state.focusDate, +1);
        }
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        updateContextLine();
        renderAll();
      });
    }
  };

  // ---------- Dashboard Quick Calendar ----------
  const renderQuickCalendar = (rootEl, date) => {
    if (!rootEl) return;

    const year = date.getFullYear();
    const month = date.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    // quick calendar is "pill numbers 1..N"
    const frag = document.createDocumentFragment();

    for (let day = 1; day <= last.getDate(); day++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);
      btn.addEventListener("click", () => {
        // clicking a day opens Day Workspace and sets focus date
        state.focusDate = new Date(year, month, day);
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        setActiveView("day");
      });
      frag.appendChild(btn);
    }

    rootEl.innerHTML = "";
    rootEl.appendChild(frag);
  };

  // ---------- Full Month Calendar ----------
  const ensureCalendarGridExists = () => {
    let calView = viewEls.calendar;
    if (!calView) return null;

    let grid = getCalendarGridEl();
    if (grid) return grid;

    // If user forgot it in HTML, we create it.
    grid = document.createElement("div");
    grid.id = "calendarGrid";
    // use a class your CSS already likely styles ("calendar-grid")
    grid.className = "calendar-grid";
    calView.appendChild(grid);
    return grid;
  };

  const renderFullMonthCalendar = (container, date) => {
    if (!container) return;

    // We render a predictable structure:
    // - Weekday header row (7)
    // - Padding days from previous month
    // - Actual days
    // - Padding days to complete grid (optional)
    //
    // If CSS exists for .calendar-grid, it will look right.
    // Even without CSS, the structure is still correct.

    const year = date.getFullYear();
    const month = date.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    // weekday index: Sun=0..Sat=6
    const startDow = first.getDay();

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const wrapper = document.createElement("div");
    wrapper.className = "month-wrap";

    // Month title area (optional, safe)
    const title = document.createElement("div");
    title.className = "month-title";
    title.textContent = first.toLocaleString(undefined, { month: "long", year: "numeric" });
    wrapper.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "calendar-grid month-grid";

    // Header cells
    weekdays.forEach((w) => {
      const h = document.createElement("div");
      h.className = "cal-h";
      h.textContent = w;
      grid.appendChild(h);
    });

    // Padding days from previous month
    const prevLast = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLast.getDate() - i;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "pill muted cal-day pad";
      cell.textContent = String(d);
      cell.addEventListener("click", () => {
        state.focusDate = new Date(year, month - 1, d);
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        setActiveView("day");
      });
      grid.appendChild(cell);
    }

    // Month days
    const today = new Date();
    const todayStr = ymd(today);

    for (let day = 1; day <= last.getDate(); day++) {
      const cellDate = new Date(year, month, day);
      const cell = document.createElement("button");
      cell.type = "button";
      const isToday = ymd(cellDate) === todayStr;

      cell.className = "pill cal-day" + (isToday ? " today" : "");
      cell.textContent = String(day);
      cell.addEventListener("click", () => {
        state.focusDate = cellDate;
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        setActiveView("day");
      });

      grid.appendChild(cell);
    }

    // Trailing padding to complete last week (optional but makes grid tidy)
    const totalCells = 7 /*headers*/ + startDow + last.getDate();
    const remainder = totalCells % 7;
    const padTail = remainder === 0 ? 0 : 7 - remainder;

    for (let p = 1; p <= padTail; p++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "pill muted cal-day pad";
      cell.textContent = String(p);
      cell.addEventListener("click", () => {
        state.focusDate = new Date(year, month + 1, p);
        state.ui.focusYMD = ymd(state.focusDate);
        saveJSON(STORAGE.ui, state.ui);
        setActiveView("day");
      });
      grid.appendChild(cell);
    }

    wrapper.appendChild(grid);

    container.innerHTML = "";
    container.appendChild(wrapper);
  };

  // ---------- Day Workspace (simple, stable placeholder) ----------
  const renderDayWorkspace = () => {
    const dayView = viewEls.day;
    if (!dayView) return;

    // If you already have your day workspace markup, we just update the line.
    safeSetText("dayTitle", `Day Workspace: ${ymd(state.focusDate)}`);
  };

  // ---------- Snapshot ----------
  const renderSnapshot = () => {
    // Update month snapshot line if present
    const el = document.getElementById("monthSnapshot");
    if (!el) return;

    const key = monthKey(state.focusDate);
    const jobs = state.jobs.filter((j) => (j.date || "").startsWith(key));
    const receipts = state.receipts.filter((r) => (r.date || "").startsWith(key));

    // expenses placeholder
    el.textContent = `Jobs: ${jobs.length} · Receipts: ${receipts.length} · Expenses: $0`;
  };

  const renderTodayLine = () => {
    const el = document.getElementById("todayLine");
    if (!el) return;
    const d = state.focusDate;
    const pretty = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    el.textContent = `${ymd(d)} · ${pretty}`;
  };

  // ---------- Modal: Add Job ----------
  const modalOverlay = document.getElementById("modalOverlay");
  const jobModal = document.getElementById("jobModal");
  const jobModalClose = document.getElementById("jobModalClose");
  const jobCancel = document.getElementById("jobCancel");
  const jobSave = document.getElementById("jobSave");
  const jobError = document.getElementById("jobError");

  const jobFields = {
    date: document.getElementById("jobDate"),
    customer: document.getElementById("jobCustomer"),
    pickup: document.getElementById("jobPickup"),
    dropoff: document.getElementById("jobDropoff"),
    amount: document.getElementById("jobAmount"),
    notes: document.getElementById("jobNotes"),
  };

  const openJobModal = () => {
    if (!modalOverlay || !jobModal) return;

    // default date = focus date
    if (jobFields.date) jobFields.date.value = ymd(state.focusDate);
    if (jobFields.amount) jobFields.amount.value = jobFields.amount.value || "0";
    if (jobError) {
      jobError.hidden = true;
      jobError.textContent = "";
    }

    safeShow(modalOverlay);
    safeShow(jobModal);

    // Focus first input if exists
    if (jobFields.customer) jobFields.customer.focus();
  };

  const closeJobModal = () => {
    safeHide(jobModal);
    safeHide(modalOverlay);
  };

  const validateJob = (job) => {
    if (!job.date) return "Date is required.";
    if (!job.customer) return "Customer is required.";
    return "";
  };

  const saveJob = () => {
    const job = {
      id: `J-${Math.floor(Math.random() * 9000) + 1000}`,
      date: jobFields.date ? jobFields.date.value.trim() : ymd(state.focusDate),
      customer: jobFields.customer ? jobFields.customer.value.trim() : "",
      pickup: jobFields.pickup ? jobFields.pickup.value.trim() : "",
      dropoff: jobFields.dropoff ? jobFields.dropoff.value.trim() : "",
      amount: jobFields.amount ? Number(jobFields.amount.value || 0) : 0,
      notes: jobFields.notes ? jobFields.notes.value.trim() : "",
      createdAt: Date.now(),
    };

    const err = validateJob(job);
    if (err) {
      if (jobError) {
        jobError.hidden = false;
        jobError.textContent = err;
      }
      return;
    }

    state.jobs.unshift(job);
    saveJSON(STORAGE.jobs, state.jobs);

    closeJobModal();
    renderSnapshot();
  };

  const wireModal = () => {
    if (btnAddJob) btnAddJob.addEventListener("click", openJobModal);

    if (modalOverlay) modalOverlay.addEventListener("click", closeJobModal);
    if (jobModalClose) jobModalClose.addEventListener("click", closeJobModal);
    if (jobCancel) jobCancel.addEventListener("click", closeJobModal);
    if (jobSave) jobSave.addEventListener("click", saveJob);

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeJobModal();
    });

    // stop clicks inside modal from closing overlay
    if (jobModal) {
      jobModal.addEventListener("click", (e) => e.stopPropagation());
    }
  };

  // ---------- Render Pipeline ----------
  const renderDashboard = () => {
    renderTodayLine();
    renderSnapshot();

    // quick calendar
    const quick = getDashboardCalendarEl();
    if (quick) renderQuickCalendar(quick, state.focusDate);
  };

  const renderCalendarView = () => {
    // Ensure container exists and render full month
    const cal = ensureCalendarGridExists();
    if (cal) renderFullMonthCalendar(cal, state.focusDate);
  };

  const renderAll = () => {
    // Always keep these consistent
    renderSnapshot();

    if (state.activeView === "dashboard") renderDashboard();
    else if (state.activeView === "calendar") renderCalendarView();
    else if (state.activeView === "day") renderDayWorkspace();
    else {
      // other views: keep snapshot updated and context line updated
    }
  };

  // ---------- Init ----------
  const init = () => {
    setBadge("not");

    wireSidebarNav();
    wireToolbar();
    wireModal();

    // Ensure initial view is visible
    // If your HTML already has one .view.active, we still enforce state.
    setActiveView(state.activeView || "dashboard");

    setBadge("loaded");
    log("Init OK", { view: state.activeView, focus: ymd(state.focusDate) });
  };

  // Boot after DOM is ready
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  } catch (e) {
    log("Init error", e);
    setBadge("error", "init");
  }
})();
