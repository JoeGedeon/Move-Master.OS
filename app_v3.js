/* FleetPro / Move-Master.OS
   app_v3.js
   - Fixes "one character at a time" editing by using real <input>/<textarea> editors
   - Tabs/Enter/Arrow navigation like a sane spreadsheet
   - Calendar Month view + Day Workspace
   - LocalStorage persistence
   - JS Loaded badge flips early + visible error trap
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v3";

  const DEFAULT_STATE = {
    version: 3,
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    // dayData[YYYY-MM-DD] = { jobs: [...], receipts: [...], notes: [...], warnings: [...] }
    dayData: {}
  };

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);
    // Normalize
    if (!st.dayData) st.dayData = {};
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    return st;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("LocalStorage save failed", e);
    }
  }

  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = {
        jobs: [],
        receipts: [],
        notes: [],
        warnings: []
      };
    }
    return state.dayData[dateStr];
  }

  function humanDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    return `${weekdays[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function setContext(title, subtitle) {
    const t = $("#contextTitle");
    const s = $("#contextSubtitle");
    if (t) t.textContent = title || "";
    if (s) s.textContent = subtitle || "";
  }

  // ---------- JS "loaded" badge + error trap ----------
  function markJSLoaded() {
    const badge = $("#jsBadge");
    if (badge) {
      badge.textContent = "JS: loaded";
      badge.classList.add("ok");
    }
  }

  function markJSError(msg) {
    const badge = $("#jsBadge");
    if (badge) {
      badge.textContent = `JS error`;
      badge.classList.remove("ok");
      badge.classList.add("bad");
      badge.title = msg || "Unknown error";
    }
    // Also dump into the page so you can see it on iPad without devtools
    let box = $("#jsErrorBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "jsErrorBox";
      box.style.cssText = `
        position: fixed; left: 12px; right: 12px; bottom: 12px;
        background: rgba(120,20,20,.92); color: #fff; padding: 10px 12px;
        border-radius: 10px; font: 12px/1.3 system-ui; z-index: 99999;
        white-space: pre-wrap;
      `;
      document.body.appendChild(box);
    }
    box.textContent = `JS crashed:\n${msg || ""}`;
  }

  window.addEventListener("error", (e) => {
    markJSError(`${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    markJSError(String(e.reason || e));
  });

  // ---------- App State ----------
  let state = loadState();

  // ---------- View switching ----------
  const VIEW_MAP = {
    dashboard: "view-dashboard",
    calendar: "view-calendar",
    day: "view-day",
    drivers: "view-drivers",
    trucks: "view-trucks",
    dispatch: "view-dispatch",
    finance: "view-finance",
    inventory: "view-inventory",
    ai: "view-ai"
  };

  function switchView(viewName) {
    // nav button highlight
    $$(".navbtn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));

    // show/hide views
    $$(".view").forEach(v => v.classList.remove("active"));
    const id = VIEW_MAP[viewName] || VIEW_MAP.dashboard;
    const el = $("#" + id);
    if (el) el.classList.add("active");

    if (viewName === "calendar") {
      setContext("Operations", "Calendar navigation (Month)");
      renderCalendar();
    } else if (viewName === "day") {
      setContext("Operations", `Day Workspace: ${state.selectedDate}`);
      renderDay();
    } else if (viewName === "dashboard") {
      setContext("Operations", "Foundation mode (Smart)");
      renderDashboard();
    } else {
      setContext("Operations", viewName[0].toUpperCase() + viewName.slice(1));
    }
  }

  function bindNav() {
    const nav = $("#sideNav");
    if (!nav) return;

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      const view = btn.dataset.view;
      if (!view) return;
      switchView(view);
    });
  }

  // ---------- Clock ----------
  function startClock() {
    const el = $("#clock");
    if (!el) return;

    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = pad2(d.getMinutes());
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      el.textContent = `${h}:${m} ${ampm}`;
    };

    tick();
    setInterval(tick, 1000);
  }

  // ---------- Toolbar ----------
  function bindToolbar() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");
    const addJob = $("#btnAddJob");
    const addReceipt = $("#btnAddReceipt");
    const addNote = $("#btnAddNote");

    if (btnToday) btnToday.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      // If currently in calendar/day, refresh that view
      if ($("#view-calendar")?.classList.contains("active")) renderCalendar();
      if ($("#view-day")?.classList.contains("active")) renderDay();
      renderDashboard();
    });

    if (btnPrev) btnPrev.addEventListener("click", () => {
      // If in calendar: previous month. If in day: previous day.
      if ($("#view-calendar")?.classList.contains("active")) {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm - 2, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else {
        const d = new Date(state.selectedDate + "T00:00:00");
        d.setDate(d.getDate() - 1);
        state.selectedDate = ymd(d);
        saveState();
        renderDay();
        renderDashboard();
      }
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      if ($("#view-calendar")?.classList.contains("active")) {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else {
        const d = new Date(state.selectedDate + "T00:00:00");
        d.setDate(d.getDate() + 1);
        state.selectedDate = ymd(d);
        saveState();
        renderDay();
        renderDashboard();
      }
    });

    // Quick add (from any view): adds a new row to the day's sheet and jumps to Day Workspace
    if (addJob) addJob.addEventListener("click", () => {
      const day = ensureDay(state.selectedDate);
      const nextId = `J-${pad2(day.jobs.length + 1).padStart(4, "0")}`.replace("0", "0"); // harmless
      day.jobs.push({
        jobId: `J-${String(day.jobs.length + 1).padStart(4, "0")}`,
        customer: "",
        pickup: "",
        dropoff: "",
        volume: ""
      });
      saveState();
      switchView("day");
      setActiveDayTab("jobs");
      // Focus first editable cell
      setTimeout(() => focusCell(0, "customer"), 50);
    });

    if (addReceipt) addReceipt.addEventListener("click", () => {
      const day = ensureDay(state.selectedDate);
      day.receipts.push({ vendor: "", category: "", amount: "", note: "" });
      saveState();
      switchView("day");
      setActiveDayTab("records");
    });

    if (addNote) addNote.addEventListener("click", () => {
      const day = ensureDay(state.selectedDate);
      day.notes.push({ note: "" });
      saveState();
      switchView("day");
      setActiveDayTab("ai");
    });
  }

  // ---------- Dashboard ----------
  function computeMonthSnapshot(monthStr) {
    const snap = { jobs: 0, receipts: 0, expenses: 0, warnings: 0, activeDays: 0 };
    const prefix = monthStr + "-";

    for (const [dateStr, day] of Object.entries(state.dayData)) {
      if (!dateStr.startsWith(prefix)) continue;
      snap.activeDays++;
      snap.jobs += (day.jobs?.length || 0);
      snap.receipts += (day.receipts?.length || 0);
      // expenses: sum receipts.amount
      let exp = 0;
      (day.receipts || []).forEach(r => {
        const n = parseFloat(String(r.amount || "").replace(/[^0-9.]/g, ""));
        if (!Number.isNaN(n)) exp += n;
      });
      snap.expenses += exp;
      snap.warnings += (day.warnings?.length || 0);
    }

    return snap;
  }

  function generatePressurePoints(dateStr) {
    const day = ensureDay(dateStr);
    const points = [];

    // Lightweight "rules" so it feels smart without back-end AI
    day.jobs.forEach((j, idx) => {
      const jid = j.jobId || `Job #${idx + 1}`;
      if (!String(j.customer || "").trim()) points.push({ level: "danger", text: `${jid} missing customer`, jump: { tab: "jobs", row: idx, col: "customer" } });
      if (!String(j.pickup || "").trim()) points.push({ level: "warn", text: `${jid} missing pickup`, jump: { tab: "jobs", row: idx, col: "pickup" } });
      if (!String(j.dropoff || "").trim()) points.push({ level: "warn", text: `${jid} missing dropoff`, jump: { tab: "jobs", row: idx, col: "dropoff" } });
      if (!String(j.volume || "").trim()) points.push({ level: "warn", text: `${jid} missing volume`, jump: { tab: "jobs", row: idx, col: "volume" } });
    });

    // Store warnings
    day.warnings = points.map(p => ({
      level: p.level,
      message: p.text,
      jump: p.jump
    }));
    saveState();

    return points;
  }

  function renderDashboard() {
    const todayLine = $("#todayLine");
    const openToday = $("#openToday");
    const openCal = $("#openCalendar");
    const pressureList = $("#pressureList");

    const dateStr = state.selectedDate;
    const day = ensureDay(dateStr);

    if (todayLine) {
      const jobs = day.jobs?.length || 0;
      const receipts = day.receipts?.length || 0;
      todayLine.textContent = `${humanDate(dateStr)} • ${jobs} job(s), ${receipts} receipt(s)`;
    }

    if (openToday) openToday.onclick = () => switchView("day");
    if (openCal) openCal.onclick = () => switchView("calendar");

    // Pressure points
    const points = generatePressurePoints(dateStr);
    if (pressureList) {
      pressureList.innerHTML = "";
      if (!points.length) {
        const li = document.createElement("li");
        li.textContent = "No pressure points detected.";
        pressureList.appendChild(li);
      } else {
        points.slice(0, 6).forEach(p => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${p.level.toUpperCase()}</strong> (${dateStr}) ${p.text}`;
          li.style.cursor = "pointer";
          li.addEventListener("click", () => {
            switchView("day");
            setActiveDayTab(p.jump.tab);
            setTimeout(() => focusCell(p.jump.row, p.jump.col), 50);
          });
          pressureList.appendChild(li);
        });
      }
    }

    // Month snapshot
    const snap = computeMonthSnapshot(monthKey(new Date(dateStr + "T00:00:00")));
    const jobsEl = $("#statJobs");
    const recEl = $("#statReceipts");
    const expEl = $("#statExpenses");
    const warnEl = $("#statWarnings");
    if (jobsEl) jobsEl.textContent = String(snap.jobs);
    if (recEl) recEl.textContent = String(snap.receipts);
    if (expEl) expEl.textContent = `$${Math.round(snap.expenses * 100) / 100}`;
    if (warnEl) warnEl.textContent = String(snap.warnings);
  }

  // ---------- Calendar (Month) ----------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const title = $("#calTitle");
    if (!grid) return;

    const [yy, mm] = state.calCursor.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const last = new Date(yy, mm, 0);
    const startDay = first.getDay(); // 0 Sun
    const daysInMonth = last.getDate();

    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    if (title) title.textContent = `${months[first.getMonth()]} ${first.getFullYear()}`;

    grid.innerHTML = "";

    // Leading blanks from previous month
    const prevLast = new Date(yy, mm - 1, 0);
    const prevDays = prevLast.getDate();
    for (let i = 0; i < startDay; i++) {
      const d = document.createElement("div");
      d.className = "daytile muted";
      d.innerHTML = `<div class="daynum">${prevDays - (startDay - 1 - i)}</div>`;
      grid.appendChild(d);
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const date = new Date(yy, mm - 1, dayNum);
      const dateStr = ymd(date);
      const dayData = ensureDay(dateStr);

      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "daytile";
      tile.dataset.date = dateStr;

      const jobs = (dayData.jobs || []).length;
      const warns = (dayData.warnings || []).length;

      tile.innerHTML = `
        <div class="daynum">${dayNum}</div>
        <div class="chips-mini">
          ${jobs ? `<span class="mini job">${jobs} job</span>` : ``}
          ${warns ? `<span class="mini warn">${warns} warn</span>` : ``}
        </div>
      `;

      if (dateStr === state.selectedDate) tile.classList.add("selected");

      tile.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        switchView("day");
      });

      grid.appendChild(tile);
    }

    // Trailing blanks to complete grid (optional)
    const totalCells = grid.children.length;
    const remainder = totalCells % 7;
    if (remainder !== 0) {
      const toAdd = 7 - remainder;
      for (let i = 0; i < toAdd; i++) {
        const d = document.createElement("div");
        d.className = "daytile muted";
        d.innerHTML = `<div class="daynum"></div>`;
        grid.appendChild(d);
      }
    }
  }

  // ---------- Day Workspace / Spreadsheet ----------
  let activeDayTab = "jobs"; // jobs | drivers | trucks | records | media | ai

  function setActiveDayTab(tabName) {
    activeDayTab = tabName;
    $$("#dayTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
    renderDayTab();
  }

  function bindDayTabs() {
    const tabs = $("#dayTabs");
    if (!tabs) return;
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setActiveDayTab(btn.dataset.tab);
    });
  }

  function renderDay() {
    const dayTitle = $("#dayTitle");
    const chipJobs = $("#chipJobs");
    const chipVol = $("#chipVolume");

    const dateStr = state.selectedDate;
    const day = ensureDay(dateStr);

    setContext("Operations", `Day Workspace: ${dateStr}`);

    if (dayTitle) dayTitle.textContent = humanDate(dateStr);

    // Chips
    if (chipJobs) chipJobs.textContent = `Jobs: ${day.jobs?.length || 0}`;
    const volSum = (day.jobs || []).reduce((acc, j) => {
      const n = parseFloat(String(j.volume || "").replace(/[^0-9.]/g, ""));
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);
    if (chipVol) chipVol.textContent = `Volume: ${Math.round(volSum * 100) / 100}`;

    // Warnings are generated from jobs
    generatePressurePoints(dateStr);

    // Add Row button
    const addRow = $("#btnAddRow");
    if (addRow) addRow.onclick = () => {
      addRowForActiveTab();
    };

    renderDayTab();
  }

  function addRowForActiveTab() {
    const dateStr = state.selectedDate;
    const day = ensureDay(dateStr);

    if (activeDayTab === "jobs") {
      day.jobs.push({
        jobId: `J-${String(day.jobs.length + 1).padStart(4, "0")}`,
        customer: "",
        pickup: "",
        dropoff: "",
        volume: ""
      });
      saveState();
      renderDay();
      setTimeout(() => focusCell(day.jobs.length - 1, "customer"), 50);
      return;
    }

    if (activeDayTab === "records") {
      day.receipts.push({ vendor: "", category: "", amount: "", note: "" });
      saveState();
      renderDay();
      return;
    }

    if (activeDayTab === "ai") {
      day.notes.push({ note: "" });
      saveState();
      renderDay();
      return;
    }

    // Placeholder tabs: no data model yet
    alert("That sheet is placeholder for now. Jobs/Records/AI Notes are editable.");
  }

  function renderDayTab() {
    const container = $("#tabContent");
    if (!container) return;

    const dateStr = state.selectedDate;
    const day = ensureDay(dateStr);

    // Normalize active tab buttons
    $$("#dayTabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === activeDayTab));

    container.innerHTML = "";

    if (activeDayTab === "jobs") {
      container.appendChild(renderJobsSheet(day));
      return;
    }

    if (activeDayTab === "records") {
      container.appendChild(renderReceiptsSheet(day));
      return;
    }

    if (activeDayTab === "ai") {
      container.appendChild(renderNotesSheet(day));
      return;
    }

    // Placeholder
    const card = document.createElement("div");
    card.className = "muted";
    card.textContent = "This sheet is placeholder for now. Jobs, Records, and AI Notes are live-editable.";
    container.appendChild(card);
  }

  // Focus helper for spreadsheet
  function focusCell(rowIndex, field) {
    const el = document.querySelector(`[data-row="${rowIndex}"][data-field="${field}"]`);
    if (el) {
      el.focus({ preventScroll: false });
      // Move caret to end
      if (el.setSelectionRange) {
        const len = el.value?.length ?? 0;
        el.setSelectionRange(len, len);
      }
    }
  }

  // Spreadsheet keyboard navigation
  function handleGridKeyNav(e, fields, rowsCount) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const row = Number(el.dataset.row);
    const field = String(el.dataset.field);
    const col = fields.indexOf(field);

    // Tab navigation
    if (e.key === "Tab") {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let newCol = col + dir;
      let newRow = row;

      if (newCol >= fields.length) {
        newCol = 0;
        newRow = Math.min(rowsCount - 1, row + 1);
      } else if (newCol < 0) {
        newCol = fields.length - 1;
        newRow = Math.max(0, row - 1);
      }
      focusCell(newRow, fields[newCol]);
      return;
    }

    // Enter: move down same column (like Sheets)
    if (e.key === "Enter") {
      // Allow Enter inside textarea to add new line if Ctrl/Meta held
      if (el instanceof HTMLTextAreaElement && (e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const newRow = Math.min(rowsCount - 1, row + 1);
      focusCell(newRow, field);
      return;
    }

    // Arrow keys: move between cells when caret at edges (optional lightweight)
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (!(el instanceof HTMLInputElement)) return;
      const pos = el.selectionStart ?? 0;
      const len = el.value.length;
      if (e.key === "ArrowRight" && pos === len) {
        e.preventDefault();
        const newCol = Math.min(fields.length - 1, col + 1);
        focusCell(row, fields[newCol]);
      } else if (e.key === "ArrowLeft" && pos === 0) {
        e.preventDefault();
        const newCol = Math.max(0, col - 1);
        focusCell(row, fields[newCol]);
      }
    }
  }

  // Jobs Sheet
  function renderJobsSheet(day) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    // This class is what your CSS should use to allow horizontal swipe/scroll.
    wrap.style.overflowX = "auto";
    wrap.style.webkitOverflowScrolling = "touch";

    const table = document.createElement("table");
    table.className = "sheet";

    const fields = ["jobId", "customer", "pickup", "dropoff", "volume"];
    const labels = {
      jobId: "Job ID",
      customer: "Customer",
      pickup: "Pickup (origin address)",
      dropoff: "Dropoff (destination address)",
      volume: "Volume (ft³)"
    };

    table.innerHTML = `
      <thead>
        <tr>
          ${fields.map(f => `<th title="${labels[f]}">${labels[f]}</th>`).join("")}
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = $("tbody", table);

    // Ensure at least 1 row to edit
    if (!day.jobs.length) {
      day.jobs.push({
        jobId: "J-0001",
        customer: "",
        pickup: "",
        dropoff: "",
        volume: ""
      });
      saveState();
    }

    day.jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");

      // JobId input
      const jobId = makeCellInput("text", job.jobId || "", idx, "jobId");
      jobId.placeholder = "J-0001";

      // Customer input
      const customer = makeCellInput("text", job.customer || "", idx, "customer");
      customer.placeholder = "Name / Account";

      // Pickup textarea (addresses get long)
      const pickup = makeCellTextArea(job.pickup || "", idx, "pickup");
      pickup.placeholder = "Pickup address";

      // Dropoff textarea
      const dropoff = makeCellTextArea(job.dropoff || "", idx, "dropoff");
      dropoff.placeholder = "Dropoff address";

      // Volume input
      const volume = makeCellInput("text", job.volume || "", idx, "volume");
      volume.placeholder = "e.g. 650";

      tr.appendChild(tdWrap(jobId));
      tr.appendChild(tdWrap(customer));
      tr.appendChild(tdWrap(pickup));
      tr.appendChild(tdWrap(dropoff));
      tr.appendChild(tdWrap(volume));

      tbody.appendChild(tr);
    });

    // Keyboard nav on the whole table
    table.addEventListener("keydown", (e) => handleGridKeyNav(e, fields, day.jobs.length));

    wrap.appendChild(table);
    return wrap;
  }

  // Receipts Sheet
  function renderReceiptsSheet(day) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.style.overflowX = "auto";
    wrap.style.webkitOverflowScrolling = "touch";

    const table = document.createElement("table");
    table.className = "sheet";

    const fields = ["vendor", "category", "amount", "note"];
    const labels = {
      vendor: "Vendor",
      category: "Category",
      amount: "Amount ($)",
      note: "Note"
    };

    table.innerHTML = `
      <thead>
        <tr>
          ${fields.map(f => `<th title="${labels[f]}">${labels[f]}</th>`).join("")}
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = $("tbody", table);

    day.receipts.forEach((r, idx) => {
      const tr = document.createElement("tr");

      const vendor = makeCellInput("text", r.vendor || "", idx, "vendor");
      vendor.placeholder = "e.g. Shell";

      const category = makeCellInput("text", r.category || "", idx, "category");
      category.placeholder = "Fuel / Toll / Hotel";

      const amount = makeCellInput("text", r.amount || "", idx, "amount");
      amount.placeholder = "69.01";

      const note = makeCellTextArea(r.note || "", idx, "note");
      note.placeholder = "Optional note";

      tr.appendChild(tdWrap(vendor));
      tr.appendChild(tdWrap(category));
      tr.appendChild(tdWrap(amount));
      tr.appendChild(tdWrap(note));

      tbody.appendChild(tr);
    });

    // If empty, give one row so it’s usable
    if (!day.receipts.length) {
      day.receipts.push({ vendor: "", category: "", amount: "", note: "" });
      saveState();
      return renderReceiptsSheet(day);
    }

    table.addEventListener("keydown", (e) => handleGridKeyNav(e, fields, day.receipts.length));

    wrap.appendChild(table);
    return wrap;
  }

  // AI Notes Sheet (simple)
  function renderNotesSheet(day) {
    const wrap = document.createElement("div");
    wrap.className = "sheet-wrap";

    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = "Notes are local for now. Later, this becomes AI-generated summaries/warnings.";
    wrap.appendChild(info);

    if (!day.notes.length) {
      day.notes.push({ note: "" });
      saveState();
    }

    day.notes.forEach((n, idx) => {
      const ta = document.createElement("textarea");
      ta.className = "note-area";
      ta.rows = 5;
      ta.value = n.note || "";
      ta.dataset.row = String(idx);
      ta.dataset.field = "note";
      ta.placeholder = "Type notes here…";

      ta.addEventListener("input", () => {
        n.note = ta.value;
        saveState();
      });

      wrap.appendChild(ta);
    });

    return wrap;
  }

  // Cell creators (THIS is what fixes “one character at a time”)
  function makeCellInput(type, value, row, field) {
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.className = "cell";
    input.dataset.row = String(row);
    input.dataset.field = field;

    // Crucial: do not blur/focus swap on every keypress. Only save on input.
    input.addEventListener("input", () => {
      updateModelFromCell(input);
    });

    input.addEventListener("change", () => {
      updateModelFromCell(input);
      // regenerate warnings after edits
      generatePressurePoints(state.selectedDate);
      renderDashboard();
      if ($("#view-calendar")?.classList.contains("active")) renderCalendar();
    });

    return input;
  }

  function makeCellTextArea(value, row, field) {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.rows = 2;
    ta.className = "cell cell-ta";
    ta.dataset.row = String(row);
    ta.dataset.field = field;

    ta.addEventListener("input", () => {
      updateModelFromCell(ta);
    });

    ta.addEventListener("change", () => {
      updateModelFromCell(ta);
      generatePressurePoints(state.selectedDate);
      renderDashboard();
      if ($("#view-calendar")?.classList.contains("active")) renderCalendar();
    });

    return ta;
  }

  function tdWrap(control) {
    const td = document.createElement("td");
    td.appendChild(control);
    return td;
  }

  function updateModelFromCell(el) {
    const dateStr = state.selectedDate;
    const day = ensureDay(dateStr);

    const row = Number(el.dataset.row);
    const field = String(el.dataset.field);

    if (activeDayTab === "jobs") {
      if (!day.jobs[row]) return;
      day.jobs[row][field] = el.value;
      saveState();
      // update chips as you type
      if (field === "volume") {
        const chipVol = $("#chipVolume");
        const volSum = (day.jobs || []).reduce((acc, j) => {
          const n = parseFloat(String(j.volume || "").replace(/[^0-9.]/g, ""));
          return acc + (Number.isNaN(n) ? 0 : n);
        }, 0);
        if (chipVol) chipVol.textContent = `Volume: ${Math.round(volSum * 100) / 100}`;
      }
      return;
    }

    if (activeDayTab === "records") {
      if (!day.receipts[row]) return;
      day.receipts[row][field] = el.value;
      saveState();
      return;
    }
  }

  // ---------- Initialization ----------
  function init() {
    // Flip JS loaded badge first thing
    markJSLoaded();

    // Bind UI
    bindNav();
    bindToolbar();
    bindDayTabs();
    startClock();

    // Open Today/Calendar buttons might be in dashboard; set once after DOM is ready
    const openToday = $("#openToday");
    const openCal = $("#openCalendar");
    if (openToday) openToday.addEventListener("click", () => switchView("day"));
    if (openCal) openCal.addEventListener("click", () => switchView("calendar"));

    // Default view
    switchView("dashboard");

    // Make sure selected day exists
    ensureDay(state.selectedDate);
    saveState();
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
