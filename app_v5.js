/* =========================================================
   Move-Master.OS — apps_v5.js (STABLE BASELINE)
   - Works with your exact HTML
   - No modules, no imports
   - GitHub Pages safe
   - Restores routing + calendar rendering
   ========================================================= */

(() => {
  "use strict";

  /* ---------- PROOF OF LIFE ---------- */
  const pill = document.getElementById("jsPill");
  if (pill) {
    pill.classList.remove("bad");
    pill.classList.add("ok");
    pill.textContent = "JS: executing…";
  }

  /* ---------- HELPERS ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad2 = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a,b) =>
    a.getFullYear()===b.getFullYear() &&
    a.getMonth()===b.getMonth() &&
    a.getDate()===b.getDate();

  const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  /* ---------- STATE ---------- */
  const state = {
    view: "dashboard",
    today: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    // Placeholder data so UI actually renders
    jobs: [],
    drivers: [],
    trucks: []
  };

  /* ---------- ROUTER ---------- */
  function setView(view) {
    state.view = view;

    $$('[id^="view-"]').forEach(v => v.classList.remove("active"));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add("active");

    $$("[data-view]").forEach(b =>
      b.classList.toggle("active", b.dataset.view === view)
    );

    render();
  }

  /* ---------- NAV BINDINGS ---------- */
  function bindNav() {
    $$("[data-view]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault();
        setView(btn.dataset.view);
      });
    });

    $("#btnToday")?.addEventListener("click", () => {
      state.today = startOfDay(new Date());
      state.monthCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
      render();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor.setMonth(state.monthCursor.getMonth() - 1);
      } else {
        state.today.setDate(state.today.getDate() - 1);
        state.monthCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
      }
      render();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor.setMonth(state.monthCursor.getMonth() + 1);
      } else {
        state.today.setDate(state.today.getDate() + 1);
        state.monthCursor = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
      }
      render();
    });
  }

  /* ---------- DASHBOARD ---------- */
  function renderDashboard() {
    $("#todayLine").textContent = ymd(state.today);
    $("#todayStats").innerHTML = `
      <div><strong>0</strong> jobs today</div>
      <div>Revenue: <strong>$0.00</strong></div>
    `;

    $("#monthSnapshot").innerHTML = `
      <div><strong>${MONTHS[state.monthCursor.getMonth()]} ${state.monthCursor.getFullYear()}</strong></div>
      <div>Jobs: 0</div>
      <div>Revenue: $0.00</div>
    `;

    renderQuickCalendar();
  }

  /* ---------- QUICK CALENDAR ---------- */
  function renderQuickCalendar() {
    const box = $("#dashboardCalendar");
    if (!box) return;

    box.innerHTML = "";
    const y = state.today.getFullYear();
    const m = state.today.getMonth();
    const days = new Date(y, m + 1, 0).getDate();

    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.textContent = d;
      if (sameDay(date, state.today)) btn.classList.add("active");

      btn.addEventListener("click", () => {
        state.today = startOfDay(date);
        setView("day");
      });

      box.appendChild(btn);
    }
  }

  /* ---------- FULL CALENDAR ---------- */
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    label.textContent = `${MONTHS[m]} ${y}`;
    grid.innerHTML = "";

    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      grid.appendChild(h);
    });

    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < first; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d);
      const cell = document.createElement("button");
      cell.className = "day";
      if (sameDay(date, state.today)) cell.classList.add("selected");

      cell.innerHTML = `<div class="num">${d}</div>`;
      cell.addEventListener("click", () => {
        state.today = startOfDay(date);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  /* ---------- DAY WORKSPACE ---------- */
  function renderDay() {
    $("#dayTitle").textContent = `Day Workspace – ${ymd(state.today)}`;
    $("#dayJobsList").innerHTML =
      `<div class="muted empty">No jobs yet.</div>`;
    $("#dayReceiptsList").innerHTML =
      `<div class="muted empty">No receipts yet.</div>`;
  }

  /* ---------- PLACEHOLDER PAGES ---------- */
  function simplePanel(id, title) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="panel">
        <div class="panel-title">${title}</div>
        <div class="muted">Ready.</div>
      </div>
    `;
  }

  /* ---------- RENDER SWITCH ---------- */
  function render() {
    $("#contextLine").textContent =
      state.view === "dashboard" ? "Dashboard" :
      state.view === "calendar" ? "Calendar" :
      state.view === "day" ? "Day Workspace" :
      state.view.charAt(0).toUpperCase() + state.view.slice(1);

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") simplePanel("view-drivers","Drivers");
    if (state.view === "trucks") simplePanel("view-trucks","Trucks");
    if (state.view === "dispatch") simplePanel("view-dispatch","Dispatch");
    if (state.view === "finance") simplePanel("view-finance","Finance");
    if (state.view === "inventory") simplePanel("view-inventory","Inventory");
    if (state.view === "scanner") simplePanel("view-scanner","AI Scanner");
  }

  /* ---------- BOOT ---------- */
  function init() {
    bindNav();
    setView("dashboard");

    if (pill) pill.textContent = "JS: ready ✅";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
