/* FleetPro / Move-Master.OS — app_v5.js
   Purpose:
   - Keep your current HTML/CSS layout
   - Restore rendering: Dashboard + Calendar + Day Workspace
   - Restore button wiring (sidebar + top toolbar)
   - Fix "one character at a time" editing by using real inputs/textareas
   - Keep "JS: loaded" honest (only flips after init succeeds)
*/

(() => {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  // -----------------------------
  // State
  // -----------------------------
  const DEFAULT_STATE = {
    view: "dashboard", // dashboard | calendar | day
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    dayData: {
      // "YYYY-MM-DD": { jobs: [], receipts: [], notes: "", warnings: [] }
    },
  };

  let state = structuredClone(DEFAULT_STATE);

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);
    // normalize
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

  // -----------------------------
  // "JS Loaded" badge (honest)
  // -----------------------------
  function setJSLoaded(ok) {
    // Try a few likely selectors based on your UI history
    const badge =
      $("#jsBadge") ||
      $("[data-js-badge]") ||
      $(".js-badge") ||
      $(".status-js");

    if (!badge) return;

    // Your UI shows "JS: not loaded" / "JS: loaded"
    badge.textContent = ok ? "JS: loaded" : "JS: not loaded";

    // Optional: add a class for styling if your CSS supports it
    badge.classList.toggle("is-ok", !!ok);
    badge.classList.toggle("is-bad", !ok);
  }

  function updateLocalStorageBadge() {
    const el =
      $("#localStorageBadge") ||
      $("[data-ls-badge]") ||
      $(".local-storage-badge");

    if (!el) return;
    const bytes = localStorage.getItem(STORAGE_KEY)?.length || 0;
    el.textContent = `Local Storage: ON • ${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  // -----------------------------
  // View switching (robust)
  // -----------------------------
  function showView(name) {
    state.view = name;
    saveState();

    // These IDs match what we used previously in your layout history
    const dashboard = $("#dashboardView");
    const calendar = $("#calendarView");
    const day = $("#dayView");

    // If your HTML uses different IDs, this still works if views have [data-view-panel]
    const panels = $$("[data-view-panel]");
    if (panels.length) {
      panels.forEach(p => p.classList.toggle("is-active", p.getAttribute("data-view-panel") === name));
    }

    if (dashboard) dashboard.style.display = (name === "dashboard") ? "" : "none";
    if (calendar) calendar.style.display = (name === "calendar") ? "" : "none";
    if (day) day.style.display = (name === "day") ? "" : "none";

    // Highlight sidebar
    $$("[data-view]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === name);
    });

    // Render the active view
    if (name === "dashboard") renderDashboard();
    if (name === "calendar") renderCalendarMonth();
    if (name === "day") renderDayWorkspace();
  }

  // -----------------------------
  // DOM hooks (sidebar + toolbar)
  // -----------------------------
  function bindNav() {
    // Sidebar items: expect either [data-view] or .navbtn with data-view
    const viewButtons = $$("[data-view], .navbtn[data-view]");
    viewButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const view = btn.getAttribute("data-view");
        if (!view) return;
        showView(view);
      }, { passive: false });
    });

    // Top toolbar quick actions
    const openTodayBtn = $("#openTodayBtn") || $("[data-action='open-today']");
    if (openTodayBtn) {
      openTodayBtn.addEventListener("click", (e) => {
        e.preventDefault();
        state.selectedDate = ymd(new Date());
        saveState();
        showView("day");
      }, { passive: false });
    }

    const openCalendarBtn = $("#openCalendarBtn") || $("[data-action='open-calendar']");
    if (openCalendarBtn) {
      openCalendarBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showView("calendar");
      }, { passive: false });
    }

    // Calendar month nav
    const prev = $("#calPrev") || $("[data-action='cal-prev']");
    const next = $("#calNext") || $("[data-action='cal-next']");
    const today = $("#calToday") || $("[data-action='cal-today']");

    if (prev) prev.addEventListener("click", (e) => { e.preventDefault(); shiftMonth(-1); }, { passive: false });
    if (next) next.addEventListener("click", (e) => { e.preventDefault(); shiftMonth(1); }, { passive: false });
    if (today) today.addEventListener("click", (e) => {
      e.preventDefault();
      state.calCursor = monthKey(new Date());
      saveState();
      renderCalendarMonth();
    }, { passive: false });

    // Day workspace top “+ Job / + Receipt / + Note”
    const addJob = $("#addJobBtn") || $("[data-action='add-job']");
    const addReceipt = $("#addReceiptBtn") || $("[data-action='add-receipt']");
    const addNote = $("#addNoteBtn") || $("[data-action='add-note']");

    if (addJob) addJob.addEventListener("click", (e) => { e.preventDefault(); showView("day"); addJobRow(); }, { passive: false });
    if (addReceipt) addReceipt.addEventListener("click", (e) => { e.preventDefault(); showView("day"); addReceiptRow(); }, { passive: false });
    if (addNote) addNote.addEventListener("click", (e) => { e.preventDefault(); showView("day"); focusNotes(); }, { passive: false });
  }

  // -----------------------------
  // Dashboard rendering
  // -----------------------------
  function renderDashboard() {
    const wrap = $("#dashboardContent") || $("#dashboardView");
    if (!wrap) return;

    // Stats from selected day
    const day = ensureDay(state.selectedDate);
    const jobsCount = day.jobs.length;
    const receiptsCount = day.receipts.length;

    // Month snapshot
    const mk = state.calCursor;
    const monthTotals = computeMonthTotals(mk);

    // Try to populate existing placeholders if your HTML already has them
    const jobsEl = $("#dashJobsCount");
    const receiptsEl = $("#dashReceiptsCount");
    const dateEl = $("#dashSelectedDate");

    if (jobsEl) jobsEl.textContent = String(jobsCount);
    if (receiptsEl) receiptsEl.textContent = String(receiptsCount);
    if (dateEl) dateEl.textContent = state.selectedDate;

    // If your dashboard is currently blank, we can inject a safe fallback block
    const existingSnapshot = $("#monthSnapshot") || $("[data-block='month-snapshot']");
    if (existingSnapshot) {
      const mj = existingSnapshot.querySelector("[data-snap='jobs']");
      const mr = existingSnapshot.querySelector("[data-snap='receipts']");
      const me = existingSnapshot.querySelector("[data-snap='expenses']");
      if (mj) mj.textContent = String(monthTotals.jobs);
      if (mr) mr.textContent = String(monthTotals.receipts);
      if (me) me.textContent = `$${monthTotals.expenses.toFixed(0)}`;
    }

    // Optional small calendar preview on dashboard (if element exists)
    const mini = $("#dashboardCalendarPreview") || $("[data-mini-calendar]");
    if (mini) {
      mini.innerHTML = buildMiniCalendarHTML(state.calCursor);
      wireCalendarClicks(mini);
    }
  }

  function computeMonthTotals(mk) {
    let jobs = 0, receipts = 0, expenses = 0;
    for (const [k, v] of Object.entries(state.dayData)) {
      if (!k.startsWith(mk)) continue;
      jobs += (v.jobs?.length || 0);
      receipts += (v.receipts?.length || 0);
      // placeholder: if receipts have amount fields later
      for (const r of (v.receipts || [])) {
        const amt = Number(r.amount || 0);
        if (Number.isFinite(amt)) expenses += amt;
      }
    }
    return { jobs, receipts, expenses };
  }

  // -----------------------------
  // Calendar rendering (Month)
  // -----------------------------
  function shiftMonth(delta) {
    const [yy, mm] = state.calCursor.split("-").map(Number);
    const d = new Date(yy, mm - 1 + delta, 1);
    state.calCursor = monthKey(d);
    saveState();
    renderCalendarMonth();
  }

  function renderCalendarMonth() {
    const grid = $("#calendarGrid") || $("[data-calendar-grid]");
    const title = $("#calendarTitle") || $("[data-calendar-title]");
    if (!grid) return;

    const [yy, mm] = state.calCursor.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const last = new Date(yy, mm, 0); // last day of month
    const monthName = first.toLocaleString(undefined, { month: "long", year: "numeric" });

    if (title) title.textContent = monthName;

    // Build a 6-week grid
    const startDow = first.getDay(); // 0 Sun
    const totalDays = last.getDate();

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) cells.push(new Date(yy, mm - 1, day));
    while (cells.length < 42) cells.push(null);

    grid.innerHTML = cells.map((d) => {
      if (!d) return `<button class="cal-day is-empty" disabled></button>`;
      const key = ymd(d);
      const hasData = !!state.dayData[key];
      const isToday = key === ymd(new Date());
      const isSelected = key === state.selectedDate;
      return `
        <button class="cal-day ${hasData ? "has-data" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}"
                data-date="${key}">
          <div class="cal-num">${d.getDate()}</div>
        </button>
      `;
    }).join("");

    wireCalendarClicks(grid);

    // If calendar view has an instruction element, update it
    const hint = $("#calendarHint") || $("[data-calendar-hint]");
    if (hint) hint.textContent = "Tap any day to open the Day Workspace.";
  }

  function buildMiniCalendarHTML(mk) {
    const [yy, mm] = mk.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const last = new Date(yy, mm, 0);
    const startDow = first.getDay();
    const totalDays = last.getDate();

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) cells.push(new Date(yy, mm - 1, day));
    while (cells.length < 42) cells.push(null);

    return `
      <div class="mini-cal">
        ${cells.map(d => {
          if (!d) return `<button class="mini-day is-empty" disabled></button>`;
          const key = ymd(d);
          const hasData = !!state.dayData[key];
          return `<button class="mini-day ${hasData ? "has-data" : ""}" data-date="${key}">${d.getDate()}</button>`;
        }).join("")}
      </div>
    `;
  }

  function wireCalendarClicks(root) {
    $$("[data-date]", root).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const date = btn.getAttribute("data-date");
        if (!date) return;
        state.selectedDate = date;
        saveState();
        showView("day");
      }, { passive: false });
    });
  }

  // -----------------------------
  // Day Workspace (Jobs / Receipts / Notes)
  // -----------------------------
  function ensureDay(dateKey) {
    if (!state.dayData[dateKey]) {
      state.dayData[dateKey] = {
        jobs: [],
        receipts: [],
        notes: "",
        warnings: [],
      };
      saveState();
    }
    return state.dayData[dateKey];
  }

  function renderDayWorkspace() {
    const day = ensureDay(state.selectedDate);

    const dayTitle = $("#dayTitle") || $("[data-day-title]");
    if (dayTitle) dayTitle.textContent = state.selectedDate;

    renderJobsTable(day);
    renderReceiptsTable(day);
    renderNotes(day);

    // Update warnings (simple: missing fields)
    renderWarnings(day);
  }

  function renderWarnings(day) {
    const box = $("#warningsBox") || $("[data-warnings]");
    if (!box) return;

    const warnings = [];
    for (const j of day.jobs) {
      if (!j.dropoff) warnings.push(`${j.id || "Job"} missing dropoff`);
      if (!j.volume) warnings.push(`${j.id || "Job"} missing volume`);
    }

    if (!warnings.length) {
      box.innerHTML = `<div class="muted">No warnings.</div>`;
      return;
    }

    box.innerHTML = `
      <div class="warn-title">Warnings</div>
      <ul class="warn-list">
        ${warnings.slice(0, 8).map(w => `<li>${escapeHTML(w)}</li>`).join("")}
      </ul>
    `;
  }

  // --- Jobs table (editable inputs to fix “one character at a time”) ---
  function renderJobsTable(day) {
    const tbody = $("#jobsTbody") || $("[data-jobs-tbody]");
    if (!tbody) return;

    tbody.innerHTML = day.jobs.map((job, idx) => {
      return `
        <tr data-idx="${idx}">
          <td><input class="cell-input" data-field="id" value="${escapeAttr(job.id || "")}" placeholder="J-0001"></td>
          <td><input class="cell-input" data-field="customer" value="${escapeAttr(job.customer || "")}" placeholder="Customer"></td>
          <td><input class="cell-input" data-field="pickup" value="${escapeAttr(job.pickup || "")}" placeholder="Pickup address"></td>
          <td><input class="cell-input" data-field="dropoff" value="${escapeAttr(job.dropoff || "")}" placeholder="Dropoff address"></td>
          <td><input class="cell-input" data-field="volume" value="${escapeAttr(job.volume || "")}" placeholder="cu ft"></td>
          <td><button class="mini-btn danger" data-action="delete-job">✕</button></td>
        </tr>
      `;
    }).join("");

    // Bind input events (real typing, no iPad weirdness)
    $$("input.cell-input", tbody).forEach(inp => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const idx = Number(tr?.getAttribute("data-idx"));
        const field = inp.getAttribute("data-field");
        if (!Number.isFinite(idx) || !field) return;
        day.jobs[idx][field] = inp.value;
        saveState();
      });
    });

    // Enter/Tab navigation (basic)
    $$("input.cell-input", tbody).forEach(inp => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focusNextInput(inp);
        }
      });
    });

    $$("[data-action='delete-job']", tbody).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tr = btn.closest("tr");
        const idx = Number(tr?.getAttribute("data-idx"));
        if (!Number.isFinite(idx)) return;
        day.jobs.splice(idx, 1);
        saveState();
        renderDayWorkspace();
      }, { passive: false });
    });
  }

  function addJobRow() {
    const day = ensureDay(state.selectedDate);
    day.jobs.push({ id: "", customer: "", pickup: "", dropoff: "", volume: "" });
    saveState();
    renderDayWorkspace();
    // focus first input of new row
    setTimeout(() => {
      const rows = $$("[data-jobs-tbody] tr, #jobsTbody tr");
      const last = rows[rows.length - 1];
      const firstInput = last?.querySelector("input");
      firstInput?.focus();
    }, 0);
  }

  // --- Receipts table (placeholder editable) ---
  function renderReceiptsTable(day) {
    const tbody = $("#receiptsTbody") || $("[data-receipts-tbody]");
    if (!tbody) return;

    tbody.innerHTML = day.receipts.map((r, idx) => {
      return `
        <tr data-idx="${idx}">
          <td><input class="cell-input" data-field="vendor" value="${escapeAttr(r.vendor || "")}" placeholder="Vendor"></td>
          <td><input class="cell-input" data-field="amount" value="${escapeAttr(r.amount || "")}" placeholder="$"></td>
          <td><input class="cell-input" data-field="note" value="${escapeAttr(r.note || "")}" placeholder="Note"></td>
          <td><button class="mini-btn danger" data-action="delete-receipt">✕</button></td>
        </tr>
      `;
    }).join("");

    $$("input.cell-input", tbody).forEach(inp => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const idx = Number(tr?.getAttribute("data-idx"));
        const field = inp.getAttribute("data-field");
        if (!Number.isFinite(idx) || !field) return;
        day.receipts[idx][field] = inp.value;
        saveState();
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focusNextInput(inp);
        }
      });
    });

    $$("[data-action='delete-receipt']", tbody).forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tr = btn.closest("tr");
        const idx = Number(tr?.getAttribute("data-idx"));
        if (!Number.isFinite(idx)) return;
        day.receipts.splice(idx, 1);
        saveState();
        renderDayWorkspace();
      }, { passive: false });
    });
  }

  function addReceiptRow() {
    const day = ensureDay(state.selectedDate);
    day.receipts.push({ vendor: "", amount: "", note: "" });
    saveState();
    renderDayWorkspace();
    setTimeout(() => {
      const rows = $$("[data-receipts-tbody] tr, #receiptsTbody tr");
      const last = rows[rows.length - 1];
      last?.querySelector("input")?.focus();
    }, 0);
  }

  // --- Notes (textarea so it scrolls and types normally) ---
  function renderNotes(day) {
    const area = $("#dayNotes") || $("[data-day-notes]");
    if (!area) return;

    // If your HTML already uses a textarea, great. If it’s a div, we’ll convert the behavior.
    if (area.tagName.toLowerCase() === "textarea" || area.tagName.toLowerCase() === "input") {
      area.value = day.notes || "";
      area.addEventListener("input", () => {
        day.notes = area.value;
        saveState();
      });
      return;
    }

    // If it's not a textarea, we still can make it editable, but textarea is best.
    area.textContent = day.notes || "";
  }

  function focusNotes() {
    showView("day");
    const area = $("#dayNotes") || $("[data-day-notes]");
    if (!area) return;
    setTimeout(() => area.focus?.(), 0);
  }

  // -----------------------------
  // Keyboard focus navigation
  // -----------------------------
  function focusNextInput(current) {
    const all = $$("input.cell-input, textarea");
    const idx = all.indexOf(current);
    if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
  }

  // -----------------------------
  // Safety: prevent blank screen if something fails
  // -----------------------------
  function crashReport(err) {
    console.error(err);
    setJSLoaded(false);

    const box = $("#crashBox") || $("[data-crash]");
    if (box) {
      box.style.display = "";
      box.textContent = `JS crashed: ${err?.message || err}`;
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    try {
      state = loadState();
      bindNav();

      // Render both dashboard + calendar once so UI is not empty
      renderDashboard();
      renderCalendarMonth();
      renderDayWorkspace();

      // Go to last view
      showView(state.view);

      updateLocalStorageBadge();
      setJSLoaded(true);
    } catch (err) {
      crashReport(err);
    }
  });

  // -----------------------------
  // Small escaping helpers
  // -----------------------------
  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function escapeAttr(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

})();
