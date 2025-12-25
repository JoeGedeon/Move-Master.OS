/* FleetPro / Move-Master.OS — app_v5.js
   Purpose:
   - Keep your current HTML/CSS layout
   - Restore rendering: Dashboard + Calendar + Day Workspace
   - Restore button wiring (sidebar + top toolbar)
   - Keep "JS: loaded" honest (only flips after init runs)
*/

(() => {
  "use strict";

  // -------------------------
  // Helpers
  // -------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",          // dashboard | calendar | day
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    // dayData["YYYY-MM-DD"] = { jobs: [...], receipts: [...], notes: "...", warnings: [...] }
    dayData: {}
  };

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);

    if (!st.dayData) st.dayData = {};
    if (!st.view) st.view = "dashboard";
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());

    return st;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateLocalStorageBadge();
  }

  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], receipts: [], notes: "", warnings: [] };
    }
    return state.dayData[dateStr];
  }

  function updateLocalStorageBadge() {
    const el = $("#localStorageBadge");
    if (!el) return;

    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
    const kb = Math.max(1, Math.round(bytes / 1024));

    el.textContent = `Local Storage: ON · ${kb} KB`;
  }

  // -------------------------
  // DOM references (keep flexible, don’t require HTML surgery)
  // -------------------------
  function getViews() {
    // supports either #dashboardView/#calendarView/#dayView
    // or <section id="dashboardView"> etc
    return {
      dashboard: $("#dashboardView") || $("#dashboard") || $("#dashView"),
      calendar: $("#calendarView") || $("#calendar") || $("#calView"),
      day: $("#dayView") || $("#dayWorkspaceView") || $("#dayWorkspace") || $("#day")
    };
  }

  function setJsBadgeLoaded(loaded) {
    // supports badge text "JS: loaded / JS: not loaded"
    const badge = $("#jsBadge") || $(".js-badge") || $("[data-js-badge]");
    if (!badge) return;

    badge.textContent = loaded ? "JS: loaded" : "JS: not loaded";
    badge.classList.toggle("loaded", !!loaded);
  }

  function setHeaderContext(text) {
    const ctx = $("#contextLine") || $("#contextLabel") || $("#context") || $("[data-context]");
    if (ctx) ctx.textContent = text;
  }

  function setTodayCardText(titleLine, subLine) {
    const title = $("#todayTitle") || $("#dashTodayTitle");
    const sub = $("#todaySub") || $("#dashTodaySub");
    const meta = $("#todayMeta") || $("#dashTodayMeta");

    if (title) title.textContent = titleLine || "Today";
    if (sub) sub.textContent = subLine || "";
    if (meta) meta.textContent = "";
  }

  // -------------------------
  // Navigation / Views
  // -------------------------
  function switchView(viewName) {
    state.view = viewName;
    saveState();

    const views = getViews();
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.style.display = (k === viewName) ? "" : "none";
    });

    // sidebar active state (supports .navbtn or sidebar <button>)
    $$(".navbtn, .sidebar button, .sidebar a").forEach(btn => {
      const v = btn.dataset.view || btn.getAttribute("data-view") || "";
      if (v) btn.classList.toggle("active", v === viewName);
    });

    // render after switching
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDayWorkspace();
  }

  // -------------------------
  // Calendar rendering
  // -------------------------
  function cursorToDate() {
    // "YYYY-MM"
    const [y, m] = state.calCursor.split("-").map(Number);
    return new Date(y, (m - 1), 1);
  }

  function setCursorFromDate(d) {
    state.calCursor = monthKey(d);
    saveState();
  }

  function renderCalendar() {
    const grid = $("#calendarGrid") || $("#calendar-grid") || $("#calGrid");
    const monthLabel = $("#calendarMonthLabel") || $("#calMonthLabel") || $("#monthLabel");

    if (!grid) {
      // If the grid isn’t found, don’t crash. Just keep dashboard alive.
      setHeaderContext("Calendar navigation (Month)");
      return;
    }

    const first = cursorToDate();
    const y = first.getFullYear();
    const m = first.getMonth();

    const monthName = first.toLocaleString(undefined, { month: "long", year: "numeric" });
    if (monthLabel) monthLabel.textContent = monthName;

    setHeaderContext("Calendar navigation (Month)");

    // build calendar starting Sunday
    const start = new Date(y, m, 1);
    const startDay = start.getDay(); // 0=Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // clear grid
    grid.innerHTML = "";

    // leading blanks
    for (let i = 0; i < startDay; i++) {
      const blank = document.createElement("div");
      blank.className = "day-tile empty";
      blank.innerHTML = `<div class="day-num"></div>`;
      grid.appendChild(blank);
    }

    // days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(y, m, day);
      const dateStr = ymd(dateObj);
      const d = ensureDay(dateStr);

      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "day-tile";
      tile.dataset.date = dateStr;

      // simple indicators
      const jobsCount = d.jobs.length;
      const hasWarnings = Array.isArray(d.warnings) && d.warnings.length > 0;

      tile.innerHTML = `
        <div class="day-num">${day}</div>
        <div class="day-badges">
          ${jobsCount ? `<span class="badge pill">${jobsCount} job</span>` : ""}
          ${hasWarnings ? `<span class="badge warn">warn</span>` : ""}
        </div>
      `;

      // selected highlight
      if (dateStr === state.selectedDate) tile.classList.add("selected");

      tile.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        switchView("day");
      });

      grid.appendChild(tile);
    }
  }

  // -------------------------
  // Dashboard rendering
  // -------------------------
  function computeMonthSnapshot() {
    const cursor = cursorToDate();
    const y = cursor.getFullYear();
    const m = cursor.getMonth();

    let jobs = 0;
    let receipts = 0;
    let warnings = 0;
    let daysStored = 0;

    for (const [dateStr, payload] of Object.entries(state.dayData)) {
      const [yy, mm] = dateStr.split("-").map(Number);
      if (yy === y && (mm - 1) === m) {
        daysStored++;
        jobs += (payload.jobs?.length || 0);
        receipts += (payload.receipts?.length || 0);
        warnings += (payload.warnings?.length || 0);
      }
    }

    return { jobs, receipts, warnings, daysStored };
  }

  function renderDashboard() {
    setHeaderContext("Foundation mode (Smart)");

    const dateObj = new Date(state.selectedDate + "T12:00:00");
    const nice = dateObj.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const day = ensureDay(state.selectedDate);
    const jobCount = day.jobs.length;
    const receiptCount = day.receipts.length;

    setTodayCardText("Today", nice);

    // If you have any counters on the dashboard:
    const dashCounts = $("#dashCounts") || $("#todayCounts") || $("#countsLine");
    if (dashCounts) {
      dashCounts.textContent = `${jobCount} job(s), ${receiptCount} receipt(s)`;
    }

    // Month snapshot tiles (supports several ids)
    const snap = computeMonthSnapshot();

    const elJobs = $("#snapJobs") || $("#monthJobs");
    const elReceipts = $("#snapReceipts") || $("#monthReceipts");
    const elWarnings = $("#snapWarnings") || $("#monthWarnings");
    const elDays = $("#snapDays") || $("#monthDaysStored");

    if (elJobs) elJobs.textContent = String(snap.jobs);
    if (elReceipts) elReceipts.textContent = String(snap.receipts);
    if (elWarnings) elWarnings.textContent = String(snap.warnings);
    if (elDays) elDays.textContent = String(snap.daysStored);

    // Wire the two dashboard buttons if present
    const btnOpenToday = $("#openTodayBtn") || $("#btnOpenToday") || $("[data-action='open-today']");
    const btnOpenCalendar = $("#openCalendarBtn") || $("#btnOpenCalendar") || $("[data-action='open-calendar']");

    if (btnOpenToday) btnOpenToday.onclick = () => switchView("day");
    if (btnOpenCalendar) btnOpenCalendar.onclick = () => switchView("calendar");
  }

  // -------------------------
  // Day Workspace rendering
  // -------------------------
  function renderDayWorkspace() {
    setHeaderContext(`Day Workspace: ${state.selectedDate}`);

    const title = $("#dayTitle") || $("#dayWorkspaceTitle");
    if (title) {
      const d = new Date(state.selectedDate + "T12:00:00");
      title.textContent = d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }

    const day = ensureDay(state.selectedDate);

    // Notes (textarea preferred)
    const notes = $("#notes") || $("#dayNotes") || $("#notesArea");
    if (notes) {
      // keep typing normal: real textarea, not contenteditable tricks
      notes.value = day.notes || "";
      notes.oninput = () => {
        day.notes = notes.value;
        saveState();
      };
    }

    // Jobs table (if present)
    renderJobsTable(day);
  }

  function renderJobsTable(day) {
    const tableBody =
      $("#jobsTableBody") ||
      $("#jobsBody") ||
      $("#jobsTable tbody") ||
      $("#jobs tbody");

    // If your HTML doesn’t have the table yet, we don’t crash.
    if (!tableBody) return;

    tableBody.innerHTML = "";

    day.jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");

      // columns we expect (safe defaults)
      const jobId = job.jobId ?? `J-${pad2(idx + 1)}`;
      const customer = job.customer ?? "";
      const pickup = job.pickup ?? "";
      const dropoff = job.dropoff ?? "";
      const volume = job.volume ?? "";

      tr.innerHTML = `
        <td><input class="cell" data-k="jobId" data-i="${idx}" value="${escapeAttr(jobId)}" /></td>
        <td><input class="cell" data-k="customer" data-i="${idx}" value="${escapeAttr(customer)}" /></td>
        <td><input class="cell" data-k="pickup" data-i="${idx}" value="${escapeAttr(pickup)}" /></td>
        <td><input class="cell" data-k="dropoff" data-i="${idx}" value="${escapeAttr(dropoff)}" /></td>
        <td><input class="cell" data-k="volume" data-i="${idx}" value="${escapeAttr(volume)}" /></td>
      `;

      tableBody.appendChild(tr);
    });

    // cell edits
    $$(".cell", tableBody).forEach(inp => {
      inp.addEventListener("input", (e) => {
        const i = Number(e.target.dataset.i);
        const k = e.target.dataset.k;
        day.jobs[i] = day.jobs[i] || {};
        day.jobs[i][k] = e.target.value;
        saveState();
        refreshWarnings();
      });

      // spreadsheet-like navigation
      inp.addEventListener("keydown", (e) => {
        const key = e.key;
        if (!["Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
