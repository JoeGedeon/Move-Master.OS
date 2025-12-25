/* FleetPro / Move-Master.OS — app_v5.js (FULL)
   - Sidebar view switching (data-view="dashboard|calendar|day|drivers|trucks|dispatch|finance|inventory|ai")
   - Dashboard quick calendar (pill-number grid)
   - Full Month calendar view (weekday headers + padding days)
   - Toolbar date nav (Today / Prev / Next)
   - Add Job modal (open/close/save, localStorage-backed)
   - "JS: loaded / error" badge (honest)
   - Defensive: won’t crash if an element is missing

   Expected (but tolerant) IDs:
     js badge:        #jsPill
     toolbar buttons: #btnToday #btnPrev #btnNext #btnAddJob #btnAddReceipt #btnAddNote #btnExport #btnSync
     context line:    #contextLine
     dashboard:       #todayLine #dashboardCalendar #monthSnapshot
     full calendar:   one of: #calendarGrid (preferred), #monthGrid, #fullCalendarGrid, #calendarMonthGrid
     views:           #view-dashboard #view-calendar #view-day  (others optional)
     modal:           #modalOverlay #jobModal
                      #jobModalClose #jobCancel #jobSave
                      #jobDate #jobCustomer #jobPickup #jobDropoff #jobAmount #jobNotes
*/

