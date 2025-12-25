/* FleetPro / Move-Master.OS — app_v5.js (FULL)
   - Stable view switching (sidebar + toolbar buttons)
   - Dashboard quick calendar
   - Full month calendar (Calendar view) — populated
   - Day workspace shell
   - Add Job modal (localStorage)
   - Honest JS badge: "loaded" only after init succeeds
*/
(() => {
  "use strict";

  // ========= Helpers =========
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromYMD = (s) => {
    if (!s || typeof s !== "string") return new Date();
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };

  const clampDate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const addDays = (d, n) => {
    const x = clampDate(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

  const monthTitle = (d) =>
    d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const weekdayShort = () => {
    // Sun..Sat
    const base = new Date(2025, 0, 5); // Sunday-ish anchor
    return Array.from({ length: 7 }, (_, i) =>
      addDays(base, i).toLocaleDateString(undefined, { weekday: "short" })
    );
  };

  // ========= State =========
  const STORAGE_KEY = "fleetpro_state_v5";
  const DEFAULT_STATE = {
    selectedDate: ymd(new Date()),
    activeView: "dashboard",
    jobs: [], // {id, date, customer, pickup, dropoff, amount, notes, createdAt}
  };

  let state = { ...DEFAULT_STATE };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      };
    } catch (e) {
      console.warn("loadState failed", e);
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStoragePill();
    } catch (e) {
      console.warn("saveState failed", e);
    }
  }

  // ========= Badge =========
  function setJSStatus(status, msg) {
    const pill = $("#jsPill");
    if (!pill) return;
    // status: "notloaded" | "loaded" | "error"
    if (status === "loaded") {
      pill.textContent = "JS: loaded";
      pill.classList.remove("error");
      pill.classList.add("ok");
      return;
    }
    if (status === "error") {
      pill.textContent = `JS: error`;
      pill.classList.remove("ok");
      pill.classList.add("error");
      if (msg) console.error(msg);
      return;
    }
    pill.textContent = "JS: not loaded";
    pill.classList.remove("ok", "error");
  }

  // ========= UI Hooks =========
  const UI = {
    // Topbar
    contextLine: null,

    // Toolbar buttons
    btnToday: null,
    btnPrev: null,
    btnNext: null,
    btnAddJob: null,
    btnAddReceipt: null,
    btnAddNote: null,
    btnExport: null,
    btnSync: null,

    // Sidebar nav (buttons with data-view)
    navButtons: [],

    // Views
    viewsRoot: null,
    viewEls: new Map(), // key -> element

    // Dashboard bits
    todayLine: null,
    monthSnapshot: null,
    dashboardCalendar: null,

    // Full calendar bits
    calendarTitle: null,
    calendarGrid: null,

    // Day workspace bits
    dayTitle: null,
    dayTableBody: null,

    // Storage pill
    storagePill: null,

    // Modal
    overlay: null,
    jobModal: null,
    jobModalClose: null,
    jobCancel: null,
    jobSave: null,
    jobDate: null,
    jobCustomer: null,
    jobPickup: null,
    jobDropoff: null,
    jobAmount: null,
    jobNotes: null,
    jobError: null,
  };

  function cacheDOM() {
    // topbar
    UI.contextLine = $("#contextLine");

    // toolbar
    UI.btnToday = $("#btnToday");
    UI.btnPrev = $("#btnPrev");
    UI.btnNext = $("#btnNext");
    UI.btnAddJob = $("#btnAddJob");
    UI.btnAddReceipt = $("#btnAddReceipt");
    UI.btnAddNote = $("#btnAddNote");
    UI.btnExport = $("#btnExport");
    UI.btnSync = $("#btnSync");

    // sidebar nav
    UI.navButtons = $$(".navbtn[data-view]");

    // views
    UI.viewsRoot = $(".views");
    const knownViews = [
      "dashboard",
      "calendar",
      "day",
      "drivers",
      "trucks",
      "dispatch",
      "finance",
      "inventory",
      "ai",
    ];
    knownViews.forEach((k) => UI.viewEls.set(k, $(`#view-${k}`)));

    // dashboard
    UI.todayLine = $("#todayLine");
    UI.monthSnapshot = $("#monthSnapshot");
    UI.dashboardCalendar = $("#dashboardCalendar");

    // calendar
    UI.calendarTitle = $("#calendarTitle");
    UI.calendarGrid = $("#calendarGrid");

    // day workspace
    UI.dayTitle = $("#dayTitle");
    UI.dayTableBody = $("#dayJobsBody");

    // pills
    UI.storagePill = $("#storagePill");

    // modal
    UI.overlay = $("#modalOverlay");
    UI.jobModal = $("#jobModal");
    UI.jobModalClose = $("#jobModalClose");
    UI.jobCancel = $("#jobCancel");
    UI.jobSave = $("#jobSave");
    UI.jobDate = $("#jobDate");
    UI.jobCustomer = $("#jobCustomer");
    UI.jobPickup = $("#jobPickup");
    UI.jobDropoff = $("#jobDropoff");
    UI.jobAmount = $("#jobAmount");
    UI.jobNotes = $("#jobNotes");
    UI.jobError = $("#jobError");
  }

  function updateStoragePill() {
    if (!UI.storagePill) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || "";
      const kb = Math.max(1, Math.round(raw.length / 1024));
      UI.storagePill.textContent = `Local Storage: ON · ${kb} KB`;
    } catch {
      UI.storagePill.textContent = `Local Storage: —`;
    }
  }

  // ========= View Switching =========
  function setActiveNav(viewKey) {
    UI.navButtons.forEach((b) => {
      const v = b.getAttribute("data-view");
      b.classList.toggle("active", v === viewKey);
    });
  }

  function hideAllViews() {
    // Use "active" class if your CSS relies on it
    for (const el of UI.viewEls.values()) {
      if (el) el.classList.remove("active");
    }
  }

  function showView(viewKey) {
    state.activeView = viewKey;
    saveState();

    hideAllViews();
    const el = UI.viewEls.get(viewKey);
    if (el) el.classList.add("active");

    setActiveNav(viewKey);
    updateContextLine();

    // Crucial: render when the view becomes visible
    if (viewKey === "dashboard") {
      renderDashboard();
    } else if (viewKey === "calendar") {
      renderMonthCalendar();
    } else if (viewKey === "day") {
      renderDayWorkspace();
    } else {
      renderPlaceholder(viewKey);
    }
  }

  function updateContextLine() {
    if (!UI.contextLine) return;
    const d = fromYMD(state.selectedDate);
    const base = UI.contextLine.textContent || "";

    if (state.activeView === "dashboard") {
      UI.contextLine.textContent = "Foundation mode (Smart)";
      return;
    }
    if (state.activeView === "calendar") {
      UI.contextLine.textContent = "Calendar navigation (Month)";
      return;
    }
    if (state.activeView === "day") {
      UI.contextLine.textContent = `Day Workspace: ${state.selectedDate}`;
      return;
    }
    // fallback
    UI.contextLine.textContent = base || "Foundation mode (Smart)";
  }

  // ========= Rendering =========
  function renderDashboard() {
    // Today line
    const d = fromYMD(state.selectedDate);
    if (UI.todayLine) {
      const nice = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      });
      UI.todayLine.textContent = nice;
    }

    // Snapshot
    if (UI.monthSnapshot) {
      const m0 = startOfMonth(d);
      const m1 = endOfMonth(d);
      const jobsInMonth = state.jobs.filter((j) => {
        const jd = fromYMD(j.date);
        return jd >= m0 && jd <= m1;
      }).length;
      UI.monthSnapshot.textContent = `Jobs: ${jobsInMonth} · Receipts: 0 · Expenses: $0`;
    }

    renderQuickDashboardCalendar();
  }

  function renderQuickDashboardCalendar() {
    if (!UI.dashboardCalendar) return;

    const d = fromYMD(state.selectedDate);
    const mStart = startOfMonth(d);
    const mEnd = endOfMonth(d);
    const days = mEnd.getDate();

    // Clear + rebuild simple grid of day pills (1..days)
    UI.dashboardCalendar.innerHTML = "";

    for (let day = 1; day <= days; day++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-pill";
      btn.textContent = String(day);

      const cellDate = new Date(d.getFullYear(), d.getMonth(), day);
      const cellYMD = ymd(cellDate);

      if (cellYMD === state.selectedDate) btn.classList.add("selected");

      // mark if jobs exist
      const hasJobs = state.jobs.some((j) => j.date === cellYMD);
      if (hasJobs) btn.classList.add("has-jobs");

      btn.addEventListener("click", () => {
        state.selectedDate = cellYMD;
        saveState();
        renderDashboard();
      });

      UI.dashboardCalendar.appendChild(btn);
    }
  }

  function renderMonthCalendar() {
    if (!UI.calendarGrid) return;

    const d = fromYMD(state.selectedDate);
    const focus = startOfMonth(d);
    const mStart = startOfMonth(focus);
    const mEnd = endOfMonth(focus);

    if (UI.calendarTitle) UI.calendarTitle.textContent = monthTitle(focus);

    UI.calendarGrid.innerHTML = "";

    // Weekday header row
    const header = document.createElement("div");
    header.className = "cal-head";
    weekdayShort().forEach((w) => {
      const h = document.createElement("div");
      h.className = "cal-hcell";
      h.textContent = w;
      header.appendChild(h);
    });
    UI.calendarGrid.appendChild(header);

    // Build days grid (start from Sunday of first week)
    const startDow = mStart.getDay(); // 0=Sun
    const gridStart = addDays(mStart, -startDow);

    // 6 weeks to be safe (42 cells)
    const grid = document.createElement("div");
    grid.className = "cal-grid";

    for (let i = 0; i < 42; i++) {
      const cellDate = addDays(gridStart, i);
      const cellYMD = ymd(cellDate);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell";

      // in/out month styling
      if (cellDate < mStart || cellDate > mEnd) cell.classList.add("outside");

      // selected
      if (cellYMD === state.selectedDate) cell.classList.add("selected");

      // job marker
      const count = state.jobs.filter((j) => j.date === cellYMD).length;
      if (count > 0) cell.classList.add("has-jobs");

      const top = document.createElement("div");
      top.className = "cal-daynum";
      top.textContent = String(cellDate.getDate());

      const dot = document.createElement("div");
      dot.className = "cal-dot";
      dot.textContent = count > 0 ? `• ${count}` : "";

      cell.appendChild(top);
      cell.appendChild(dot);

      cell.addEventListener("click", () => {
        state.selectedDate = cellYMD;
        saveState();

        // keep calendar rendered with selection updated
        renderMonthCalendar();

        // and optionally jump to day workspace
        showView("day");
      });

      grid.appendChild(cell);
    }

    UI.calendarGrid.appendChild(grid);
  }

  function renderDayWorkspace() {
    if (UI.dayTitle) {
      UI.dayTitle.textContent = `Day Workspace: ${state.selectedDate}`;
    }

    // If you don’t have a table yet, we fail silently.
    if (!UI.dayTableBody) return;

    const jobs = state.jobs
      .filter((j) => j.date === state.selectedDate)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    UI.dayTableBody.innerHTML = "";

    if (jobs.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "muted";
      td.textContent = "No jobs for this day yet.";
      tr.appendChild(td);
      UI.dayTableBody.appendChild(tr);
      return;
    }

    for (const j of jobs) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(j.id || "")}</td>
        <td>${escapeHTML(j.customer || "")}</td>
        <td>${escapeHTML(j.pickup || "")}</td>
        <td>${escapeHTML(j.dropoff || "")}</td>
        <td>${escapeHTML(String(j.amount ?? ""))}</td>
      `;
      UI.dayTableBody.appendChild(tr);
    }
