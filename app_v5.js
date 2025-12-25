/* FleetPro / Move-Master.OS — app_v5.js
   - Stable view switching (sidebar + toolbar)
   - Dashboard quick calendar + Today summary
   - Calendar month view
   - Day workspace (jobs + notes)
   - Add Job modal (open/close/save)
   - localStorage persistence
   - Honest JS badge: flips only after init succeeds
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    dayData: {
      // "YYYY-MM-DD": { jobs: [{id, customer, pickup, dropoff, amount, notes}], notes: "" }
    }
  };

  let state = structuredClone(DEFAULT_STATE);

  // ---------- Status / Error trapping ----------
  function setJSStatus(text, kind = "warn") {
    const pill = $("#jsStatusPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove("ok", "warn", "err");
    pill.classList.add(kind === "ok" ? "ok" : kind === "err" ? "err" : "warn");
  }

  function setStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      pill.textContent = raw ? `Local Storage: ON · ${Math.max(1, Math.round(raw.length / 1024))} KB` : "Local Storage: —";
    } catch {
      pill.textContent = "Local Storage: blocked";
    }
  }

  window.addEventListener("error", (e) => {
    setJSStatus("JS: error", "err");
    console.error("JS error:", e.error || e.message);
  });

  window.addEventListener("unhandledrejection", (e) => {
    setJSStatus("JS: error", "err");
    console.error("Unhandled rejection:", e.reason);
  });

  // ---------- Persistence ----------
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const st = safeJSONParse(raw, structuredClone(DEFAULT_STATE));
      // normalize
      if (!st.view) st.view = "dashboard";
      if (!st.selectedDate) st.selectedDate = ymd(new Date());
      if (!st.calCursor) st.calCursor = monthKey(new Date());
      if (!st.dayData || typeof st.dayData !== "object") st.dayData = {};
      return st;
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    setStoragePill();
  }

  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], notes: "" };
    }
    if (!Array.isArray(state.dayData[dateStr].jobs)) state.dayData[dateStr].jobs = [];
    if (typeof state.dayData[dateStr].notes !== "string") state.dayData[dateStr].notes = "";
    return state.dayData[dateStr];
  }

  // ---------- Views ----------
  function switchView(viewName) {
    state.view = viewName;
    saveState();

    const views = $$(".view");
    for (const v of views) {
      const match = v.getAttribute("data-view") === viewName;
      v.hidden = !match;
    }

    // highlight sidebar
    for (const b of $$(".navbtn")) {
      b.classList.toggle("active", b.dataset.view === viewName);
    }

    // context line
    const ctx = $("#contextLine");
    if (ctx) {
      if (viewName === "day") ctx.textContent = `Day Workspace: ${state.selectedDate}`;
      else if (viewName === "calendar") ctx.textContent = `Calendar navigation (Month)`;
      else ctx.textContent = `Foundation mode (Smart)`;
    }

    // render view content on switch
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDay();
  }

  // ---------- Calendar rendering ----------
  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function renderCalendarGrid(targetEl, cursorKey, { compact = false } = {}) {
    // cursorKey: "YYYY-MM"
    const [yy, mm] = cursorKey.split("-").map(Number);
    const year = yy;
    const monthIndex0 = mm - 1;

    const first = new Date(year, monthIndex0, 1);
    const startDow = first.getDay(); // 0 Sun
    const dim = daysInMonth(year, monthIndex0);

    // Build a simple grid of buttons (your CSS makes it pretty)
    const wrap = document.createElement("div");
    wrap.className = compact ? "cal-quick" : "cal-month";

    // header row (optional)
    if (!compact) {
      const title = $("#calTitle");
      if (title) {
        const monthName = first.toLocaleString(undefined, { month: "long" });
        title.textContent = `${monthName} ${year}`;
      }
    }

    // empty pads
    const totalCells = compact ? 42 : 42; // keep consistent layout
    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-day";
      cell.disabled = true;
      cell.textContent = "";
      wrap.appendChild(cell);
    }

    // fill days
    for (let day = 1; day <= dim; day++) {
      const idx = startDow + (day - 1);
      const dateStr = `${year}-${pad2(mm)}-${pad2(day)}`;

      const btn = wrap.children[idx];
      btn.disabled = false;
      btn.textContent = String(day);
      btn.dataset.date = dateStr;

      if (dateStr === state.selectedDate) btn.classList.add("selected");

      const d = ensureDay(dateStr);
      if (d.jobs.length > 0) btn.classList.add("has-data");

      btn.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        switchView("day");
      });
    }

    targetEl.innerHTML = "";
    targetEl.appendChild(wrap);
  }

  function renderCalendar() {
    const grid = $("#calendarGrid");
    if (!grid) return;

    renderCalendarGrid(grid, state.calCursor, { compact: false });
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const todayLine = $("#dashTodayLine");
    if (todayLine) {
      const d = ensureDay(state.selectedDate);
      todayLine.textContent = `${d.jobs.length} job(s), 0 receipt(s), 0 driver(s), 0 truck(s)`;
    }

    const quick = $("#dashCalendarQuick");
    if (quick) renderCalendarGrid(quick, state.calCursor, { compact: true });
  }

  // ---------- Day workspace ----------
  function renderJobsTable(dateStr) {
    const host = $("#jobsTable");
    if (!host) return;

    const d = ensureDay(dateStr);

    const table = document.createElement("div");
    table.className = "sheet";

    const header = document.createElement("div");
    header.className = "sheet-row sheet-head";
    header.innerHTML = `
      <div class="cell">JOB ID</div>
      <div class="cell">CUSTOMER</div>
      <div class="cell">PICKUP</div>
      <div class="cell">DROPOFF</div>
      <div class="cell">AMOUNT</div>
    `;
    table.appendChild(header);

    for (const job of d.jobs) {
      const row = document.createElement("div");
      row.className = "sheet-row";

      // Use real inputs so iPad editing behaves like a normal app
      row.appendChild(makeInputCell(job, "id", "J-0000"));
      row.appendChild(makeInputCell(job, "customer", "Customer"));
      row.appendChild(makeInputCell(job, "pickup", "Pickup"));
      row.appendChild(makeInputCell(job, "dropoff", "Dropoff"));
      row.appendChild(makeInputCell(job, "amount", "0", { type: "number" }));

      table.appendChild(row);
    }

    host.innerHTML = "";
    host.appendChild(table);
  }

  function makeInputCell(obj, key, placeholder, opts = {}) {
    const cell = document.createElement("div");
    cell.className = "cell";

    const input = document.createElement("input");
    input.type = opts.type || "text";
    input.value = obj[key] ?? "";
    input.placeholder = placeholder;

    input.addEventListener("input", () => {
      obj[key] = input.type === "number" ? Number(input.value || 0) : input.value;
      saveState();
    });

    cell.appendChild(input);
    return cell;
  }

  function renderDay() {
    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace: ${state.selectedDate}`;

    ensureDay(state.selectedDate);
    renderJobsTable(state.selectedDate);

    const notes = $("#dayNotes");
    if (notes) {
      notes.value = state.dayData[state.selectedDate].notes || "";
      notes.oninput = () => {
        state.dayData[state.selectedDate].notes = notes.value;
        saveState();
      };
    }

    // tabs default
    selectTab("jobs");
  }

  function selectTab(tabName) {
    for (const b of $$(".tabbtn")) {
      b.classList.toggle("active", b.dataset.tab === tabName);
    }
    for (const p of $$(".pane")) {
      p.hidden = p.dataset.pane !== tabName;
    }
  }

  // ---------- Modal ----------
  function openJobModal(dateStr) {
    const overlay = $("#jobModalOverlay");
    if (!overlay) return;

    overlay.hidden = false;

    const d = ensureDay(dateStr);
    $("#jobDate").value = dateStr;
    $("#jobCustomer").value = "";
    $("#jobPickup").value = "";
    $("#jobDropoff").value = "";
    $("#jobAmount").value = "";
    $("#jobNotes").value = "";

    // Focus first field (nice on iPad)
    setTimeout(() => $("#jobCustomer")?.focus(), 50);
  }

  function closeJobModal() {
    const overlay = $("#jobModalOverlay");
    if (!overlay) return;
    overlay.hidden = true;
  }

  function bindModal() {
    $("#btnCloseJobModal")?.addEventListener("click", closeJobModal);
    $("#btnCancelJob")?.addEventListener("click", closeJobModal);

    // click outside modal closes
    $("#jobModalOverlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "jobModalOverlay") closeJobModal();
    });

    $("#jobForm")?.addEventListener("submit", (e) => {
      e.preventDefault();

      const dateStr = $("#jobDate").value || state.selectedDate;
      const d = ensureDay(dateStr);

      const nextId = `J-${pad2(Math.floor(Math.random() * 90) + 10)}${pad2(Math.floor(Math.random() * 90) + 10)}`;
      const job = {
        id: nextId,
        customer: $("#jobCustomer").value.trim(),
        pickup: $("#jobPickup").value.trim(),
        dropoff: $("#jobDropoff").value.trim(),
        amount: Number($("#jobAmount").value || 0),
        notes: $("#jobNotes").value.trim()
      };

      d.jobs.unshift(job);
      state.selectedDate = dateStr;
      saveState();

      closeJobModal();

      // ensure UI updates
      renderDashboard();
      renderCalendar();
      renderDay();
      switchView("day");
    });
  }

  // ---------- Navigation wiring ----------
  function bindNav() {
    // sidebar nav
    for (const btn of $$(".navbtn")) {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (view) switchView(view);
      });
    }

    // toolbar
    $("#btnToday")?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      if (state.view === "calendar") renderCalendar();
      if (state.view === "dashboard") renderDashboard();
      switchView("day");
    });

    $("#btnPrev")?.addEventListener("click", () => {
      // prev month when in calendar/dashboard; prev day when in day
      if (state.view === "day") {
        const d = new Date(state.selectedDate);
        d.setDate(d.getDate() - 1);
        state.selectedDate = ymd(d);
        state.calCursor = monthKey(d);
        saveState();
        renderDay();
        renderCalendar();
        renderDashboard();
        $("#contextLine").textContent = `Day Workspace: ${state.selectedDate}`;
      } else {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm - 2, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
        renderDashboard();
      }
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "day") {
        const d = new Date(state.selectedDate);
        d.setDate(d.getDate() + 1);
        state.selectedDate = ymd(d);
        state.calCursor = monthKey(d);
        saveState();
        renderDay();
        renderCalendar();
        renderDashboard();
        $("#contextLine").textContent = `Day Workspace: ${state.selectedDate}`;
      } else {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm, 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
        renderDashboard();
      }
    });

    // add job buttons
    $("#btnAddJob")?.addEventListener("click", () => openJobModal(state.selectedDate));
    $("#btnAddJobInline")?.addEventListener("click", () => openJobModal(state.selectedDate));

    // dash quick actions
    $("#btnOpenToday")?.addEventListener("click", () => switchView("day"));
    $("#btnOpenCalendar")?.addEventListener("click", () => switchView("calendar"));

    // tabs
    for (const b of $$(".tabbtn")) {
      b.addEventListener("click", () => selectTab(b.dataset.tab));
    }

    // placeholders
    $("#btnAddReceipt")?.addEventListener("click", () => switchView("day"));
    $("#btnAddNote")?.addEventListener("click", () => {
      switchView("day");
      selectTab("notes");
      $("#dayNotes")?.focus();
    });
  }

  // ---------- Init ----------
  function init() {
    setJSStatus("JS: loading…", "warn");

    state = loadState();
    setStoragePill();

    bindNav();
    bindModal();

    // initial renders
    renderDashboard();
    renderCalendar();
    renderDay();

    // show saved view (default dashboard)
    switchView(state.view || "dashboard");

    // If we got here, init succeeded.
    setJSStatus("JS: loaded", "ok");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
