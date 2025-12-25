/* FleetPro Foundation JS
   - Day-centric calendar
   - Dashboard + Calendar + Day Workspace
   - Scrollable toolbar (CSS handles scroll; JS just wires behavior)
   - Spreadsheet-style editable tables
   - LocalStorage persistence
*/

const STORAGE_KEY = "fleetpro_foundation_state_v1";

// -------------------- STATE --------------------
const state = loadState() ?? seedState();

const ui = {
  activeView: "dashboard",
  activeDate: isoDate(new Date()),
  calendarMonth: monthStartISO(new Date()),
  activeTab: "jobs",
};

// -------------------- BOOT --------------------
document.addEventListener("DOMContentLoaded", () => {
  // Clock
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);

  // Ensure active day exists
  ensureDay(ui.activeDate);
  saveState();

  // Sidebar nav buttons
  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Toolbar buttons
  const btnToday = document.getElementById("btnToday");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnAddJob = document.getElementById("btnAddJob");
  const btnAddReceipt = document.getElementById("btnAddReceipt");
  const btnAddNote = document.getElementById("btnAddNote");

  btnToday?.addEventListener("click", () => {
    ui.activeDate = isoDate(new Date());
    ui.calendarMonth = monthStartISO(new Date());
    ensureDay(ui.activeDate);
    saveState();
    renderAll();
  });

  btnPrev?.addEventListener("click", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, -1);
      renderCalendar();
      renderDashboard(); // month snapshot updates
    } else {
      const d = new Date(ui.activeDate);
      d.setDate(d.getDate() - 1);
      ui.activeDate = isoDate(d);
      ensureDay(ui.activeDate);
      saveState();
      setView("day");
      renderDay();
    }
  });

  btnNext?.addEventListener("click", () => {
    if (ui.activeView === "calendar") {
      ui.calendarMonth = addMonths(ui.calendarMonth, 1);
      renderCalendar();
      renderDashboard();
    } else {
      const d = new Date(ui.activeDate);
      d.setDate(d.getDate() + 1);
      ui.activeDate = isoDate(d);
      ensureDay(ui.activeDate);
      saveState();
      setView("day");
      renderDay();
    }
  });

  btnAddJob?.addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addJob(ui.activeDate);
    setView("day");
    setTab("jobs");
  });

  btnAddReceipt?.addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, {
      type: "receipt",
      source: "driver",
      linkedEntity: "driver",
      rawData: "Vendor=, Amount=, Category=",
      approved: "false",
    });
    setView("day");
    setTab("records");
  });

  btnAddNote?.addEventListener("click", () => {
    ensureDay(ui.activeDate);
    addRecord(ui.activeDate, {
      type: "note",
      source: "dispatcher",
      linkedEntity: "day",
      rawData: "Note=",
      approved: "true",
    });
    setView("day");
    setTab("records");
  });

  // Dashboard shortcuts
  document.getElementById
