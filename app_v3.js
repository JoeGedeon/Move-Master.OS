/* FleetPro / Move-Master.OS — app_v4.js
   - Fix: honest JS badge (only flips after running)
   - Fix: sidebar buttons open views reliably (event delegation)
   - Fix: one-character-at-a-time editing (REAL <input> in cells)
   - Fix: horizontal scroll in tables (CSS + no weird overflow clipping)
   - Calendar month view -> tap day -> Day Workspace
   - LocalStorage persistence (day-rooted)
*/

(() => {
  "use strict";

  // ---------- DOM helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  // ---------- State ----------
  const STORAGE_KEY = "fleetpro_foundation_v4";

  const DEFAULT_STATE = {
    version: 4,
    view: "dashboard",
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    // dayData[YYYY-MM-DD] = { jobs: [], receipts: [], notes: "" }
    dayData: {}
  };

  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }
  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);
    if (!st.dayData) st.dayData = {};
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    if (!st.view) st.view = "dashboard";
    return st;
  }
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // ---------- UI badge (HONEST) ----------
  function setJsLoadedBadge() {
    const badge = $("#jsBadge");
    if (!badge) return;
    badge.textContent = "JS: loaded";
    badge.classList.add("loaded");
  }

  // ---------- Clock ----------
  function startClock() {
    const el = $("#clock");
    if (!el) return;
    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = pad2(d.getMinutes());
      const s = pad2(d.getSeconds());
      const am = h >= 12 ? "PM" : "AM";
      h = h % 12; if (h === 0) h = 12;
      el.textContent = `${h}:${m}:${s} ${am}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---------- View switching ----------
  function switchView(viewName) {
    state.view = viewName;
    saveState();

    // nav active
    $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));

    // view active
    $$(".view").forEach(v => v.classList.remove("active"));
    const viewEl = $("#view-" + viewName);
    if (viewEl) viewEl.classList.add("active");

    // context line
    const ctx = $("#contextLine");
    if (ctx) {
      if (viewName === "calendar") ctx.textContent = "Calendar navigation (Month)";
      else if (viewName === "day") ctx.textContent = `Day Workspace: ${state.selectedDate}`;
      else ctx.textContent = "Foundation mode (Smart)";
    }

    // render where needed
    if (viewName === "calendar") renderCalendar();
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "day") renderDay();
  }

  // ---------- Toolbar actions ----------
  function bindToolbar() {
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    if (btnToday) btnToday.addEventListener("click", () => {
      const today = new Date();
      state.selectedDate = ymd(today);
      state.calCursor = monthKey(today);
      saveState();
      if (state.view === "calendar") renderCalendar();
      if (state.view === "dashboard") renderDashboard();
      if (state.view === "day") renderDay();
    });

    if (btnPrev) btnPrev.addEventListener("click", () => {
      // prev month in calendar, prev day in day view
      if (state.view === "calendar") {
        const [y, m] = state.calCursor.split("-").map(Number);
        const d = new Date(y, m - 2, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else {
        const d = new Date(state.selectedDate + "T00:00:00");
        d.setDate(d.getDate() - 1);
        state.selectedDate = ymd(d);
        saveState();
        if (state.view === "day") renderDay();
        renderDashboard();
      }
    });

    if (btnNext) btnNext.addEventListener("click", () => {
      if (state.view === "calendar") {
        const [y, m] = state.calCursor.split("-").map(Number);
        const d = new Date(y, m, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else {
        const d = new Date(state.selectedDate + "T00:00:00");
        d.setDate(d.getDate() + 1);
        state.selectedDate = ymd(d);
        saveState();
        if (state.view === "day") renderDay();
        renderDashboard();
      }
    });

    const btnAddJob = $("#btnAddJob");
    const btnAddReceipt = $("#btnAddReceipt");
    const btnAddNote = $("#btnAddNote");

    if (btnAddJob) btnAddJob.addEventListener("click", () => {
      ensureDay(state.selectedDate);
      addJobRow();
      switchView("day");
      setActiveTab("jobs");
    });

    if (btnAddReceipt) btnAddReceipt.addEventListener("click", () => {
      ensureDay(state.selectedDate);
      addReceiptRow();
      switchView("day");
      setActiveTab("receipts");
    });

    if (btnAddNote) btnAddNote.addEventListener("click", () => {
      ensureDay(state.selectedDate);
      switchView("day");
      setActiveTab("notes");
      const box = $("#notesBox");
      if (box) box.focus();
    });
  }

  // ---------- Sidebar nav (event delegation = iPad-safe) ----------
  function bindSidebar() {
    const nav = $(".nav");
    if (!nav) return;

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      const view = btn.dataset.view;
      if (!view) return;
      switchView(view);
    });
  }

  // ---------- Dashboard ----------
  function ensureDay(dateKey) {
    if (!state.dayData[dateKey]) {
      state.dayData[dateKey] = { jobs: [], receipts: [], notes: "" };
    }
  }

  function prettyDate(dateKey) {
    const d = new Date(dateKey + "T00:00:00");
    const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    return d.toLocaleDateString(undefined, opts);
  }

  function monthCounts(mKey) {
    const keys = Object.keys(state.dayData);
    let jobs = 0, receipts = 0, days = 0, expenses = 0;

    for (const k of keys) {
      if (!k.startsWith(mKey)) continue;
      days++;
      const dd = state.dayData[k];
      jobs += (dd.jobs?.length || 0);
      receipts += (dd.receipts?.length || 0);
      // naive expenses sum
      for (const r of (dd.receipts || [])) {
        const amt = Number(r.amount || 0);
        if (!Number.isNaN(amt)) expenses += amt;
      }
    }

    return { jobs, receipts, days, expenses };
  }

  function renderDashboard() {
    ensureDay(state.selectedDate);

    const dateEl = $("#dashDate");
    const metaEl = $("#dashMeta");
    if (dateEl) dateEl.textContent = prettyDate(state.selectedDate);

    const dd = state.dayData[state.selectedDate];
    const j = dd.jobs.length;
    const r = dd.receipts.length;
    const n = (dd.notes || "").trim().length ? 1 : 0;

    if (metaEl) metaEl.textContent = `${j} job(s), ${r} receipt(s), ${n} note(s)`;

    const mc = monthCounts(state.calCursor);
    const mJobs = $("#mJobs");
    const mReceipts = $("#mReceipts");
    const mExpenses = $("#mExpenses");
    const mDays = $("#mDays");

    if (mJobs) mJobs.textContent = String(mc.jobs);
    if (mReceipts) mReceipts.textContent = String(mc.receipts);
    if (mExpenses) mExpenses.textContent = `$${mc.expenses.toFixed(0)}`;
    if (mDays) mDays.textContent = String(mc.days);
  }

  function bindDashboardButtons() {
    const openToday = $("#openToday");
    const openCalendar = $("#openCalendar");
    if (openToday) openToday.addEventListener("click", () => switchView("day"));
    if (openCalendar) openCalendar.addEventListener("click", () => switchView("calendar"));

    const dashOpenToday = $("#openToday");
    const dashOpenCal = $("#openCalendar");
    if (dashOpenToday) dashOpenToday.addEventListener("click", () => switchView("day"));
    if (dashOpenCal) dashOpenCal.addEventListener("click", () => switchView("calendar"));

    const btnOpenToday = $("#openToday");
    const btnOpenCalendar = $("#openCalendar");
    if (btnOpenToday) btnOpenToday.addEventListener("click", () => switchView("day"));
    if (btnOpenCalendar) btnOpenCalendar.addEventListener("click", () => switchView("calendar"));

    const openToday2 = $("#openToday");
    if (openToday2) openToday2.addEventListener("click", () => switchView("day"));

    const openCal2 = $("#openCalendar");
    if (openCal2) openCal2.addEventListener("click", () => switchView("calendar"));

    // Also wire the two buttons in the hero card
    const heroOpenToday = $("#openToday");
    const heroOpenCalendar = $("#openCalendar");
    if (heroOpenToday) heroOpenToday.addEventListener("click", () => switchView("day"));
    if (heroOpenCalendar) heroOpenCalendar.addEventListener("click", () => switchView("calendar"));
  }

  // ---------- Calendar ----------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const title = $("#calTitle");
    if (!grid || !title) return;

    const [yy, mm] = state.calCursor.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const last = new Date(yy, mm, 0);
    const startDow = first.getDay();
    const daysInMonth = last.getDate();

    const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    title.textContent = monthName;

    grid.innerHTML = "";

    // previous month filler
    const prevLast = new Date(yy, mm - 1, 0).getDate();
    for (let i = 0; i < startDow; i++) {
      const dayNum = prevLast - (startDow - 1 - i);
      const d = new Date(yy, mm - 2, dayNum);
      grid.appendChild(makeDayTile(d, true));
    }

    // month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(yy, mm - 1, d);
      grid.appendChild(makeDayTile(date, false));
    }

    // next month filler to complete grid nicely (optional)
    const totalTiles = grid.children.length;
    const remainder = totalTiles % 7;
    if (remainder !== 0) {
      const add = 7 - remainder;
      for (let i = 1; i <= add; i++) {
        const date = new Date(yy, mm, i);
        grid.appendChild(makeDayTile(date, true));
      }
    }
  }

  function makeDayTile(dateObj, muted) {
    const key = ymd(dateObj);
    ensureDay(key);
    const dd = state.dayData[key];

    const tile = document.createElement("div");
    tile.className = "day-tile";
    tile.dataset.date = key;

    const num = document.createElement("div");
    num.className = "day-num" + (muted ? " muted" : "");
    num.textContent = String(dateObj.getDate());

    const badges = document.createElement("div");
    badges.className = "day-badges";

    if (dd.jobs.length) badges.appendChild(makeMini(`${dd.jobs.length} job`));
    if (dd.receipts.length) badges.appendChild(makeMini(`${dd.receipts.length} receipt`));
    if ((dd.notes || "").trim().length) badges.appendChild(makeMini(`note`));

    tile.appendChild(num);
    tile.appendChild(badges);

    tile.addEventListener("click", () => {
      state.selectedDate = key;
      saveState();
      switchView("day");
    });

    // highlight selected day (subtle)
    if (key === state.selectedDate) {
      tile.style.borderColor = "rgba(59,91,255,.35)";
      tile.style.boxShadow = "0 0 0 2px rgba(59,91,255,.18) inset";
    }

    return tile;
  }

  function makeMini(text) {
    const b = document.createElement("div");
    b.className = "mini";
    b.textContent = text;
    return b;
  }

  // ---------- Tabs ----------
  function bindTabs() {
    const tabs = $$(".tab");
    tabs.forEach(t => {
      t.addEventListener("click", () => setActiveTab(t.dataset.tab));
    });
  }

  function setActiveTab(tabName) {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
    $$(".tabpane").forEach(p => p.classList.remove("active"));
    const pane = $("#tab-" + tabName);
    if (pane) pane.classList.add("active");
  }

  // ---------- Day Workspace render + editing ----------
  function renderDay() {
    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];

    const t = $("#dayTitle");
    const m = $("#dayMeta");
    if (t) t.textContent = prettyDate(state.selectedDate);
    if (m) m.textContent = `${dd.jobs.length} job(s) • ${dd.receipts.length} receipt(s) • ${((dd.notes || "").trim().length ? 1 : 0)} note(s)`;

    const pj = $("#pillJobs"), pr = $("#pillReceipts"), pn = $("#pillNotes");
    if (pj) pj.textContent = String(dd.jobs.length);
    if (pr) pr.textContent = String(dd.receipts.length);
    if (pn) pn.textContent = String((dd.notes || "").trim().length ? 1 : 0);

    renderJobsTable();
    renderReceiptsTable();

    const notesBox = $("#notesBox");
    if (notesBox) {
      notesBox.value = dd.notes || "";
      notesBox.oninput = () => {
        dd.notes = notesBox.value;
        saveState();
        // update counts
        if (pn) pn.textContent = String((dd.notes || "").trim().length ? 1 : 0);
      };
    }
  }

  function bindDayActions() {
    const addJob = $("#addJobRow");
    const addReceipt = $("#addReceiptRow");
    const addNote = $("#addNote");

    if (addJob) addJob.addEventListener("click", () => {
      addJobRow();
      renderDay();
      focusLastRowFirstCell("#jobsBody");
    });

    if (addReceipt) addReceipt.addEventListener("click", () => {
      addReceiptRow();
      renderDay();
      focusLastRowFirstCell("#receiptsBody");
    });

    if (addNote) addNote.addEventListener("click", () => {
      setActiveTab("notes");
      const box = $("#notesBox");
      if (box) box.focus();
    });
  }

  function focusLastRowFirstCell(bodySel) {
    const body = $(bodySel);
    if (!body) return;
    const rows = body.querySelectorAll("tr");
    if (!rows.length) return;
    const last = rows[rows.length - 1];
    const firstInput = last.querySelector("input, textarea");
    if (firstInput) firstInput.focus();
  }

  // --- JOBS ---
  function addJobRow() {
    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];
    const nextId = `J-${String(dd.jobs.length + 1).padStart(4, "0")}`;
    dd.jobs.push({
      jobId: nextId,
      customer: "",
      pickup: "",
      dropoff: "",
      volume: "",
      truck: "",
      driver: "",
      status: "",
      notes: ""
    });
    saveState();
  }

  function renderJobsTable() {
    const body = $("#jobsBody");
    if (!body) return;

    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];
    body.innerHTML = "";

    dd.jobs.forEach((job, rowIdx) => {
      const tr = document.createElement("tr");

      const cols = [
        ["jobId", "Job ID"],
        ["customer", "Customer"],
        ["pickup", "Pickup (From)"],
        ["dropoff", "Dropoff (To)"],
        ["volume", "Volume (ft³)"],
        ["truck", "Truck"],
        ["driver", "Driver"],
        ["status", "Status"],
        ["notes", "Notes"]
      ];

      cols.forEach(([key]) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.className = "cell-input";
        input.type = "text";
        input.value = job[key] ?? "";
        input.dataset.row = String(rowIdx);
        input.dataset.col = key;

        // Normal typing (fixes 1 character at a time)
        input.addEventListener("input", () => {
          job[key] = input.value;
          saveState();
          // live meta refresh for counts/notes presence
          if (key === "notes") renderDayMetaOnly();
        });

        // Spreadsheet-like navigation
        input.addEventListener("keydown", (e) => {
          handleGridNav(e, "#jobsTable", rowIdx, key);
        });

        td.appendChild(input);
        tr.appendChild(td);
      });

      body.appendChild(tr);
    });
  }

  // --- RECEIPTS ---
  function addReceiptRow() {
    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];
    const nextId = `R-${String(dd.receipts.length + 1).padStart(4, "0")}`;
    dd.receipts.push({
      receiptId: nextId,
      vendor: "",
      category: "",
      amount: "",
      paidBy: "",
      notes: ""
    });
    saveState();
  }

  function renderReceiptsTable() {
    const body = $("#receiptsBody");
    if (!body) return;

    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];
    body.innerHTML = "";

    dd.receipts.forEach((rec, rowIdx) => {
      const tr = document.createElement("tr");

      const cols = [
        ["receiptId", "Receipt ID"],
        ["vendor", "Vendor"],
        ["category", "Category"],
        ["amount", "Amount"],
        ["paidBy", "Paid By"],
        ["notes", "Notes"]
      ];

      cols.forEach(([key]) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.className = "cell-input";
        input.type = "text";
        input.value = rec[key] ?? "";
        input.dataset.row = String(rowIdx);
        input.dataset.col = key;

        input.addEventListener("input", () => {
          rec[key] = input.value;
          saveState();
          renderDashboard(); // keeps snapshot reasonably fresh
        });

        input.addEventListener("keydown", (e) => {
          handleGridNav(e, "#receiptsTable", rowIdx, key);
        });

        td.appendChild(input);
        tr.appendChild(td);
      });

      body.appendChild(tr);
    });
  }

  function renderDayMetaOnly() {
    ensureDay(state.selectedDate);
    const dd = state.dayData[state.selectedDate];
    const m = $("#dayMeta");
    const pn = $("#pillNotes");
    if (m) m.textContent = `${dd.jobs.length} job(s) • ${dd.receipts.length} receipt(s) • ${((dd.notes || "").trim().length ? 1 : 0)} note(s)`;
    if (pn) pn.textContent = String((dd.notes || "").trim().length ? 1 : 0);
  }

  // Spreadsheet-like nav: Tab/Enter/Arrows
  function handleGridNav(e, tableSel, rowIdx, colKey) {
    const table = $(tableSel);
    if (!table) return;

    const inputs = $$("tbody input.cell-input", table);
    if (!inputs.length) return;

    // build row/col ordering based on DOM position
    const rows = $$("tbody tr", table);
    const colOrder = [];
    const firstRowInputs = rows[0]?.querySelectorAll("input.cell-input") || [];
    firstRowInputs.forEach(inp => colOrder.push(inp.dataset.col));

    const colIndex = colOrder.indexOf(colKey);
    const maxRow = rows.length - 1;
    const maxCol = colOrder.length - 1;

    const moveTo = (r, c) => {
      const targetRow = rows[r];
      if (!targetRow) return;
      const target = targetRow.querySelector(`input.cell-input[data-col="${colOrder[c]}"]`);
      if (target) {
        target.focus();
        target.select?.();
      }
    };

    if (e.key === "Tab") {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let nc = colIndex + dir;
      let nr = rowIdx;
      if (nc > maxCol) { nc = 0; nr = Math.min(maxRow, rowIdx + 1); }
      if (nc < 0) { nc = maxCol; nr = Math.max(0, rowIdx - 1); }
      moveTo(nr, nc);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const nr = Math.min(maxRow, rowIdx + 1);
      moveTo(nr, colIndex);
      return;
    }

    if (e.key === "ArrowRight") {
      // keep native cursor movement inside input unless at end
      return;
    }
    if (e.key === "ArrowLeft") {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveTo(Math.min(maxRow, rowIdx + 1), colIndex);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(Math.max(0, rowIdx - 1), colIndex);
      return;
    }
  }

  // ---------- Boot ----------
  function boot() {
    // If localStorage is blocked, at least don’t crash
    try { localStorage.setItem("__test__", "1"); localStorage.removeItem("__test__"); }
    catch {
      const ls = $("#lsState");
      if (ls) ls.textContent = "OFF";
    }

    setJsLoadedBadge();
    startClock();

    bindSidebar();
    bindToolbar();
    bindTabs();
    bindDayActions();
    bindDashboardButtons();

    // calendar tile click is bound per tile render
    renderDashboard();
    renderCalendar();
    renderDay();

    // restore last view
    switchView(state.view || "dashboard");
  }

  // Run after DOM is ready (defer should handle, but belt + suspenders)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
