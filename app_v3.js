/* =========================================================
   FleetPro / Move-Master.OS
   app_v3.js — FOUNDATION SAFE BUILD
   =========================================================
   - Real inputs (no one-character curse)
   - Calendar + Day Workspace
   - View switching
   - LocalStorage persistence
   - HONEST JS loaded indicator
   ========================================================= */

(() => {
  "use strict";

  /* -------------------- DOM helpers -------------------- */
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

  /* -------------------- State -------------------- */
  const STORAGE_KEY = "fleetpro_state_v3";

  const state = {
    view: "dashboard",
    selectedDate: new Date(),
    data: {}
  };

  /* -------------------- Utilities -------------------- */
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
    } catch (e) {
      console.warn("Storage reset:", e);
    }
  }

  /* -------------------- Views -------------------- */
  function switchView(name) {
    state.view = name;
    $$(".view").forEach(v => v.hidden = true);
    const el = $("#" + name);
    if (el) el.hidden = false;
    save();
  }

  /* -------------------- Dashboard -------------------- */
  function renderDashboard() {
    $("#todayLabel").textContent = ymd(new Date());
  }

  /* -------------------- Calendar -------------------- */
  function renderCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) return;

    grid.innerHTML = "";
    const d = new Date(state.selectedDate);
    d.setDate(1);

    for (let i = 0; i < d.getDay(); i++) {
      grid.appendChild(document.createElement("div"));
    }

    while (d.getMonth() === state.selectedDate.getMonth()) {
      const cell = document.createElement("button");
      cell.className = "day";
      cell.textContent = d.getDate();
      const key = ymd(d);

      cell.onclick = () => {
        state.selectedDate = new Date(d);
        switchView("day");
        renderDay();
      };

      grid.appendChild(cell);
      d.setDate(d.getDate() + 1);
    }
  }

  /* -------------------- Day Workspace -------------------- */
  function renderDay() {
    const key = ymd(state.selectedDate);
    $("#dayTitle").textContent = key;

    if (!state.data[key]) {
      state.data[key] = { notes: "" };
    }

    const area = $("#dayNotes");
    area.value = state.data[key].notes;

    area.oninput = () => {
      state.data[key].notes = area.value;
      save();
    };
  }

  /* -------------------- Nav wiring -------------------- */
  function wireNav() {
    $$(".navbtn").forEach(btn => {
      btn.onclick = () => {
        switchView(btn.dataset.view);
        if (btn.dataset.view === "calendar") renderCalendar();
        if (btn.dataset.view === "dashboard") renderDashboard();
        if (btn.dataset.view === "day") renderDay();
      };
    });
  }

  /* -------------------- BOOT -------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    load();
    wireNav();
    switchView(state.view || "dashboard");
    renderDashboard();
    renderCalendar();

    // This is the ONLY indicator that matters
    const badge = $("#jsStatus");
    if (badge) {
      badge.textContent = "JS: loaded";
      badge.classList.remove("bad");
      badge.classList.add("good");
    }

    // Debug confirmation (can remove later)
    alert("app_v3.js loaded");
  });

})();
