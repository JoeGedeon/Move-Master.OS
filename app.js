/* FleetPro Foundation JS (stable iPad editing + scroll + persistence)
   - Project-safe loading
   - Sidebar + toolbar scroll handled by CSS
   - Calendar month view -> Day Workspace
   - Spreadsheet tables with contenteditable cells
   - Fixes "one character then kicks me out": NO re-render on keystroke
   - Tab/Enter navigation between cells
   - Horizontal table scroll enabled by CSS (.table-wrap, width:max-content)
*/

window.__fleetpro_boot = true;

(() => {
  const STORAGE_KEY = "fleetpro_foundation_v3";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- State ----------
  const now = new Date();
  const todayISO = toISODate(now);

  const state = loadState() || {
    selectedDate: todayISO,
    calendarCursor: todayISO.slice(0, 7) + "-01", // first of current month
    days: {} // iso -> { jobs:[], drivers:[], trucks:[], records:[], aiNote:"" }
  };

  // ---------- Boot UI ----------
  setJsIndicator("JS: loaded", true);
  startClock();

  bindNavigation();
  bindToolbar();
  bindTabs();
  bindDashboardButtons();

  // Initial render
  renderAll();

  // ---------- Helpers ----------
  function setJsIndicator(text, ok) {
    const el = $("#jsIndicator");
    if (!el) return;
    el.textContent = text;
    if (ok) {
      el.style.borderColor = "rgba(80,255,160,0.55)";
      el.style.color = "rgba(180,255,220,0.95)";
    }
  }

  function startClock() {
    const el = $("#clock");
    const tick = () => {
      const d = new Date();
      const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (el) el.textContent = t;
    };
    tick();
    setInterval(tick, 1000);
  }

  function toISODate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error("Save failed:", e);
      }
    }, 200);
  }

  function ensureDay(iso) {
    if (!state.days[iso]) {
      state.days[iso] = { jobs: [], drivers: [], trucks: [], records: [], aiNote: "" };
    }
    return state.days[iso];
  }

  function monthLabelFromISO(iso) {
    const d = parseISO(iso);
    return d.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  function setContext(text) {
    const el = $("#activeContext");
    if (el) el.textContent = text;
  }

  // ---------- Navigation / Views ----------
  function bindNavigation() {
    $("#nav")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      const view = btn.dataset.view;
      if (!view) return;
      switchView(view);
    });
  }

  function switchView(viewName) {
    $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${viewName}`));

    if (viewName === "calendar") {
      setContext("Calendar navigation (Month)");
      renderCalendar();
    } else if (viewName === "day") {
      setContext(`Day Workspace: ${state.selectedDate}`);
      renderDay();
