/* FleetPro / Move-Master.OS — app_v5.js
   - Stable view switching (sidebar + toolbar)
   - Dashboard quick calendar + full month calendar
   - Day workspace (jobs table + notes)
   - Add Job modal (hidden by default, opens only by button)
   - localStorage persistence
   - Honest JS badge (loaded only after init succeeds)
*/

(() => {
  "use strict";

  // -------- Helpers --------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",              // dashboard | calendar | day | drivers | ...
    selectedDate: ymd(new Date()),  // YYYY-MM-DD
    calCursor: monthKey(new Date()),// YYYY-MM
    dayData: {}                     // { "YYYY-MM-DD": { jobs:[], notes:"" } }
  };

  let state = null;

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
    updateStoragePill();
  }

  // -------- Badge + pills --------
  function setJSBadge(text, ok) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.toggle("ok", !!ok);
    pill.classList.toggle("bad", !ok);
  }

  function updateStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;

    const bytes = (localStorage.getItem(STORAGE_KEY) || "").length;
    const kb = Math.max(1, Math.round(bytes / 1024));
    pill.textContent = `Local Storage: ON · ${kb} KB`;
  }

  // -------- View switching --------
  function switchView(viewName) {
    state.view = viewName;
    saveState();

    $$(".view").forEach(v => v.classList.remove("active"));
    const panel = $(`[data-view-panel="${viewName}"]`);
    if (panel) panel.classList.add("active");

    $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));

    // Context line
    const ctx = $("#contextLine");
    if (ctx) {
      const map = {
        dashboard: "Foundation mode (Smart)",
        calendar: "Calendar navigation (Month)",
        day: `Day Workspace: ${state.selectedDate}`,
        drivers: "Drivers",
        trucks: "Trucks",
        dispatch: "Dispatch",
        finance: "Finance",
        inventory: "Inventory",
        ai: "AI Scanner",
      };
      ctx.textContent = map[viewName] || "Foundation mode (Smart)";
    }

    // Re-render relevant screens
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDay();
  }

  function bindNav() {
    $$(".navbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        if (view) switchView(view);
      });
    });

    // Dashboard shortcuts
    const openToday = $("#openToday");
    if (openToday) openToday.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      saveState();
      switchView("day");
    });

    const openCal = $("#openCalendar");
    if (openCal) openCal.addEventListener("click", () => switchView("calendar"));

    // Toolbar
    const btnToday = $("#btnToday");
    if (btnToday) btnToday.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      renderAll();
    });

    const btnPrev = $("#btnPrev");
    if (btnPrev) btnPrev.addEventListener("click", () => shiftCursor(-1));

    const btnNext = $("#btnNext");
    if (btnNext) btnNext.addEventListener("click", () => shiftCursor(+1));

    // Add job buttons
    const btnAddJob = $("#btnAddJob");
    if (btnAddJob) btnAddJob.addEventListener("click", () => openJobModal());

    const btnAddJobInline = $("#btnAddJobInline");
    if (btnAddJobInline) btnAddJobInline.addEventListener("click", () => openJobModal());
  }

  function shiftCursor(deltaMonths) {
    // Move month cursor; also keeps calendar view aligned
    const [y, m] = state.calCursor.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() + deltaMonths);
    state.calCursor = monthKey(d);
    saveState();
    renderCalendar();
    renderDashboard();
  }

  // -------- Calendars --------
  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function buildMonthButtons(year, monthIndex0, onPick) {
    const total = daysInMonth(year, monthIndex0);
    const frag = document.createDocumentFragment();

    for (let day = 1; day <= total; day++) {
      const d = new Date(year, monthIndex0, day);
      const key = ymd(d);

      const b = document.createElement("button");
      b.className = "daybtn";
      b.textContent = String(day);
      b.dataset.date = key;

      if (key === state.selectedDate) b.classList.add("selected");

      b.addEventListener("click", () => onPick(key));
      frag.appendChild(b);
    }
    return frag;
  }

  function renderDashboard() {
    const todayLine = $("#todayLine");
    if (todayLine) {
      const dd = new Date(state.selectedDate);
      todayLine.textContent = `${state.selectedDate} · ${dd.toDateString()}`;
    }

    const dashCal = $("#dashboardCalendar");
    if (dashCal) {
      dashCal.innerHTML = "";
      const [y, m] = state.calCursor.split("-").map(Number);
      dashCal.appendChild(buildMonthButtons(y, m - 1, (dateKey) => {
        state.selectedDate = dateKey;
        saveState();
        switchView("day");
      }));
    }

    const snap = $("#monthSnapshot");
    if (snap) {
      const mk = state.calCursor;
      let jobs = 0;

      Object.keys(state.dayData).forEach(k => {
        if (k.startsWith(mk)) {
          const day = state.dayData[k];
          jobs += (day?.jobs?.length || 0);
        }
      });

      snap.textContent = `Jobs: ${jobs} · Receipts: 0 · Expenses: $0`;
    }
  }

  function renderCalendar() {
    const grid = $("#calendarGrid");
    const title = $("#calTitle");
    if (!grid) return;

    const [y, m] = state.calCursor.split("-").map(Number);
    const monthIndex0 = m - 1;

    if (title) {
      const label = new Date(y, monthIndex0, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
      title.textContent = label;
    }

    grid.innerHTML = "";
    grid.appendChild(buildMonthButtons(y, monthIndex0, (dateKey) => {
      state.selectedDate = dateKey;
      saveState();
      switchView("day");
    }));
  }

  // -------- Day workspace --------
  function ensureDay(dateKey) {
    if (!state.dayData[dateKey]) {
      state.dayData[dateKey] = { jobs: [], notes: "" };
    }
    if (!state.dayData[dateKey].jobs) state.dayData[dateKey].jobs = [];
    if (typeof state.dayData[dateKey].notes !== "string") state.dayData[dateKey].notes = "";
  }

  function renderDay() {
    ensureDay(state.selectedDate);

    const dayTitle = $("#dayTitle");
    if (dayTitle) dayTitle.textContent = `Day Workspace`;

    const ctx = $("#contextLine");
    if (ctx) ctx.textContent = `Day Workspace: ${state.selectedDate}`;

    // Tabs
    $$(".tabbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".tabbtn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const tab = btn.dataset.tab;
        $$(".tabpane").forEach(p => p.classList.remove("active"));
        const pane = $(`#tab-${tab}`);
        if (pane) pane.classList.add("active");
      }, { once: true }); // avoid stacking listeners
    });

    // Notes
    const notes = $("#dayNotes");
    if (notes) {
      notes.value = state.dayData[state.selectedDate].notes || "";
      notes.oninput = () => {
        state.dayData[state.selectedDate].notes = notes.value;
        saveState();
      };
    }

    // Jobs table
    const tbody = $("#jobsTable tbody");
    if (tbody) {
      tbody.innerHTML = "";
      const jobs = state.dayData[state.selectedDate].jobs || [];
      jobs.forEach(job => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHTML(job.id || "")}</td>
          <td>${escapeHTML(job.customer || "")}</td>
          <td>${escapeHTML(job.pickup || "")}</td>
          <td>${escapeHTML(job.dropoff || "")}</td>
          <td>${escapeHTML(job.amount ?? "")}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }

  // -------- Modal (Add Job) --------
  function forceHideModalOnBoot() {
    // This prevents the “modal opens first and traps me” situation.
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (overlay) overlay.hidden = true;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function openJobModal() {
    ensureDay(state.selectedDate);

    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (!overlay || !modal) return;

    // Prefill date
    const date = $("#jobDate");
    if (date) date.value = state.selectedDate;

    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeJobModal() {
    const overlay = $("#modalOverlay");
    const modal = $("#jobModal");
    if (!overlay || !modal) return;

    overlay.hidden = true;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function bindModal() {
    const overlay = $("#modalOverlay");
    const closeBtn = $("#jobModalClose");
    const cancelBtn = $("#jobCancel");
    const saveBtn = $("#jobSave");

    if (overlay) overlay.addEventListener("click", closeJobModal);
    if (closeBtn) closeBtn.addEventListener("click", closeJobModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeJobModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeJobModal();
    });

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        ensureDay(state.selectedDate);

        const job = {
          id: `J-${Math.floor(Math.random() * 9000 + 1000)}`,
          date: ($("#jobDate")?.value || state.selectedDate),
          customer: $("#jobCustomer")?.value || "",
          pickup: $("#jobPickup")?.value || "",
          dropoff: $("#jobDropoff")?.value || "",
          amount: $("#jobAmount")?.value || "",
          notes: $("#jobNotes")?.value || ""
        };

        state.dayData[state.selectedDate].jobs.push(job);
        saveState();
        closeJobModal();

        // Ensure we are in Day view to see it
        switchView("day");
      });
    }
  }

  // -------- Render everything --------
  function renderAll() {
    renderDashboard();
    renderCalendar();
    renderDay();
  }

  // -------- Boot --------
  function init() {
    // If ANY element mismatch was going to kill you, it would happen here.
    state = loadState();

    forceHideModalOnBoot();
    bindNav();
    bindModal();

    updateStoragePill();

    // Render current view cleanly
    switchView(state.view);

    // After everything succeeded:
    setJSBadge("JS: loaded", true);
  }

  // If init throws, we keep the badge honest and log why.
  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      console.error("FleetPro init failed:", err);
      setJSBadge("JS: error", false);
    }
  });
})();
