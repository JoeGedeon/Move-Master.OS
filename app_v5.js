/* FleetPro / Move-Master.OS — app_v5.js
   Purpose:
   - Keep your layout
   - Fix nav + toolbar wiring
   - Render: Dashboard + Calendar + Day Workspace
   - Make JS badge honest (only flips after init runs)
*/
(() => {
  "use strict";

  // ---------------- Helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",             // dashboard | calendar | day | drivers | ...
    selectedDate: ymd(new Date()), // YYYY-MM-DD
    calCursor: monthKey(new Date()),
    dayData: {
      // "YYYY-MM-DD": { jobs:[], receipts:[], notes:"", warnings:[] }
    },
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStoragePill(true);
    } catch {
      updateStoragePill(false);
    }
  }

  function updateStoragePill(ok) {
    const el = $("#storagePill");
    if (!el) return;
    if (!ok) {
      el.textContent = "Local Storage: blocked";
      return;
    }
    const bytes = (localStorage.getItem(STORAGE_KEY) || "").length;
    el.textContent = `Local Storage: ON · ${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function setJSLoaded(ok) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = ok ? "JS: loaded" : "JS: not loaded";
    pill.style.opacity = ok ? "1" : "0.7";
  }

  function setHeader(title, context) {
    const t = $("#pageTitle");
    const c = $("#contextLine");
    if (t) t.textContent = title;
    if (c) c.textContent = context;
  }

  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], receipts: [], notes: "", warnings: [] };
    }
    return state.dayData[dateStr];
  }

  function parseYMD(dateStr) {
    const [Y, M, D] = dateStr.split("-").map(Number);
    return new Date(Y, M - 1, D);
  }

  // ---------------- View switching ----------------
  function showView(viewName) {
    state.view = viewName;
    saveState();

    $$(".view").forEach(v => v.classList.remove("is-visible"));
    const target = $(`#view-${viewName}`);
    if (target) target.classList.add("is-visible");

    // highlight sidebar
    $$(".navbtn").forEach(b => b.classList.remove("is-active"));
    const activeBtn = $(`.navbtn[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add("is-active");

    // update header + render relevant stuff
    if (viewName === "dashboard") {
      setHeader("Operations", "Foundation mode (Smart)");
      renderDashboard();
    } else if (viewName === "calendar") {
      setHeader("Operations", "Calendar navigation (Month)");
      renderCalendar();
    } else if (viewName === "day") {
      setHeader("Operations", `Day Workspace: ${state.selectedDate}`);
      renderDay();
    } else {
      setHeader("Operations", viewName[0].toUpperCase() + viewName.slice(1));
    }
  }

  // ---------------- Bind UI ----------------
  function bindNav() {
    // sidebar nav
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      const view = btn.dataset.view;
      if (!view) return;
      showView(view);
    });

    // top toolbar buttons
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    btnToday?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      if (state.view === "day") renderDay();
      if (state.view === "calendar") renderCalendar();
      if (state.view === "dashboard") renderDashboard();
    });

    btnPrev?.addEventListener("click", () => {
      // prev month if calendar, prev day if day
      if (state.view === "calendar") {
        const d = parseYMD(state.calCursor + "-01");
        d.setMonth(d.getMonth() - 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else if (state.view === "day") {
        const d = parseYMD(state.selectedDate);
        d.setDate(d.getDate() - 1);
        state.selectedDate = ymd(d);
        saveState();
        renderDay();
      } else {
        showView("calendar");
      }
    });

    btnNext?.addEventListener("click", () => {
      if (state.view === "calendar") {
        const d = parseYMD(state.calCursor + "-01");
        d.setMonth(d.getMonth() + 1);
        state.calCursor = monthKey(d);
        saveState();
        renderCalendar();
      } else if (state.view === "day") {
        const d = parseYMD(state.selectedDate);
        d.setDate(d.getDate() + 1);
        state.selectedDate = ymd(d);
        saveState();
        renderDay();
      } else {
        showView("calendar");
      }
    });

    // dashboard quick buttons
    $("#openToday")?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      saveState();
      showView("day");
    });
    $("#openCalendar")?.addEventListener("click", () => showView("calendar"));

    // day tabs
    document.addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      const tab = t.dataset.daytab;
      if (!tab) return;

      $$(".tab").forEach(x => x.classList.remove("is-active"));
      t.classList.add("is-active");

      $$(".daypane").forEach(p => p.classList.remove("is-visible"));
      $(`#pane-${tab}`)?.classList.add("is-visible");
    });

    // add job/receipt/note (toolbar + inline)
    const addJob = () => { showView("day"); addJobRow(); };
    const addReceipt = () => { showView("day"); /* placeholder */ };
    const addNote = () => { showView("day"); focusNotes(); };

    $("#btnAddJob")?.addEventListener("click", addJob);
    $("#btnAddReceipt")?.addEventListener("click", addReceipt);
    $("#btnAddNote")?.addEventListener("click", addNote);

    $("#addJobInline")?.addEventListener("click", addJobRow);
    $("#addReceiptInline")?.addEventListener("click", () => {});
    $("#addNoteInline")?.addEventListener("click", focusNotes);

    // notes save
    $("#notesBox")?.addEventListener("input", (e) => {
      const day = ensureDay(state.selectedDate);
      day.notes = e.target.value;
      saveState();
    });
  }

  // ---------------- Rendering ----------------
  function renderDashboard() {
    const today = ymd(new Date());
    const day = ensureDay(today);

    const jobs = day.jobs.length;
    const receipts = day.receipts.length;

    const todaySummary = $("#todaySummary");
    if (todaySummary) {
      todaySummary.textContent = `${jobs} job(s), ${receipts} receipt(s), 0 driver(s), 0 truck(s)`;
    }

    renderCalendarQuick();
  }

  function renderCalendarQuick() {
    const host = $("#calendarQuick");
    if (!host) return;

    // Use cursor month
    const [Y, M] = state.calCursor.split("-").map(Number);
    const first = new Date(Y, M - 1, 1);
    const startDow = first.getDay(); // 0..6
    const daysInMonth = new Date(Y, M, 0).getDate();

    host.innerHTML = "";

    // leading blanks
    for (let i = 0; i < startDow; i++) {
      const p = document.createElement("div");
      p.className = "daypill is-muted";
      p.textContent = "—";
      p.style.pointerEvents = "none";
      host.appendChild(p);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${Y}-${pad2(M)}-${pad2(d)}`;
      const btn = document.createElement("button");
      btn.className = "daypill";
      btn.type = "button";
      btn.textContent = String(d);
      btn.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        showView("day");
      });
      host.appendChild(btn);
    }
  }

  function renderCalendar() {
    const grid = $("#calendarGrid");
    const title = $("#calTitle");
    if (!grid) return;

    const [Y, M] = state.calCursor.split("-").map(Number);
    const first = new Date(Y, M - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(Y, M, 0).getDate();

    if (title) {
      const monthName = first.toLocaleString(undefined, { month: "long" });
      title.textContent = `${monthName} ${Y}`;
    }

    grid.innerHTML = "";

    // leading blanks
    for (let i = 0; i < startDow; i++) {
      const cell = document.createElement("div");
      cell.className = "daycell is-muted";
      cell.innerHTML = `<div class="daynum">—</div>`;
      cell.style.pointerEvents = "none";
      grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${Y}-${pad2(M)}-${pad2(d)}`;
      const day = ensureDay(dateStr);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "daycell";
      cell.innerHTML = `
        <div class="daynum">${d}</div>
        <div class="muted" style="margin-top:6px;font-size:12px">
          Jobs: ${day.jobs.length}
        </div>
      `;

      cell.addEventListener("click", () => {
        state.selectedDate = dateStr;
        saveState();
        showView("day");
      });

      grid.appendChild(cell);
    }
  }

  function renderDay() {
    const day = ensureDay(state.selectedDate);

    const dayTitle = $("#dayTitle");
    const dayMeta = $("#dayMeta");
    const warn = $("#warningsPill");

    if (dayTitle) dayTitle.textContent = `Day Workspace`;
    if (dayMeta) dayMeta.textContent = state.selectedDate;

    if (warn) warn.textContent = `Warnings: ${day.warnings.length}`;

    // notes
    const notes = $("#notesBox");
    if (notes) notes.value = day.notes || "";

    renderJobsTable();
  }

  function renderJobsTable() {
    const tbody = $("#jobsTable tbody");
    if (!tbody) return;

    const day = ensureDay(state.selectedDate);
    tbody.innerHTML = "";

    day.jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td contenteditable="true" data-k="id">${escapeHTML(job.id || "")}</td>
        <td contenteditable="true" data-k="customer">${escapeHTML(job.customer || "")}</td>
        <td contenteditable="true" data-k="pickup">${escapeHTML(job.pickup || "")}</td>
        <td contenteditable="true" data-k="dropoff">${escapeHTML(job.dropoff || "")}</td>
        <td contenteditable="true" data-k="volume">${escapeHTML(job.volume || "")}</td>
      `;

      // save edits on input (normal typing)
      tr.querySelectorAll('[contenteditable="true"]').forEach(td => {
        td.addEventListener("input", () => {
          const k = td.dataset.k;
          if (!k) return;
          day.jobs[idx][k] = td.textContent.trim();
          validateWarningsForDay(day);
          saveState();
          const warn = $("#warningsPill");
          if (warn) warn.textContent = `Warnings: ${day.warnings.length}`;
        });
      });

      tbody.appendChild(tr);
    });

    // if empty, show one row
    if (day.jobs.length === 0) {
      addJobRow();
    }
  }

  function addJobRow() {
    const day = ensureDay(state.selectedDate);
    const nextId = `J-${pad2(day.jobs.length + 1)}${pad2(Math.floor(Math.random() * 90) + 10)}`; // quick unique-ish
    day.jobs.push({ id: nextId, customer: "", pickup: "", dropoff: "", volume: "" });
    validateWarningsForDay(day);
    saveState();
    renderJobsTable();
  }

  function focusNotes() {
    // switch to notes tab + focus
    $$(".tab").forEach(x => x.classList.remove("is-active"));
    $(`.tab[data-daytab="notes"]`)?.classList.add("is-active");

    $$(".daypane").forEach(p => p.classList.remove("is-visible"));
    $("#pane-notes")?.classList.add("is-visible");

    $("#notesBox")?.focus();
  }

  function validateWarningsForDay(day) {
    const warnings = [];
    day.jobs.forEach(j => {
      if (!j.dropoff) warnings.push(`${j.id || "Job"} missing dropoff`);
      if (!j.volume) warnings.push(`${j.id || "Job"} missing volume`);
    });
    day.warnings = warnings;
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------- Boot ----------------
  let state;

  document.addEventListener("DOMContentLoaded", () => {
    try {
      state = loadState();
      updateStoragePill(true);
      bindNav();

      // Render all key things once so "Dashboard calendar" always appears
      renderDashboard();
      renderCalendar();
      renderDay();

      // Then show whichever view you were on
      showView(state.view || "dashboard");

      // Only now do we honestly mark JS loaded
      setJSLoaded(true);
    } catch (err) {
      console.error(err);
      setJSLoaded(false);
      // don't crash the UI completely
      try { updateStoragePill(false); } catch {}
    }
  });
})();