(() => {
  "use strict";

  // ===== Helpers =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const log = (...a) => console.log("[FleetPro]", ...a);
  const warn = (...a) => console.warn("[FleetPro]", ...a);

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const niceDate = (d) =>
    d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  // ===== State =====
  const STORAGE_KEY = "fleetpro_state_v5";

  const defaultState = () => ({
    selectedDate: ymd(new Date()),
    // anchorMonth is used for the month calendar view (the 1st day of the month)
    anchorMonth: ymd(startOfMonth(new Date())),
    jobs: [
      // Example:
      // { id:"J-0001", date:"2025-12-01", customer:"", pickup:"", dropoff:"", amount:0, notes:"" }
    ],
  });

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch (e) {
      warn("Failed to load state, resetting.", e);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStoragePill();
    } catch (e) {
      warn("Failed to save state.", e);
    }
  }

  // ===== Badge: JS loaded/error (honest) =====
  function setJSStatus(text, mode = "ok") {
    const el = $("#jsPill");
    if (!el) return;
    el.textContent = text;

    // Optional styling hooks if your CSS supports them:
    el.classList.remove("ok", "err");
    el.classList.add(mode === "err" ? "err" : "ok");
  }

  function hardFail(e) {
    setJSStatus("JS: error", "err");
    console.error(e);
  }

  // ===== View switching =====
  function setActiveView(viewName) {
    // viewName matches data-view on nav buttons
    const allViews = $$(".view");
    allViews.forEach((v) => v.classList.remove("active"));

    const target =
      $(`#view-${viewName}`) ||
      $(`.view[data-view-panel="${viewName}"]`) ||
      $(`section.view#${viewName}`);

    if (!target) {
      warn("No view container found for:", viewName);
      return;
    }

    target.classList.add("active");

    // Update context line
    const ctx = $("#contextLine");
    if (ctx) {
      if (viewName === "calendar") ctx.textContent = "Calendar navigation (Month)";
      else if (viewName === "day") ctx.textContent = `Day Workspace: ${state.selectedDate}`;
      else if (viewName === "dashboard") ctx.textContent = "Foundation mode (Smart)";
      else ctx.textContent = `${viewName[0].toUpperCase()}${viewName.slice(1)} (coming soon)`;
    }

    // Render stuff based on view
    if (viewName === "dashboard") {
      renderDashboard();
    } else if (viewName === "calendar") {
      renderCalendarView();
    } else if (viewName === "day") {
      renderDayWorkspace();
    }
  }

  function bindNav() {
    // Sidebar buttons: expected .navbtn[data-view="..."]
    const btns = $$(".navbtn[data-view]");
    if (!btns.length) warn("No sidebar nav buttons found (.navbtn[data-view]).");

    btns.forEach((b) => {
      b.addEventListener("click", () => {
        const view = b.getAttribute("data-view");
        // mark active button
        btns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        setActiveView(view);
      });
    });
  }

  // ===== Toolbar: Today / Prev / Next =====
  function bindToolbar() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    if (btnToday) btnToday.addEventListener("click", () => goToday());
    if (btnPrev) btnPrev.addEventListener("click", () => goPrev());
    if (btnNext) btnNext.addEventListener("click", () => goNext());

    // Add Job
    const btnAddJob = $("#btnAddJob");
    if (btnAddJob) btnAddJob.addEventListener("click", () => openJobModal());

    // Others (placeholders)
    const btnAddReceipt = $("#btnAddReceipt");
    if (btnAddReceipt) btnAddReceipt.addEventListener("click", () => toast("Receipts: coming soon"));

    const btnAddNote = $("#btnAddNote");
    if (btnAddNote) btnAddNote.addEventListener("click", () => toast("Notes: coming soon"));

    const btnExport = $("#btnExport");
    if (btnExport) btnExport.addEventListener("click", () => toast("Export: later"));

    const btnSync = $("#btnSync");
    if (btnSync) btnSync.addEventListener("click", () => toast("Sync: later"));
  }

  function currentActiveViewName() {
    const active = $(".view.active");
    if (!active) return "dashboard";
    if (active.id?.startsWith("view-")) return active.id.replace("view-", "");
    return active.getAttribute("data-view-panel") || "dashboard";
  }

  function goToday() {
    const now = new Date();
    state.selectedDate = ymd(now);
    state.anchorMonth = ymd(startOfMonth(now));
    saveState();
    rerenderActive();
  }

  function goPrev() {
    const view = currentActiveViewName();
    if (view === "calendar") {
      const a = new Date(state.anchorMonth);
      const prevMonth = new Date(a.getFullYear(), a.getMonth() - 1, 1);
      state.anchorMonth = ymd(prevMonth);
      saveState();
      renderCalendarView();
      return;
    }

    // dashboard/day: move by 1 day
    const d = new Date(state.selectedDate);
    state.selectedDate = ymd(addDays(d, -1));
    saveState();
    rerenderActive();
  }

  function goNext() {
    const view = currentActiveViewName();
    if (view === "calendar") {
      const a = new Date(state.anchorMonth);
      const nextMonth = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      state.anchorMonth = ymd(nextMonth);
      saveState();
      renderCalendarView();
      return;
    }

    const d = new Date(state.selectedDate);
    state.selectedDate = ymd(addDays(d, +1));
    saveState();
    rerenderActive();
  }

  function rerenderActive() {
    const view = currentActiveViewName();
    if (view === "dashboard") renderDashboard();
    else if (view === "calendar") renderCalendarView();
    else if (view === "day") renderDayWorkspace();
  }

  // ===== Dashboard =====
  function renderDashboard() {
    // Today card line
    const todayLine = $("#todayLine");
    if (todayLine) {
      const d = new Date(state.selectedDate);
      todayLine.textContent = state.selectedDate + " · " + niceDate(d);
    }

    // Month snapshot
    renderMonthSnapshot();

    // Quick calendar grid
    renderDashboardCalendar();
  }

  function renderMonthSnapshot() {
    const el = $("#monthSnapshot");
    if (!el) return;

    const monthStart = startOfMonth(new Date(state.anchorMonth));
    const monthEnd = endOfMonth(new Date(state.anchorMonth));
    const inMonthJobs = state.jobs.filter((j) => j.date >= ymd(monthStart) && j.date <= ymd(monthEnd));

    const jobsCount = inMonthJobs.length;
    const receipts = 0;
    const expenses = 0;

    el.textContent = `Jobs: ${jobsCount} · Receipts: ${receipts} · Expenses: $${expenses}`;
  }

  function renderDashboardCalendar() {
    const grid = $("#dashboardCalendar");
    if (!grid) {
      // This is fine if your HTML doesn’t have it for some reason.
      return;
    }

    const anchor = startOfMonth(new Date(state.anchorMonth));
    const daysInMonth = endOfMonth(anchor).getDate();

    grid.innerHTML = "";

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "pill-day";
      cell.textContent = String(day);

      const dateStr = `${anchor.getFullYear()}-${pad2(anchor.getMonth() + 1)}-${pad2(day)}`;

      if (dateStr === state.selectedDate) cell.classList.add("active");

      // indicate jobs on that date
      if (state.jobs.some((j) => j.date === dateStr)) cell.classList.add("has-job");

      cell.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        renderDashboard();
        // Optional: open day workspace when a day is tapped
        // setActiveView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ===== Full Calendar View (Month) =====
  function getFullCalendarContainer() {
    return (
      $("#calendarGrid") ||
      $("#monthGrid") ||
      $("#fullCalendarGrid") ||
      $("#calendarMonthGrid")
    );
  }

  function renderCalendarView() {
    const container = getFullCalendarContainer();
    const monthTitleBox = $("#monthTitle") || $("#calendarMonthTitle");

    // If the view exists but container is missing, that’s your exact bug.
    if (!container) {
      warn(
        "Full calendar container not found. Add an element with id='calendarGrid' (recommended) " +
          "or one of: monthGrid, fullCalendarGrid, calendarMonthGrid."
      );
      return;
    }

    const anchor = new Date(state.anchorMonth); // should be first of month
    const title = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    if (monthTitleBox) monthTitleBox.textContent = title;

    // Build weekday header + padded grid
    container.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "month-wrap";

    const header = document.createElement("div");
    header.className = "month-weekdays";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((w) => {
      const h = document.createElement("div");
      h.className = "weekday";
      h.textContent = w;
      header.appendChild(h);
    });

    const grid = document.createElement("div");
    grid.className = "month-grid";

    const first = startOfMonth(anchor);
    const last = endOfMonth(anchor);

    const firstDow = first.getDay(); // 0=Sun
    const daysInMonth = last.getDate();

    // Leading padding days (previous month)
    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      pad.innerHTML = `<span class="num"></span>`;
      grid.appendChild(pad);
    }

    // Month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${first.getFullYear()}-${pad2(first.getMonth() + 1)}-${pad2(day)}`;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (dateStr === state.selectedDate) cell.classList.add("active");
      if (state.jobs.some((j) => j.date === dateStr)) cell.classList.add("has-job");

      cell.innerHTML = `<span class="num">${day}</span>`;

      cell.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        // Go to day workspace when you pick a date in the full calendar
        setActiveView("day");
      });

      grid.appendChild(cell);
    }

    // Trailing padding to complete last week row
    const totalCells = firstDow + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      pad.innerHTML = `<span class="num"></span>`;
      grid.appendChild(pad);
    }

    wrap.appendChild(header);
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }

  // ===== Day Workspace =====
  function renderDayWorkspace() {
    // Minimal: set context line; you can expand later
    const ctx = $("#contextLine");
    if (ctx) ctx.textContent = `Day Workspace: ${state.selectedDate}`;

    // If you have a day workspace table, hook it here later.
  }

  // ===== Job Modal =====
  function bindJobModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    const closeBtn = $("#jobModalClose");
    const cancelBtn = $("#jobCancel");
    const saveBtn = $("#jobSave");

    const close = () => closeJobModal();

    if (overlay) overlay.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (cancelBtn) cancelBtn.addEventListener("click", close);

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        try {
          saveJobFromModal();
          closeJobModal();
          rerenderActive();
        } catch (e) {
          warn("Save job failed:", e);
        }
      });
    }

    // ESC support
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function openJobModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (!overlay || !modal) {
      warn("Job modal elements missing (#modalOverlay, #jobModal).");
      return;
    }

    // Prefill
    const d = $("#jobDate");
    const c = $("#jobCustomer");
    const p = $("#jobPickup");
    const dr = $("#jobDropoff");
    const a = $("#jobAmount");
    const n = $("#jobNotes");

    if (d) d.value = state.selectedDate;
    if (c) c.value = "";
    if (p) p.value = "";
    if (dr) dr.value = "";
    if (a) a.value = "0";
    if (n) n.value = "";

    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeJobModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (overlay) overlay.hidden = true;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function saveJobFromModal() {
    const d = $("#jobDate");
    const c = $("#jobCustomer");
    const p = $("#jobPickup");
    const dr = $("#jobDropoff");
    const a = $("#jobAmount");
    const n = $("#jobNotes");

    const job = {
      id: makeJobId(),
      date: d?.value || state.selectedDate,
      customer: c?.value?.trim() || "",
      pickup: p?.value?.trim() || "",
      dropoff: dr?.value?.trim() || "",
      amount: Number(a?.value || 0),
      notes: n?.value?.trim() || "",
    };

    state.jobs.push(job);
    saveState();
  }

  function makeJobId() {
    // Simple incremental-ish ID based on count
    const num = state.jobs.length + 1;
    return `J-${pad2(Math.floor(num / 100))}${pad2(num % 100)}`.replace("J-00", "J-");
  }

  // ===== Storage pill =====
  function updateStoragePill() {
    const el = $("#storagePill");
    if (!el) return;

    // Rough size estimate
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    const kb = Math.max(1, Math.round(raw.length / 1024));
    el.textContent = `Local Storage: ON · ${kb} KB`;
  }

  // ===== Tiny toast fallback =====
  function toast(msg) {
    // If you later add a toast UI, wire it here.
    log(msg);
  }

  // ===== Init =====
  function init() {
    // make badge truthful: only set loaded after init finishes
    setJSStatus("JS: running…", "ok");

    bindNav();
    bindToolbar();
    bindJobModal();
    updateStoragePill();

    // Ensure one view is active on load (dashboard by default)
    // If your HTML already marks a .view.active, keep it.
    const active = $(".view.active");
    if (!active) setActiveView("dashboard");
    else rerenderActive();

    setJSStatus("JS: loaded", "ok");
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (e) {
      hardFail(e);
    }
  });
})();
