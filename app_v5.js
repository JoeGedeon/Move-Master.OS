/* FleetPro / Move-Master.OS — app_v5.js
   Purpose:
   - Keep current HTML/CSS layout
   - Wire sidebar + toolbar buttons
   - Render: Dashboard + Calendar + Day Workspace
   - LocalStorage persistence
   - Honest JS badge: flips to "loaded" only after init succeeds
*/
(() => {
  "use strict";

  // ---------------- Helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---------------- Storage ----------------
  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    version: 5,
    view: "dashboard",         // dashboard | calendar | day | drivers | ...
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()), // YYYY-MM
    activeTab: "jobs",         // jobs | receipts | notes
    dayData: {
      // "YYYY-MM-DD": { jobs: [{id, customer, pickup, dropoff, amount, notes}], notes: "..." }
    }
  };

  const safeJSONParse = (str, fallback) => {
    try { return JSON.parse(str); } catch { return fallback; }
  };

  const deepClone = (obj) => structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, deepClone(DEFAULT_STATE)) : deepClone(DEFAULT_STATE);

    // normalize
    if (!st.dayData || typeof st.dayData !== "object") st.dayData = {};
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    if (!st.view) st.view = "dashboard";
    if (!st.activeTab) st.activeTab = "jobs";

    // ensure day object exists
    ensureDay(st.selectedDate, st);
    return st;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStoragePill();
  }

  function ensureDay(dateStr, st = state) {
    if (!st.dayData[dateStr]) {
      st.dayData[dateStr] = { jobs: [], notes: "" };
    }
    if (!Array.isArray(st.dayData[dateStr].jobs)) st.dayData[dateStr].jobs = [];
    if (typeof st.dayData[dateStr].notes !== "string") st.dayData[dateStr].notes = "";
  }

  // ---------------- UI pills ----------------
  function setJSBadge(mode, message) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.classList.remove("ok", "bad");
    if (mode === "ok") {
      pill.textContent = "JS: loaded";
      pill.classList.add("ok");
    } else if (mode === "bad") {
      pill.textContent = message ? `JS: error` : "JS: not loaded";
      pill.classList.add("bad");
    } else {
      pill.textContent = "JS: not loaded";
    }
  }

  function setStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
    const kb = Math.max(1, Math.round(bytes / 1024));
    pill.textContent = `Local Storage: ON · ${kb} KB`;
  }

  // ---------------- Views ----------------
  const viewMap = {
    dashboard: "#dashboardView",
    calendar: "#calendarView",
    day: "#dayView",
    drivers: "#driversView",
    trucks: "#trucksView",
    dispatch: "#dispatchView",
    finance: "#financeView",
    inventory: "#inventoryView",
    ai: "#aiView",
  };

  function switchView(viewName) {
    state.view = viewName;
    for (const [k, sel] of Object.entries(viewMap)) {
      const el = $(sel);
      if (!el) continue;
      el.hidden = k !== viewName;
    }

    // nav button active styling (if your CSS supports .active)
    $$(".navbtn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });

    // render relevant view
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDay();

    saveState();
  }

  // ---------------- Dashboard ----------------
  function renderDashboard() {
    const d = new Date(state.selectedDate + "T00:00:00");
    const todayLine = $("#dashTodayLine");
    if (todayLine) todayLine.textContent = `Selected: ${state.selectedDate}`;

    // month snapshot
    const mk = state.calCursor; // YYYY-MM
    let mJobs = 0, mReceipts = 0, mWarnings = 0;
    Object.entries(state.dayData).forEach(([dateStr, obj]) => {
      if (!dateStr.startsWith(mk)) return;
      mJobs += (obj.jobs?.length || 0);
    });
    $("#mJobs") && ($("#mJobs").textContent = String(mJobs));
    $("#mReceipts") && ($("#mReceipts").textContent = String(mReceipts));
    $("#mWarnings") && ($("#mWarnings").textContent = String(mWarnings));
    $("#mExpenses") && ($("#mExpenses").textContent = "$0");

    renderMiniCalendar("#dashCalendarGrid");
  }

  function renderMiniCalendar(containerSel) {
    const grid = $(containerSel);
    if (!grid) return;

    grid.innerHTML = "";
    const cursor = parseMonth(state.calCursor);
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    // pad blanks
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      blank.className = "calcell blank";
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(day)}`;
      const cell = document.createElement("button");
      cell.className = "calcell";
      cell.type = "button";
      cell.textContent = String(day);
      cell.addEventListener("click", () => {
        state.selectedDate = dateStr;
        ensureDay(dateStr);
        switchView("day");
      });
      grid.appendChild(cell);
    }
  }

  // ---------------- Calendar (month) ----------------
  function parseMonth(mk) {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, (m - 1), 1);
  }

  function renderCalendar() {
    const cursor = parseMonth(state.calCursor);
    const label = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
    $("#calMonthLabel") && ($("#calMonthLabel").textContent = label);

    const grid = $("#calendarGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      blank.className = "calcell blank";
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(day)}`;
      const cell = document.createElement("button");
      cell.className = "calcell";
      cell.type = "button";
      cell.textContent = String(day);

      // highlight selected
      if (dateStr === state.selectedDate) cell.classList.add("selected");

      // small indicator if jobs exist
      const hasJobs = (state.dayData[dateStr]?.jobs?.length || 0) > 0;
      if (hasJobs) cell.classList.add("hasdata");

      cell.addEventListener("click", () => {
        state.selectedDate = dateStr;
        ensureDay(dateStr);
        renderCalendar();
      });

      cell.addEventListener("dblclick", () => {
        state.selectedDate = dateStr;
        ensureDay(dateStr);
        switchView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ---------------- Day Workspace ----------------
  function renderDay() {
    ensureDay(state.selectedDate);
    const dayObj = state.dayData[state.selectedDate];

    $("#dayTitle") && ($("#dayTitle").textContent = `Day Workspace: ${state.selectedDate}`);
    $("#contextLine") && ($("#contextLine").textContent = `Day Workspace: ${state.selectedDate}`);

    // tabs
    setActiveTab(state.activeTab);

    // jobs sheet
    const body = $("#jobsBody");
    if (body) {
      body.innerHTML = "";
      dayObj.jobs.forEach((job, idx) => {
        body.appendChild(jobRow(job, idx));
      });
      // if empty, show one sample row area (optional)
      if (dayObj.jobs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "sheet-row muted";
        empty.textContent = "No jobs yet. Tap “+ Add Job”.";
        body.appendChild(empty);
      }
    }

    // notes
    const notes = $("#dayNotes");
    if (notes) {
      notes.value = dayObj.notes || "";
    }
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;
    $$(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
    $$(".tab").forEach((t) => (t.hidden = true));
    const target = $(`#tab-${tabName}`);
    if (target) target.hidden = false;
    saveState();
  }

  function jobRow(job, idx) {
    const row = document.createElement("div");
    row.className = "sheet-row";

    const mkCell = (value, key) => {
      const cell = document.createElement("div");
      const input = document.createElement("input");
      input.value = value ?? "";
      input.type = "text";
      input.addEventListener("input", () => {
        const dayObj = state.dayData[state.selectedDate];
        dayObj.jobs[idx][key] = input.value;
        saveState();
      });
      cell.appendChild(input);
      return cell;
    };

    row.appendChild(mkCell(job.id, "id"));
    row.appendChild(mkCell(job.customer, "customer"));
    row.appendChild(mkCell(job.pickup, "pickup"));
    row.appendChild(mkCell(job.dropoff, "dropoff"));

    const amtCell = document.createElement("div");
    const amt = document.createElement("input");
    amt.type = "number";
    amt.inputMode = "decimal";
    amt.value = job.amount ?? "";
    amt.addEventListener("input", () => {
      const dayObj = state.dayData[state.selectedDate];
      dayObj.jobs[idx].amount = amt.value;
      saveState();
    });
    amtCell.appendChild(amt);
    row.appendChild(amtCell);

    return row;
  }

  // ---------------- Modal: Add Job ----------------
  function openJobModal() {
    ensureDay(state.selectedDate);
    const bd = $("#modalBackdrop");
    if (!bd) return;

    $("#modalTitle") && ($("#modalTitle").textContent = "Add Job");

    // prefill date
    const d = $("#jobDate");
    if (d) d.value = state.selectedDate;

    // clear fields
    const clear = (id) => { const el = $(id); if (el) el.value = ""; };
    clear("#jobCustomer");
    clear("#jobPickup");
    clear("#jobDropoff");
    clear("#jobAmount");
    clear("#jobNotes");

    bd.hidden = false;
    bd.classList.add("open");
  }

  function closeModal() {
    const bd = $("#modalBackdrop");
    if (!bd) return;
    bd.classList.remove("open");
    bd.hidden = true;
  }

  function saveJobFromModal() {
    const dayObj = state.dayData[state.selectedDate];

    const id = `J-${pad2(Math.floor(Math.random() * 90) + 10)}${pad2(Math.floor(Math.random() * 90) + 10)}`;
    const customer = $("#jobCustomer")?.value?.trim() || "";
    const pickup = $("#jobPickup")?.value?.trim() || "";
    const dropoff = $("#jobDropoff")?.value?.trim() || "";
    const amount = $("#jobAmount")?.value?.trim() || "";
    const notes = $("#jobNotes")?.value?.trim() || "";

    dayObj.jobs.unshift({ id, customer, pickup, dropoff, amount, notes });
    saveState();
    renderDay();
    closeModal();
  }

  // ---------------- Wiring ----------------
  function bindNav() {
    // sidebar nav
    $$(".navbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (!view) return;
        switchView(view);
      });
    });

    // toolbar
    $("#todayBtn")?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      ensureDay(state.selectedDate);
      renderDay();
      renderDashboard();
      saveState();
    });

    $("#prevBtn")?.addEventListener("click", () => {
      // move selected day -1
      const d = new Date(state.selectedDate + "T00:00:00");
      d.setDate(d.getDate() - 1);
      state.selectedDate = ymd(d);
      ensureDay(state.selectedDate);
      renderDay();
      renderDashboard();
      saveState();
    });

    $("#nextBtn")?.addEventListener("click", () => {
      const d = new Date(state.selectedDate + "T00:00:00");
      d.setDate(d.getDate() + 1);
      state.selectedDate = ymd(d);
      ensureDay(state.selectedDate);
      renderDay();
      renderDashboard();
      saveState();
    });

    $("#addJobBtn")?.addEventListener("click", () => { switchView("day"); openJobModal(); });
    $("#addJobInlineBtn")?.addEventListener("click", () => openJobModal());

    $("#openTodayBtn")?.addEventListener("click", () => switchView("day"));
    $("#openCalendarBtn")?.addEventListener("click", () => switchView("calendar"));

    // calendar prev/next
    $("#calPrevBtn")?.addEventListener("click", () => {
      const c = parseMonth(state.calCursor);
      c.setMonth(c.getMonth() - 1);
      state.calCursor = monthKey(c);
      renderCalendar();
      renderDashboard();
      saveState();
    });

    $("#calNextBtn")?.addEventListener("click", () => {
      const c = parseMonth(state.calCursor);
      c.setMonth(c.getMonth() + 1);
      state.calCursor = monthKey(c);
      renderCalendar();
      renderDashboard();
      saveState();
    });

    // tabs
    $$(".tabbtn").forEach((b) => {
      b.addEventListener("click", () => setActiveTab(b.dataset.tab));
    });

    // notes persistence
    $("#day
