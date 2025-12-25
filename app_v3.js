/* =========================================================
   FleetPro / Move-Master.OS — app_v4.js
   - Fix: sidebar buttons not opening pages (supports ALL views)
   - Fix: honest JS badge
   - Calendar month render
   - Day workspace notes (normal typing)
   - Dashboard quick actions
   - GH Pages safe relative paths (index.html uses ./app_v4.js)
   ========================================================= */

(() => {
  "use strict";

  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

  const STORAGE_KEY = "fleetpro_state_v4";

  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthLabel = d => d.toLocaleString(undefined, { month: "long", year: "numeric" });

  const state = {
    view: "dashboard",
    calCursor: new Date(),     // month being viewed
    selectedDate: new Date(),  // day in workspace
    data: {}                  // data[YYYY-MM-DD] = { notes:"" }
  };

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = safeParse(raw, null);
    if (!s) return;
    Object.assign(state, s);
    // revive dates
    state.calCursor = new Date(state.calCursor);
    state.selectedDate = new Date(state.selectedDate);
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setBadgeLoaded() {
    const b = $("#jsStatus");
    if (!b) return;
    b.textContent = "JS: loaded";
    b.classList.remove("bad");
    b.classList.add("good");
  }

  function setContext(title, sub) {
    $("#contextTitle").textContent = title;
    $("#contextSub").textContent = sub;
  }

  function markActiveNav(view) {
    $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  }

  function switchView(view) {
    state.view = view;
    save();

    $$(".view").forEach(v => (v.hidden = true));
    const page = $("#" + view);
    if (page) page.hidden = false;

    markActiveNav(view);

    // Context labels
    const map = {
      dashboard: ["Operations", "Foundation mode (Smart)"],
      calendar: ["Operations", "Calendar navigation (Month)"],
      day: ["Operations", `Day Workspace: ${ymd(state.selectedDate)}`],
      drivers: ["Drivers", "Directory (placeholder)"],
      trucks: ["Trucks", "Fleet units (placeholder)"],
      dispatch: ["Dispatch", "Assignments (placeholder)"],
      finance: ["Finance", "Receipts / payouts (placeholder)"],
      inventory: ["Inventory", "Audit (placeholder)"],
      ai: ["AI Scanner", "Uploads later (placeholder)"]
    };
    const [t, s] = map[view] || ["Operations", "—"];
    setContext(t, s);

    // Render where needed
    if (view === "dashboard") renderDashboard();
    if (view === "calendar") renderCalendar();
    if (view === "day") renderDay();
  }

  /* ---------------- Clock ---------------- */
  function startClock() {
    const el = $("#clock");
    const tick = () => {
      const d = new Date();
      el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard() {
    const today = new Date();
    $("#dashDate").textContent = today.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const keys = Object.keys(state.data || {});
    $("#mDays").textContent = String(keys.length);

    // very simple counters for now
    $("#mJobs").textContent = "0";
    $("#mReceipts").textContent = "0";
    $("#mExpenses").textContent = "$0";
    $("#dashCounts").textContent = "0 job(s), 0 receipt(s), 0 driver(s), 0 truck(s)";
  }

  /* ---------------- Calendar ---------------- */
  function renderCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) return;

    $("#calMonth").textContent = monthLabel(state.calCursor);

    grid.innerHTML = "";

    const first = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth(), 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 0).getDate();

    // Blank leading cells
    for (let i = 0; i < startDow; i++) {
      const spacer = document.createElement("div");
      spacer.className = "day";
      spacer.style.visibility = "hidden";
      grid.appendChild(spacer);
    }

    const todayKey = ymd(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth(), d);
      const key = ymd(dateObj);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day";
      btn.textContent = String(d);

      if (key === todayKey) btn.classList.add("today");

      btn.addEventListener("click", () => {
        state.selectedDate = dateObj;
        save();
        switchView("day");
      });

      grid.appendChild(btn);
    }
  }

  /* ---------------- Day Workspace ---------------- */
  function ensureDay(key) {
    if (!state.data) state.data = {};
    if (!state.data[key]) state.data[key] = { notes: "" };
  }

  function renderDay() {
    const key = ymd(state.selectedDate);
    $("#dayTitle").textContent = key;

    ensureDay(key);

    const ta = $("#dayNotes");
    ta.value = state.data[key].notes || "";

    ta.oninput = () => {
      state.data[key].notes = ta.value;
      save();
    };
  }

  /* ---------------- Toolbar ---------------- */
  function wireToolbar() {
    $("#btnToday").addEventListener("click", () => {
      state.selectedDate = new Date();
      state.calCursor = new Date(); // jump calendar to this month
      save();
      if (state.view === "calendar") renderCalendar();
      if (state.view === "day") renderDay();
      if (state.view === "dashboard") renderDashboard();
      setContext($("#contextTitle").textContent, $("#contextSub").textContent);
    });

    $("#btnPrev").addEventListener("click", () => {
      // month nav only makes sense on calendar
      state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() - 1, 1);
      save();
      if (state.view === "calendar") renderCalendar();
    });

    $("#btnNext").addEventListener("click", () => {
      state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 1);
      save();
      if (state.view === "calendar") renderCalendar();
    });

    // placeholders: keep them clickable without breaking
    $("#btnAddJob").addEventListener("click", () => {
      // future: open jobs sheet tab inside Day Workspace
      switchView("day");
    });
    $("#btnAddReceipt").addEventListener("click", () => switchView("day"));
    $("#btnAddNote").addEventListener("click", () => switchView("day"));
  }

  /* ---------------- Nav ---------------- */
  function wireNav() {
    // Sidebar navigation
    $$(".navbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (!view) return;
        switchView(view);
      });
    });

    // Dashboard quick buttons (Open Today / Open Calendar)
    $$(".btn[data-goto]").forEach(b => {
      b.addEventListener("click", () => {
        const goto = b.dataset.goto;
        if (goto === "day") {
          state.selectedDate = new Date();
          save();
        }
        switchView(goto);
      });
    });

    // Day buttons
    $("#saveDay").addEventListener("click", () => save());
    $("#clearDay").addEventListener("click", () => {
      const key = ymd(state.selectedDate);
      ensureDay(key);
      state.data[key].notes = "";
      $("#dayNotes").value = "";
      save();
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", () => {
    load();
    startClock();

    // Make storage display truthful
    $("#lsState").textContent = "ON";

    wireNav();
    wireToolbar();

    // Always render dashboard + calendar initially
    renderDashboard();
    renderCalendar();

    // Go to saved view
    const initial = state.view || "dashboard";
    switchView(initial);

    // Flip badge only after JS is executing
    setBadgeLoaded();
  });

})();
