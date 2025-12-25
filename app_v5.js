/* FleetPro / Move-Master.OS - app_v4.js
   - Working sidebar + toolbar navigation
   - Honest JS loaded flag
   - Calendar month view -> Day workspace
   - Day workspace Jobs table with REAL editors (fixes one-char issue)
   - LocalStorage persistence
*/

window.__FP_JS_LOADED = true;

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v4";

  const DEFAULT_STATE = {
    version: 4,
    view: "dashboard",
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    dayData: {
      // "YYYY-MM-DD": { jobs: [], aiNotes: "" }
    }
  };

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);
    if (!st.dayData) st.dayData = {};
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    if (!st.view) st.view = "dashboard";
    return st;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateStoragePill();
  }

  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], aiNotes: "" };
    }
    return state.dayData[dateStr];
  }

  function updateStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;
    try {
      const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
      pill.textContent = `Local Storage: ON • ${Math.max(1, Math.round(bytes / 1024))} KB`;
    } catch {
      pill.textContent = "Local Storage: ON";
    }
  }

  // ---------- Clock ----------
  function startClock() {
    const el = $("#clockBadge");
    if (!el) return;
    const tick = () => {
      const d = new Date();
      el.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- View Switching ----------
  function setContextLine(text) {
    const el = $("#contextLine");
    if (el) el.textContent = text;
  }

  function switchView(viewName) {
    state.view = viewName;

    $$(".navbtn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.view === viewName);
    });

    $$(".view").forEach(v => {
      v.classList.toggle("is-active", v.dataset.view === viewName);
    });

    if (viewName === "dashboard") {
      setContextLine("Foundation mode (Smart)");
      renderDashboard();
    } else if (viewName === "calendar") {
      setContextLine("Calendar navigation (Month)");
      renderCalendar();
    } else if (viewName === "day") {
      setContextLine(`Day Workspace: ${state.selectedDate}`);
      renderDay();
    } else {
      setContextLine(viewName.charAt(0).toUpperCase() + viewName.slice(1));
    }

    saveState();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const dateObj = new Date(state.selectedDate + "T00:00:00");
    const dashDate = $("#dashDate");
    const dashCounts = $("#dashCounts");

    if (dashDate) {
      dashDate.textContent = dateObj.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }

    const day = ensureDay(state.selectedDate);
    const jobs = day.jobs.length;

    if (dashCounts) {
      dashCounts.textContent = `${jobs} job(s), 0 receipt(s), 0 driver(s), 0 truck(s)`;
    }

    // Pressure points: “missing required fields” style
    const pressure = $("#pressureList");
    if (pressure) {
      const warnings = computeWarningsForDay(state.selectedDate);
      pressure.innerHTML = "";
      if (warnings.length === 0) {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = "No warnings yet.";
        pressure.appendChild(li);
      } else {
        warnings.slice(0, 5).forEach(w => {
          const li = document.createElement("li");
          li.textContent = w;
          pressure.appendChild(li);
        });
      }
    }

    // Month snapshot (basic counts)
    const mk = state.calCursor;
    const monthStats = computeMonthStats(mk);
    const setText = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };

    setText("#statJobsMonth", monthStats.jobs);
    setText("#statReceiptsMonth", 0);
    setText("#statExpensesMonth", "$0");
    setText("#statWarnings", monthStats.warnings);
  }

  function computeMonthStats(mKey) {
    let jobs = 0;
    let warnings = 0;
    for (const [dateStr, data] of Object.entries(state.dayData)) {
      if (!dateStr.startsWith(mKey)) continue;
      jobs += (data.jobs?.length || 0);
      warnings += computeWarningsForDay(dateStr).length;
    }
    return { jobs, warnings };
  }

  // ---------- Calendar ----------
  function parseMonthKey(mKey) {
    const [y, m] = mKey.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }

  function renderCalendar() {
    const cursor = parseMonthKey(state.calCursor);
    const title = $("#calTitle");
    if (title) {
      title.textContent = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }

    const grid = $("#calendarGrid");
    if (!grid) return;

    // Build month tiles (Sun-Sat grid)
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    grid.innerHTML = "";

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      const tile = document.createElement("div");
      tile.className = "day-tile is-empty";
      grid.appendChild(tile);
    }

    // Actual days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), dayNum);
      const dStr = ymd(d);
      const info = ensureDay(dStr);

      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "day-tile";
      tile.dataset.date = dStr;

      const top = document.createElement("div");
      top.className = "day-num";
      top.textContent = String(dayNum);

      const chips = document.createElement("div");
      chips.className = "chips";

      if (info.jobs?.length) {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = `${info.jobs.length} job`;
        chips.appendChild(c);
      }

      const warns = computeWarningsForDay(dStr);
      if (warns.length) {
        const c = document.createElement("span");
        c.className = "chip warn";
        c.textContent = `${warns.length} warn`;
        chips.appendChild(c);
      }

      tile.appendChild(top);
      tile.appendChild(chips);

      if (dStr === state.selectedDate) tile.classList.add("is-selected");

      grid.appendChild(tile);
    }
  }

  // ---------- Day Workspace ----------
  function renderDay() {
    const d = new Date(state.selectedDate + "T00:00:00");
    const title = $("#dayTitle");
    const meta = $("#dayMeta");
    if (title) {
      title.textContent = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }

    const day = ensureDay(state.selectedDate);
    const warns = computeWarningsForDay(state.selectedDate);
    if (meta) {
      meta.textContent = `${day.jobs.length} job(s) • ${warns.length} warning(s)`;
    }

    // Notes
    const notes = $("#aiNotes");
    if (notes) {
      notes.value = day.aiNotes || "";
    }

    renderJobsTable();
  }

  function computeWarningsForDay(dateStr) {
    const day = ensureDay(dateStr);
    const warns = [];

    (day.jobs || []).forEach((j, idx) => {
      const id = j.jobId || `Job #${idx + 1}`;
      if (!j.customer) warns.push(`${id} missing customer`);
      if (!j.pickup) warns.push(`${id} missing pickup`);
      if (!j.dropoff) warns.push(`${id} missing dropoff`);
      if (!j.volume) warns.push(`${id} missing volume`);
    });

    return warns;
  }

  function addJobRow() {
    const day = ensureDay(state.selectedDate);
    const nextNum = (day.jobs.length + 1);
    const jobId = `J-${String(nextNum).padStart(4, "0")}`;

    day.jobs.push({
      jobId,
      customer: "",
      pickup: "",
      dropoff: "",
      volume: "",
      notes: ""
    });

    saveState();
    renderDay();
  }

  function renderJobsTable() {
    const tbody = $("#jobsTbody");
    if (!tbody) return;

    const day = ensureDay(state.selectedDate);
    tbody.innerHTML = "";

    day.jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.row = String(idx);

      tr.appendChild(makeCell("jobId", job.jobId, true));   // locked by default
      tr.appendChild(makeCell("customer", job.customer));
      tr.appendChild(makeCell("pickup", job.pickup));
      tr.appendChild(makeCell("dropoff", job.dropoff));
      tr.appendChild(makeCell("volume", job.volume));
      tr.appendChild(makeCell("notes", job.notes));

      tbody.appendChild(tr);
    });
  }

  function makeCell(field, value, locked = false) {
    const td = document.createElement("td");
    td.className = "cell";
    td.dataset.field = field;
    td.dataset.locked = locked ? "1" : "0";

    const div = document.createElement("div");
    div.className = "cell-value";
    div.textContent = value || "";
    td.appendChild(div);

    return td;
  }

  // Editor overlay (real input/textarea so iPad Safari stops acting cursed)
  function beginEditCell(td) {
    if (!td) return;
    if (td.dataset.locked === "1") return;

    const tr = td.closest("tr");
    if (!tr) return;

    const rowIdx = Number(tr.dataset.row);
    const field = td.dataset.field;

    const day = ensureDay(state.selectedDate);
    const job = day.jobs[rowIdx];
    if (!job) return;

    // Prevent multiple editors
    if (td.querySelector("input,textarea")) return;

    const current = job[field] || "";

    const isLong = (field === "notes" || current.length > 30);
    const editor = document.createElement(isLong ? "textarea" : "input");
    editor.className = "cell-editor";
    editor.value = current;

    // Replace display with editor
    td.innerHTML = "";
    td.appendChild(editor);
    editor.focus();
    editor.setSelectionRange?.(editor.value.length, editor.value.length);

    const commit = () => {
      job[field] = editor.value.trim();
      saveState();
      renderDay();
      renderDashboard(); // keeps warnings/snapshot current if user goes back
    };

    const cancel = () => {
      renderDay();
    };

    editor.addEventListener("blur", commit);

    editor.addEventListener("keydown", (e) => {
      // Enter commits (Shift+Enter for newline in textarea)
      if (e.key === "Enter" && !(editor.tagName === "TEXTAREA" && e.shiftKey)) {
        e.preventDefault();
        editor.blur();
        return;
      }

      // Escape cancels
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
      }

      // Tab to next cell (spreadsheet-ish)
      if (e.key === "Tab") {
        e.preventDefault();
        commit();
        focusNextCell(rowIdx, field, e.shiftKey ? -1 : 1);
      }

      // Arrow nav
      if (e.key === "ArrowRight") { e.preventDefault(); commit(); focusNextCell(rowIdx, field, 1); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); commit(); focusNextCell(rowIdx, field, -1); }
      if (e.key === "ArrowDown")  { e.preventDefault(); commit(); focusRowCell(rowIdx + 1, field); }
      if (e.key === "ArrowUp")    { e.preventDefault(); commit(); focusRowCell(rowIdx - 1, field); }
    });
  }

  const JOB_FIELDS = ["jobId", "customer", "pickup", "dropoff", "volume", "notes"];

  function focusNextCell(rowIdx, field, delta) {
    const colIdx = JOB_FIELDS.indexOf(field);
    let nextCol = colIdx + delta;
    let nextRow = rowIdx;

    if (nextCol < 0) { nextCol = JOB_FIELDS.length - 1; nextRow = rowIdx - 1; }
    if (nextCol >= JOB_FIELDS.length) { nextCol = 0; nextRow = rowIdx + 1; }

    focusRowCell(nextRow, JOB_FIELDS[nextCol]);
  }

  function focusRowCell(rowIdx, field) {
    const tbody = $("#jobsTbody");
    if (!tbody) return;
    const tr = tbody.querySelector(`tr[data-row="${rowIdx}"]`);
    if (!tr) return;
    const td = tr.querySelector(`td[data-field="${field}"]`);
    if (!td) return;
    beginEditCell(td);
  }

  // ---------- Toolbar navigation ----------
  function goToday() {
    const now = new Date();
    state.selectedDate = ymd(now);
    state.calCursor = monthKey(now);
    saveState();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    renderDashboard();
  }

  function calPrev() {
    const d = parseMonthKey(state.calCursor);
    d.setMonth(d.getMonth() - 1);
    state.calCursor = monthKey(d);
    saveState();
    if (state.view === "calendar") renderCalendar();
    renderDashboard();
  }

  function calNext() {
    const d = parseMonthKey(state.calCursor);
    d.setMonth(d.getMonth() + 1);
    state.calCursor = monthKey(d);
    saveState();
    if (state.view === "calendar") renderCalendar();
    renderDashboard();
  }

  // ---------- Boot ----------
  let state = loadState();

  function boot() {
    updateStoragePill();
    startClock();

    // Sidebar navigation
    document.addEventListener("click", (e) => {
      const nav = e.target.closest(".navbtn");
      if (nav) {
        const view = nav.dataset.view;
        if (view) switchView(view);
        return;
      }

      // Dashboard quick buttons
      if (e.target.closest("#btnOpenToday")) {
        switchView("day");
        return;
      }
      if (e.target.closest("#btnOpenCalendar")) {
        switchView("calendar");
        return;
      }

      // Toolbar
      if (e.target.closest("#btnToday")) { goToday(); return; }
      if (e.target.closest("#btnPrev")) { calPrev(); return; }
      if (e.target.closest("#btnNext")) { calNext(); return; }

      if (e.target.closest("#btnAddJob")) { addJobRow(); switchView("day"); return; }
      if (e.target.closest("#btnAddJobRow")) { addJobRow(); return; }

      if (e.target.closest("#btnAddNote")) {
        switchView("day");
        // force notes tab
        setDayTab("notes");
        return;
      }
      if (e.target.closest("#btnAddReceipt")) {
        alert("Receipts: next module. (Not wired yet.)");
        return;
      }
      if (e.target.closest("#btnExport")) { alert("Export: later."); return; }
      if (e.target.closest("#btnSync")) { alert("Sync: later."); return; }

      // Calendar day tile
      const tile = e.target.closest(".day-tile");
      if (tile && tile.dataset.date) {
        state.selectedDate = tile.dataset.date;
        saveState();
        switchView("day");
        return;
      }

      // Jobs table cell editing
      const td = e.target.closest("#jobsTable td.cell");
      if (td) {
        beginEditCell(td);
        return;
      }

      // Tabs in day workspace
      const tab = e.target.closest("#dayTabs .tab");
      if (tab) {
        setDayTab(tab.dataset.tab);
      }
    });

    // Notes persistence
    const notes = $("#aiNotes");
    if (notes) {
      notes.addEventListener("input", () => {
        const day = ensureDay(state.selectedDate);
        day.aiNotes = notes.value;
        saveState();
      });
    }

    // Restore view
    switchView(state.view || "dashboard");
    renderDashboard();

    // Debug: if you want, you can comment this out later
    // alert("app_v4.js loaded");
  }

  function setDayTab(tabName) {
    const tabs = $$("#dayTabs .tab");
    const panes = $$(".tabpane");
    tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === tabName));
    panes.forEach(p => p.classList.toggle("is-active", p.dataset.tabpane === tabName));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
