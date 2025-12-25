/* FleetPro / Move-Master.OS — app_v5.js
   Foundation:
   - Stable view switching (sidebar + buttons)
   - Calendar quick + month render
   - Day Workspace (jobs/receipts/notes)
   - Modal "Add Job" (proper overlay)
   - Honest JS badge (only loaded after init succeeds)
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const parseYMD = (s) => {
    // s: YYYY-MM-DD
    const [Y, M, D] = s.split("-").map(Number);
    return new Date(Y, (M || 1) - 1, D || 1);
  };
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // ---------- Storage ----------
  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",          // dashboard | calendar | day | drivers | trucks | dispatch | finance | inventory | ai
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()), // YYYY-MM
    dayTab: "jobs",             // jobs | receipts | notes
    dayData: {
      // "YYYY-MM-DD": { jobs:[{id,customer,pickup,dropoff,amount,notes}], notes:"" }
    }
  };

  let state = null;

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);

    // Normalize
    if (!st.view) st.view = "dashboard";
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    if (!st.dayTab) st.dayTab = "jobs";
    if (!st.dayData) st.dayData = {};
    return st;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateStoragePill();
  }

  // ---------- Status Pills ----------
  function setJSStatusLoaded() {
    const pill = $("#jsStatusPill");
    if (!pill) return;
    pill.classList.remove("error");
    pill.classList.add("loaded");
    pill.textContent = "JS: loaded";
  }

  function setJSStatusError(msg) {
    const pill = $("#jsStatusPill");
    if (!pill) return;
    pill.classList.remove("loaded");
    pill.classList.add("error");
    pill.textContent = "JS: error";
    console.error("[FleetPro] JS init error:", msg);
  }

  function updateStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;
    let size = 0;
    try { size = (localStorage.getItem(STORAGE_KEY) || "").length; } catch {}
    pill.textContent = `Local Storage: ON · ${Math.max(1, Math.round(size / 1024))} KB`;
  }

  // ---------- View Switching ----------
  function switchView(viewName) {
    state.view = viewName;

    // Activate sidebar button
    $$(".navbtn").forEach((b) => {
      const v = b.dataset.view;
      b.classList.toggle("active", v === viewName);
    });

    // Activate view panel
    $$(".view").forEach((v) => v.classList.remove("active"));
    const panel = $(`#view-${viewName}`);
    if (panel) panel.classList.add("active");

    // Header text
    const title = $("#pageTitle");
    const ctx = $("#contextLine");
    if (title) title.textContent = "Operations";

    if (ctx) {
      if (viewName === "day") ctx.textContent = `Day Workspace: ${state.selectedDate}`;
      else if (viewName === "calendar") ctx.textContent = "Calendar navigation (Month)";
      else ctx.textContent = "Foundation mode (Smart)";
    }

    // Render as needed
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDay();

    saveState();
  }

  function bindNav() {
    // Sidebar nav
    const sideNav = $("#sideNav");
    if (sideNav) {
      sideNav.addEventListener("click", (e) => {
        const btn = e.target.closest(".navbtn");
        if (!btn) return;
        const v = btn.dataset.view;
        if (!v) return;
        switchView(v);
      });
    }

    // Tabs in day view
    const dayTabs = $("#dayTabs");
    if (dayTabs) {
      dayTabs.addEventListener("click", (e) => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        const t = tab.dataset.tab;
        if (!t) return;
        setDayTab(t);
      });
    }

    // Toolbar + dashboard buttons (event delegation)
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      handleAction(action);
    });
  }

  // ---------- Actions ----------
  function handleAction(action) {
    switch (action) {
      case "openToday":
      case "today":
        state.selectedDate = ymd(new Date());
        switchView("day");
        return;

      case "openCalendar":
        switchView("calendar");
        return;

      case "prevDay":
        moveDay(-1);
        return;

      case "nextDay":
        moveDay(+1);
        return;

      case "prevMonth":
        moveMonth(-1);
        return;

      case "nextMonth":
        moveMonth(+1);
        return;

      case "addJobDay":
      case "dayAddJob":
        openJobModal();
        return;

      case "addReceiptDay":
      case "dayAddReceipt":
        alert("Receipts: next phase (foundation placeholder).");
        return;

      case "addNoteDay":
      case "dayAddNote":
        // jump to notes tab
        switchView("day");
        setDayTab("notes");
        $("#dayNotes")?.focus();
        return;

      case "exportLater":
      case "syncLater":
        alert("That’s later. Literally. Foundation build.");
        return;

      default:
        // no-op
        return;
    }
  }

  function moveDay(delta) {
    const d = parseYMD(state.selectedDate);
    d.setDate(d.getDate() + delta);
    state.selectedDate = ymd(d);
    // keep calendar cursor aligned
    state.calCursor = monthKey(d);

    if (state.view === "day") renderDay();
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();

    saveState();
  }

  function moveMonth(delta) {
    const d = parseYMD(`${state.calCursor}-01`);
    d.setMonth(d.getMonth() + delta);
    state.calCursor = monthKey(d);
    renderCalendar();
    saveState();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const summary = $("#dashSummary");
    if (summary) {
      const day = getDayRecord(state.selectedDate);
      const jobs = day.jobs.length;
      summary.textContent = `${state.selectedDate} — ${jobs} job(s)`;
    }

    // Quick calendar uses the current month cursor
    renderCalendarGrid({
      rootGrid: $("#dashCalendarGrid"),
      labelEl: $("#dashMonthLabel"),
      cursor: state.calCursor,
      compact: true
    });

    // Month stats (simple counts)
    const [Y, M] = state.calCursor.split("-");
    let jobsMonth = 0;
    let receiptsMonth = 0;
    let warningsMonth = 0;
    let expensesMonth = 0;

    Object.entries(state.dayData).forEach(([date, rec]) => {
      if (date.startsWith(`${Y}-${M}`)) {
        jobsMonth += (rec.jobs?.length || 0);
        receiptsMonth += (rec.receipts?.length || 0);
        warningsMonth += (rec.warnings?.length || 0);
        // expenses placeholder
      }
    });

    $("#statJobsMonth") && ($("#statJobsMonth").textContent = String(jobsMonth));
    $("#statReceiptsMonth") && ($("#statReceiptsMonth").textContent = String(receiptsMonth));
    $("#statWarningsMonth") && ($("#statWarningsMonth").textContent = String(warningsMonth));
    $("#statExpensesMonth") && ($("#statExpensesMonth").textContent = `$${expensesMonth}`);
  }

  // ---------- Calendar ----------
  function renderCalendar() {
    renderCalendarGrid({
      rootGrid: $("#calendarGrid"),
      labelEl: $("#calendarMonthLabel"),
      cursor: state.calCursor,
      compact: false
    });

    const hint = $("#calendarHint");
    if (hint) hint.textContent = `Selected: ${state.selectedDate}`;
  }

  function renderCalendarGrid({ rootGrid, labelEl, cursor, compact }) {
    if (!rootGrid) return;

    const base = parseYMD(`${cursor}-01`);
    const year = base.getFullYear();
    const month = base.getMonth();

    const monthName = base.toLocaleString(undefined, { month: "long" });
    if (labelEl) labelEl.textContent = `${monthName} ${year}`;

    rootGrid.innerHTML = "";

    // Determine first day offset (Sun=0..Sat=6)
    const first = new Date(year, month, 1);
    const startDow = first.getDay();

    // Days in month
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    // Fill blanks before first day
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      blank.className = "daycell muted";
      blank.textContent = " ";
      rootGrid.appendChild(blank);
    }

    const today = new Date();
    const selected = parseYMD(state.selectedDate);

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "daycell";
      cell.textContent = String(day);

      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, selected)) cell.classList.add("selected");

      cell.addEventListener("click", () => {
        state.selectedDate = ymd(d);
        state.calCursor = monthKey(d);
        // open day workspace from calendar taps
        switchView("day");
      });

      rootGrid.appendChild(cell);
    }
  }

  // ---------- Day Workspace ----------
  function getDayRecord(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], notes: "" };
    }
    // Normalize
    if (!Array.isArray(state.dayData[dateStr].jobs)) state.dayData[dateStr].jobs = [];
    if (typeof state.dayData[dateStr].notes !== "string") state.dayData[dateStr].notes = "";
    return state.dayData[dateStr];
  }

  function setDayTab(tabName) {
    state.dayTab = tabName;

    $$("#dayTabs .tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tabName);
    });
    $$(".tabpanel").forEach((p) => p.classList.remove("active"));
    $(`#tab-${tabName}`)?.classList.add("active");

    saveState();
  }

  function renderDay() {
    const dayRec = getDayRecord(state.selectedDate);

    const label = $("#dayLabel");
    if (label) label.textContent = state.selectedDate;

    // Tabs
    setDayTab(state.dayTab);

    // Notes
    const notes = $("#dayNotes");
    if (notes) {
      notes.value = dayRec.notes || "";
      notes.oninput = () => {
        dayRec.notes = notes.value;
        saveState();
      };
    }

    // Jobs table
    renderJobsTable(dayRec);
  }

  function renderJobsTable(dayRec) {
    const tbody = $("#jobsTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // If empty, show one starter row like your screenshots
    if (dayRec.jobs.length === 0) {
      dayRec.jobs.push({
        id: `J-${Math.floor(1000 + Math.random() * 9000)}`,
        customer: "",
        pickup: "",
        dropoff: "",
        amount: "",
        notes: ""
      });
      saveState();
    }

    dayRec.jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");

      tr.appendChild(tdInput(job, "id", idx, { placeholder: "J-0000" }));
      tr.appendChild(tdInput(job, "customer", idx, { placeholder: "Customer" }));
      tr.appendChild(tdInput(job, "pickup", idx, { placeholder: "Pickup" }));
      tr.appendChild(tdInput(job, "dropoff", idx, { placeholder: "Dropoff" }));
      tr.appendChild(tdInput(job, "amount", idx, { placeholder: "0", type: "number" }));

      tbody.appendChild(tr);
    });
  }

  function tdInput(job, key, idx, opts = {}) {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.className = "cell-input";
    input.value = job[key] ?? "";
    input.placeholder = opts.placeholder || "";
    input.type = opts.type || "text";

    input.addEventListener("input", () => {
      job[key] = input.value;
      saveState();
      // keep dashboard stats fresh if user is on dashboard later
    });

    td.appendChild(input);
    return td;
  }

  // ---------- Modal: Add Job ----------
  function bindModal() {
    const backdrop = $("#modalBackdrop");
    const closeBtn = $("#modalClose");
    const cancelBtn = $("#jobCancel");
    const form = $("#jobForm");

    if (!backdrop || !form) return;

    function close() {
      backdrop.hidden = true;
    }

    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const date = $("#jobDate")?.value || state.selectedDate;
      const customer = $("#jobCustomer")?.value || "";
      const pickup = $("#jobPickup")?.value || "";
      const dropoff = $("#jobDropoff")?.value || "";
      const amount = $("#jobAmount")?.value || "";
      const notes = $("#jobNotes")?.value || "";

      const rec = getDayRecord(date);
      rec.jobs.push({
        id: `J-${Math.floor(1000 + Math.random() * 9000)}`,
        customer, pickup, dropoff, amount, notes
      });

      state.selectedDate = date;
      state.calCursor = monthKey(parseYMD(date));
      saveState();

      close();
      switchView("day");
      renderDay();
      renderDashboard();
    });
  }

  function openJobModal() {
    const backdrop = $("#modalBackdrop");
    if (!backdrop) return;

    // default date = selected date
    const d = state.selectedDate;
    $("#jobDate") && ($("#jobDate").value = d);

    // clear fields
    $("#jobCustomer") && ($("#jobCustomer").value = "");
    $("#jobPickup") && ($("#jobPickup").value = "");
    $("#jobDropoff") && ($("#jobDropoff").value = "");
    $("#jobAmount") && ($("#jobAmount").value = "");
    $("#jobNotes") && ($("#jobNotes").value = "");

    backdrop.hidden = false;
    $("#jobCustomer")?.focus();
  }

  // ---------- Boot ----------
  function init() {
    state = loadState();
    updateStoragePill();

    bindNav();
    bindModal();

    // First render
    switchView(state.view);

    // Make sure day tab restores properly
    if (state.view === "day") setDayTab(state.dayTab);

    // If we got here without throwing, JS is genuinely running.
    setJSStatusLoaded();
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      setJSStatusError(err?.message || err);
    }
  });

})();
