/* FleetPro / Move-Master.OS
   app_v3.js (foundation router + badge + basic actions)

   Fixes:
   - Correctly flips the "JS: not loaded" badge to "JS: loaded"
   - Sidebar view switching works
   - Open Today / Open Calendar works
   - Safe on GitHub Pages (no imports, no build tools)
*/

(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- State ----------
  const state = {
    view: "dashboard",
    selectedDate: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  };

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    try {
      setBadgeLoaded();
      startClock();
      bindSidebarNav();
      bindTopButtons();
      bindDashboardButtons();

      // Default view
      switchView("dashboard");
      refreshDashboard();

      console.log("[FleetPro] app_v3.js loaded OK");
    } catch (err) {
      console.error("[FleetPro] Boot error:", err);
      setBadgeError(err);
    }
  });

  // ---------- Badge / Status ----------
  function setBadgeLoaded() {
    const badge = $("#jsBadge");
    if (badge) {
      badge.textContent = "JS: loaded";
      badge.style.opacity = "1";
    }
    // If you also have any other status label, keep it green.
    const live = $(".status") || $(".system-live");
    if (live) live.classList.add("live");
  }

  function setBadgeError(err) {
    const badge = $("#jsBadge");
    if (badge) {
      badge.textContent = "JS: error";
      badge.style.opacity = "1";
      badge.title = String(err?.message || err);
    }
  }

  // ---------- Clock ----------
  function startClock() {
    const el = $("#clock");
    if (!el) return;

    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      el.textContent = `${hh}:${mm}:${ss}`;
    };

    tick();
    setInterval(tick, 1000);
  }

  // ---------- View switching ----------
  function bindSidebarNav() {
    // Sidebar buttons should have data-view="dashboard|calendar|day|drivers|trucks|dispatch|finance|inventory|ai"
    const navBtns = $$(".navbtn");
    navBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (!view) return;
        switchView(view);
      });
    });
  }

  function switchView(view) {
    state.view = view;

    // highlight active nav
    $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));

    // show/hide views
    // expects: #view-dashboard, #view-calendar, #view-day, #view-drivers, #view-trucks, #view-dispatch, #view-finance, #view-inventory, #view-ai
    $$(".view").forEach((v) => v.classList.remove("active"));
    const active = $(`#view-${view}`);
    if (active) active.classList.add("active");

    setContext(view);

    // basic render hooks
    if (view === "dashboard") refreshDashboard();
    if (view === "day") renderDayHeader();
    if (view === "calendar") renderCalendarTitleOnly();
  }

  function setContext(view) {
    const title = $("#contextTitle");
    const sub = $("#contextSubtitle");

    const map = {
      dashboard: ["Operations", "Foundation mode (Smart)"],
      calendar: ["Operations", "Calendar navigation (Month)"],
      day: ["Operations", `Day Workspace: ${state.selectedDate}`],
      drivers: ["Operations", "Drivers directory (coming next)"],
      trucks: ["Operations", "Trucks / Units (coming next)"],
      dispatch: ["Operations", "Dispatch (coming next)"],
      finance: ["Operations", "Finance (coming next)"],
      inventory: ["Operations", "Inventory (coming next)"],
      ai: ["Operations", "AI Scanner (coming next)"],
    };

    const [t, s] = map[view] || ["FleetPro", ""];
    if (title) title.textContent = t;
    if (sub) sub.textContent = s;
  }

  // ---------- Buttons ----------
  function bindTopButtons() {
    // These may or may not exist depending on your HTML revision. Bind safely.
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    if (btnToday) btnToday.addEventListener("click", () => {
      state.selectedDate = new Date().toISOString().slice(0, 10);
      // if in day view, refresh header
      if (state.view === "day") renderDayHeader();
      // if in dashboard, refresh
      if (state.view === "dashboard") refreshDashboard();
    });

    if (btnPrev) btnPrev.addEventListener("click", () => {
      // For now: move selectedDate back 1 day (foundation)
      state.selectedDate = shiftDate(state.selectedDate, -1);
      if (state.view === "day") renderDayHeader();
      if (state.view === "dashboard") refreshDashboard();
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      state.selectedDate = shiftDate(state.selectedDate, +1);
      if (state.view === "day") renderDayHeader();
      if (state.view === "dashboard") refreshDashboard();
    });
  }

  function bindDashboardButtons() {
    const openToday = $("#openToday");
    const openCalendar = $("#openCalendar");

    if (openToday) openToday.addEventListener("click", () => {
      switchView("day");
    });

    if (openCalendar) openCalendar.addEventListener("click", () => {
      switchView("calendar");
    });
  }

  // ---------- Dashboard ----------
  function refreshDashboard() {
    const line = $("#todayLine");
    if (line) {
      const d = new Date(state.selectedDate + "T00:00:00");
      line.textContent = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }

    // placeholders (keep your UI stable)
    const pressures = $("#pressureList");
    if (pressures) {
      pressures.innerHTML = `
        <li>Overbooked drivers: <span class="muted">AI later</span></li>
        <li>Truck maintenance conflicts: <span class="muted">rules later</span></li>
        <li>Receipts missing: <span class="muted">driver app later</span></li>
      `;
    }
  }

  // ---------- Day Workspace ----------
  function renderDayHeader() {
    const title = $("#dayTitle");
    if (title) {
      const d = new Date(state.selectedDate + "T00:00:00");
      title.textContent = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  // ---------- Calendar (foundation placeholder) ----------
  function renderCalendarTitleOnly() {
    const el = $("#calTitle");
    if (!el) return;
    const d = new Date(state.selectedDate + "T00:00:00");
    el.textContent = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  // ---------- Date util ----------
  function shiftDate(ymd, deltaDays) {
    const d = new Date(ymd + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }
})();
