/* FleetPro / Move-Master.OS
   app_v3.js
   Foundation-safe JS loader + view switching
*/

(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

  // ---------- State ----------
  const state = {
    view: "dashboard",
    selectedDate: new Date().toISOString().slice(0, 10)
  };

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    console.log("FleetPro app_v3.js loaded");

    markJSLoaded();
    bindNav();
    bindActionButtons();
    switchView("dashboard");
  }

  // ---------- Visual confirmation ----------
  function markJSLoaded() {
    const badge = $(".system-live");
    if (badge) {
      badge.textContent = "SYSTEM LIVE";
      badge.classList.add("live");
    } else {
      // fallback hard proof
      alert("app_v3.js loaded");
    }
  }

  // ---------- Navigation ----------
  function bindNav() {
    $$(".sidebar button, .sidebar a").forEach(btn => {
      btn.addEventListener("click", e => {
        const view = btn.dataset.view;
        if (!view) return;
        e.preventDefault();
        switchView(view);
      });
    });
  }

  function switchView(view) {
    state.view = view;

    $$(".view").forEach(v => v.style.display = "none");
    const active = $("#" + view);
    if (active) active.style.display = "block";

    setTitle(view);
  }

  function setTitle(view) {
    const title = $("#contextTitle");
    if (!title) return;

    const map = {
      dashboard: "Operations",
      calendar: "Calendar",
      day: "Day Workspace",
      drivers: "Drivers",
      trucks: "Trucks",
      dispatch: "Dispatch",
      finance: "Finance",
      inventory: "Inventory",
      ai: "AI Scanner"
    };

    title.textContent = map[view] || "FleetPro";
  }

  // ---------- Buttons ----------
  function bindActionButtons() {
    const openToday = $("#openToday");
    if (openToday) {
      openToday.addEventListener("click", () => {
        switchView("day");
        renderDay();
      });
    }

    const openCalendar = $("#openCalendar");
    if (openCalendar) {
      openCalendar.addEventListener("click", () => {
        switchView("calendar");
      });
    }
  }

  // ---------- Day Workspace ----------
  function renderDay() {
    const title = $("#dayTitle");
    if (title) title.textContent = state.selectedDate;

    const loading = $("#dayLoading");
    if (loading) loading.style.display = "none";
  }

})();
