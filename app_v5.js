/* FleetPro / Move-Master.OS — app_v5.js (FULL FILE)
   Purpose:
   - Keep current HTML/CSS layout
   - Restore rendering: Dashboard + Calendar + Day Workspace
   - Restore button wiring (sidebar + top toolbar)
   - Keep "JS: loaded" honest (only flips after init completes)
*/

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");

  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",              // dashboard | calendar | day | drivers | trucks | dispatch | finance | inventory | ai
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    dayData: {}                     // dayData["YYYY-MM-DD"] = { jobs:[], receipts:[], notes:"", warnings:[] }
  };

  let state = structuredClone(DEFAULT_STATE);

  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, structuredClone(DEFAULT_STATE)) : structuredClone(DEFAULT_STATE);
    if (!st.dayData) st.dayData = {};
    if (!st.view) st.view = "dashboard";
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    return st;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function setJSBadge(loaded, detail = "") {
    const el =
      $(".js-badge") ||
      $("#jsBadge") ||
      $("[data-js-badge]");

    if (!el) return;

    if (loaded) {
      el.textContent = "JS: loaded";
      el.classList.add("ok");
      el.classList.remove("bad");
      if (detail) el.title = detail;
    } else {
      el.textContent = "JS: not loaded";
      el.classList.add("bad");
      el.classList.remove("ok");
      if (detail) el.title = detail;
    }
  }

  function setLocalStorageBadge() {
    const el =
      $(".storage-badge") ||
      $("#storageBadge") ||
      $("[data-storage-badge]");

    if (!el) return;

    try {
      const bytes = (localStorage.getItem(STORAGE_KEY) || "").length;
      el.textContent = `Local Storage: ON · ${Math.max(1, Math.round(bytes / 1024))} KB`;
    } catch {
      el.textContent = "Local Storage: —";
    }
  }

  function showOnlyView(name) {
    // We support either:
    //  - <section id="dashboardView"> etc
    //  - <section id="dashboard"> etc
    const candidates = [
      "#dashboardView", "#calendarView", "#dayView",
      "#driversView", "#trucksView", "#dispatchView",
      "#financeView", "#inventoryView", "#aiView",
      "#dashboard", "#calendar", "#day",
      "#drivers", "#trucks", "#dispatch", "#finance", "#inventory", "#ai"
    ];

    // Hide all known views if present
    candidates.forEach((sel) => {
      const el = $(sel);
      if (el) el.style.display = "none";
    });

    const tryIds = [
      `#${name}View`,
      `#${name}`
    ];

    const viewEl = tryIds.map((s) => $(s)).find(Boolean);
    if (viewEl) viewEl.style.display = "";
  }

  function setActiveSidebar(name) {
    const btns = $$("[data-view], .navbtn, .sidebar a, .sidebar button");
    btns.forEach((b) => {
      const v = b.getAttribute("data-view") || b.dataset?.view || "";
      // If it's an <a href="#calendar"> we can infer too
      const href = b.getAttribute("href") || "";
      const inferred = href.startsWith("#") ? href.slice(1) : "";
      const key = (v || inferred || "").toLowerCase();
      if (!key) return;
      if (key === name) b.classList.add("active");
      else b.classList.remove("active");
    });
  }

  function switchView(name) {
    state.view = name;
    saveState();
    showOnlyView(name);
    setActiveSidebar(name);

    // Render on entry
    if (name === "dashboard") renderDashboard();
    if (name === "calendar") renderCalendar();
    if (name === "day") renderDay();
    if (name === "drivers") renderSimplePlaceholder("Drivers", "Drivers module placeholder.");
    if (name === "trucks") renderSimplePlaceholder("Trucks", "Trucks module placeholder.");
    if (name === "dispatch") renderSimplePlaceholder("Dispatch", "Dispatch module placeholder.");
    if (name === "finance") renderSimplePlaceholder("Finance", "Finance module placeholder.");
    if (name === "inventory") renderSimplePlaceholder("Inventory", "Inventory module placeholder.");
    if (name === "ai") renderSimplePlaceholder("AI Scanner", "AI Scanner placeholder.");
  }

  function bindNav() {
    // Sidebar + any buttons with data-view
    document.addEventListener("click", (e) => {
      const t = e.target;
      const btn = t.closest("[data-view], .navbtn, .sidebar a, .sidebar button");
      if (!btn) return;

      const dataView = (btn.getAttribute("data-view") || btn.dataset?.view || "").trim();
      const href = (btn.getAttribute("href") || "").trim();
      const inferred = href.startsWith("#") ? href.slice(1) : "";

      const view = (dataView || inferred).toLowerCase();
      if (!view) return;

      // Don’t let anchors jump the page
      if (href.startsWith("#")) e.preventDefault();

      switchView(view);
    });

    // Top toolbar buttons (Today, prev/next month, add job/receipt/note)
    document.addEventListener("click", (e) => {
      const t = e.target;

      // TODAY
      if (t.closest("[data-action='today'], #btnToday")) {
        state.selectedDate = ymd(new Date());
        state.calCursor = monthKey(new Date());
        saveState();
        if (state.view === "calendar") renderCalendar();
        if (state.view === "day") renderDay();
        if (state.view === "dashboard") renderDashboard();
      }

      // CAL PREV/NEXT
      if (t.closest("[data-action='calPrev'], #btnPrev")) {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm - 2, 1);
        state.calCursor = monthKey(d);
        saveState();
        if (state.view === "calendar" || state.view === "dashboard") {
          renderCalendar();
          renderDashboard();
        }
      }
      if (t.closest("[data-action='calNext'], #btnNext")) {
        const [yy, mm] = state.calCursor.split("-").map(Number);
        const d = new Date(yy, mm, 1);
        state.calCursor = monthKey(d);
        saveState();
        if (state.view === "calendar" || state.view === "dashboard") {
          renderCalendar();
          renderDashboard();
        }
      }

      // OPEN TODAY / OPEN CALENDAR quick actions (dashboard buttons)
      if (t.closest("[data-action='openToday'], #openToday")) {
        switchView("day");
      }
      if (t.closest("[data-action='openCalendar'], #openCalendar")) {
        switchView("calendar");
      }

      // Add Job/Receipt/Note (foundation placeholders)
      if (t.closest("[data-action='addJob'], #addJob")) {
        ensureDayBucket(state.selectedDate);
        state.dayData[state.selectedDate].jobs.push({
          id: makeJobId(),
          customer: "",
          pickup: "",
          dropoff: "",
          volume: ""
        });
        saveState();
        switchView("day");
      }
      if (t.closest("[data-action='addReceipt'], #addReceipt")) {
        ensureDayBucket(state.selectedDate);
        state.dayData[state.selectedDate].receipts.push({
          id: `R-${Date.now()}`,
          vendor: "",
          amount: ""
        });
        saveState();
        switchView("day");
      }
      if (t.closest("[data-action='addNote'], #addNote")) {
        ensureDayBucket(state.selectedDate);
        switchView("day");
        const ta = $("#notesArea") || $("#dayNotes") || $("textarea[data-notes]");
        if (ta) ta.focus();
      }
    });
  }

  function ensureDayBucket(dateKey) {
    if (!state.dayData[dateKey]) {
      state.dayData[dateKey] = { jobs: [], receipts: [], notes: "", warnings: [] };
    }
  }

  function makeJobId() {
    // Simple sequential-ish ID using today count
    ensureDayBucket(state.selectedDate);
    const n = state.dayData[state.selectedDate].jobs.length + 1;
    return `J-${String(n).padStart(4, "0")}`;
  }

  // ---------------------------
  // Rendering
  // ---------------------------

  function renderSimplePlaceholder(title, msg) {
    const host =
      $("#mainContent") ||
      $(".content") ||
      $(".main") ||
      $("main");

    if (!host) return;

    // Find an existing view container if any
    const view =
      $("#placeholderView") ||
      $("#dashboardView") ||
      $("#dashboard") ||
      host;

    // Don’t trash your layout. Just fill a known placeholder if present.
    const box = $("#placeholderBox") || $(".placeholder-box") || view;
    if (!box) return;

    // If box is literally the whole view, still fine.
    box.innerHTML = `
      <div class="card">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(msg)}</p>
      </div>
    `;
  }

  function renderDashboard() {
    showOnlyView("dashboard");

    // Targets (based on what you’ve had in earlier builds)
    const todayTitle = $("#todayTitle") || $("[data-today-title]");
    const todayMeta = $("#todayMeta") || $("[data-today-meta]");
    const pressureList = $("#pressureList") || $("[data-pressure-list]");
    const monthSnapshot = $("#monthSnapshot") || $("[data-month-snapshot]");
    const dashCalendar = $("#dashCalendar") || $("#dashboardCalendar") || $("[data-dash-calendar]");

    const sel = state.selectedDate;
    ensureDayBucket(sel);
    const bucket = state.dayData[sel];

    if (todayTitle) todayTitle.textContent = "Today";
    if (todayMeta) {
      todayMeta.textContent = `${bucket.jobs.length} job(s), ${bucket.receipts.length} receipt(s)`;
    }

    if (pressureList) {
      // Placeholder pressure points
      pressureList.innerHTML = `
        <li>Overbooked drivers: AI later</li>
        <li>Truck maintenance conflicts: rules later</li>
        <li>Receipts missing: driver app later</li>
      `;
    }

    if (monthSnapshot) {
      const [yy, mm] = state.calCursor.split("-").map(Number);
      const monthPrefix = `${yy}-${pad2(mm)}-`;
      let jobs = 0, receipts = 0, expenses = 0;
      Object.keys(state.dayData).forEach((k) => {
        if (k.startsWith(monthPrefix)) {
          jobs += (state.dayData[k].jobs || []).length;
          receipts += (state.dayData[k].receipts || []).length;
          (state.dayData[k].receipts || []).forEach((r) => {
            const amt = Number(String(r.amount || "").replace(/[^0-9.]/g, ""));
            if (!Number.isNaN(amt)) expenses += amt;
          });
        }
      });

      monthSnapshot.innerHTML = `
        <div>Jobs (month): <strong>${jobs}</strong></div>
        <div>Receipts (month): <strong>${receipts}</strong></div>
        <div>Expenses (month): <strong>$${expenses.toFixed(2)}</strong></div>
      `;
    }

    // Optional: tiny calendar on dashboard (if you have a container for it)
    if (dashCalendar) {
      dashCalendar.innerHTML = "";
      dashCalendar.appendChild(buildCalendarGrid(true));
    }

    setLocalStorageBadge();
  }

  function renderCalendar() {
    showOnlyView("calendar");

    const title =
      $("#calTitle") ||
      $("#calendarTitle") ||
      $("[data-cal-title]");

    if (title) {
      const [yy, mm] = state.calCursor.split("-").map(Number);
      const d = new Date(yy, mm - 1, 1);
      const label = d.toLocaleString(undefined, { month: "long", year: "numeric" });
      title.textContent = label;
    }

    // Main calendar grid target
    const grid =
      $("#calendarGrid") ||
      $("#calGrid") ||
      $("[data-calendar-grid]");

    if (grid) {
      grid.innerHTML = "";
      grid.appendChild(buildCalendarGrid(false));
    }

    setLocalStorageBadge();
  }

  function buildCalendarGrid(compact) {
    const wrap = document.createElement("div");
    wrap.className = compact ? "calendar-grid compact" : "calendar-grid";

    const [yy, mm] = state.calCursor.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(yy, mm, 0).getDate();

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      const b = document.createElement("button");
      b.className = "day blank";
      b.disabled = true;
      b.textContent = "";
      wrap.appendChild(b);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(yy, mm - 1, day);
      const key = ymd(d);

      const btn = document.createElement("button");
      btn.className = "day";
      btn.textContent = String(day);

      if (key === state.selectedDate) btn.classList.add("selected");

      // Mark days with jobs
      const has = state.dayData[key] && (state.dayData[key].jobs || []).length > 0;
      if (has) btn.classList.add("has-data");

      btn.addEventListener("click", () => {
        state.selectedDate = key;
        saveState();
        switchView("day");
      });

      wrap.appendChild(btn);
    }

    // Trailing blanks to fill rows (optional)
    if (!compact) {
      const total = startDow + daysInMonth;
      const remainder = total % 7;
      const add = remainder === 0 ? 0 : (7 - remainder);
      for (let i = 0; i < add; i++) {
        const b = document.createElement("button");
        b.className = "day blank";
        b.disabled = true;
        b.textContent = "";
        wrap.appendChild(b);
      }
    }

    return wrap;
  }

  function renderDay() {
    showOnlyView("day");
    const title = $("#dayTitle") || $("[data-day-title]");
    const sel = state.selectedDate;
    ensureDayBucket(sel);
    const bucket = state.dayData[sel];

    if (title) title.textContent = `Day Workspace: ${sel}`;

    // Jobs table body target
    const jobsBody =
      $("#jobsBody") ||
      $("#jobRows") ||
      $("[data-jobs-body]");

    if (jobsBody) {
      jobsBody.innerHTML = "";
      bucket.jobs.forEach((job, idx) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${escapeHtml(job.id || `J-${idx + 1}`)}</td>
          <td><input class="cell" data-field="customer" data-idx="${idx}" value="${escapeAttr(job.customer || "")}" /></td>
          <td><input class="cell" data-field="pickup" data-idx="${idx}" value="${escapeAttr(job.pickup || "")}" /></td>
          <td><input class="cell" data-field="dropoff" data-idx="${idx}" value="${escapeAttr(job.dropoff || "")}" /></td>
          <td><input class="cell" data-field="volume" data-idx="${idx}" value="${escapeAttr(job.volume || "")}" /></td>
        `;
        jobsBody.appendChild(tr);
      });
    }

    // Notes
    const notes =
      $("#notesArea") ||
      $("#dayNotes") ||
      $("textarea[data-notes]");

    if (notes) {
      notes.value = bucket.notes || "";
      notes.addEventListener("input", () => {
        ensureDayBucket(sel);
        state.dayData[sel].notes = notes.value;
        saveState();
        setLocalStorageBadge();
      }, { passive: true });
    }

    // Editable cells: real <input> so you stop getting the “one character at a time” iPad insanity
    document.addEventListener("input", (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains("cell")) return;

      const idx = Number(input.getAttribute("data-idx"));
      const field = input.getAttribute("data-field");
      if (!Number.isFinite(idx) || !field) return;

      ensureDayBucket(sel);
      const job = state.dayData[sel].jobs[idx];
      if (!job) return;

      job[field] = input.value;
      saveState();
      setLocalStorageBadge();
    });

    // Basic keyboard nav (Enter moves next field)
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.classList.contains("cell")) return;

      if (e.key === "Enter" || e.key === "Tab") {
        // Let Tab behave normally, but for Enter we move forward
        if (e.key === "Enter") {
          e.preventDefault();
          const cells = $$(".cell");
          const i = cells.indexOf(t);
          if (i >= 0 && cells[i + 1]) cells[i + 1].focus();
        }
      }
    });

    setLocalStorageBadge();
  }

  // ---------------------------
  // Escaping (basic)
  // ---------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    state = loadState();

    // Start pessimistic, flip to loaded only after successful init.
    setJSBadge(false, "Init started");
    setLocalStorageBadge();

    // Wire buttons/events
    bindNav();

    // Render initial view
    showOnlyView(state.view);
    if (state.view === "dashboard") renderDashboard();
    else if (state.view === "calendar") renderCalendar();
    else if (state.view === "day") renderDay();
    else switchView(state.view);

    // Success
    setJSBadge(true, "Init completed");
  }

  window.addEventListener("error", (e) => {
    setJSBadge(false, e?.message ? `Error: ${e.message}` : "Runtime error");
  });

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      setJSBadge(false, err?.message ? `Init failed: ${err.message}` : "Init failed");
      // Also log for sanity if you ever open dev tools
      console.error(err);
    }
  });
})();
window.addEventListener("error", (e) => {
  alert("JS ERROR: " + (e.message || "unknown"));
});
