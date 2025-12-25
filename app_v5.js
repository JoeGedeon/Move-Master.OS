/* FleetPro / Move-Master.OS — app_v5.js
   - Working nav (sidebar + top buttons)
   - Calendar month render + dashboard quick calendar
   - Day workspace + tabs
   - Modal "Add Job" overlay (fixed positioning, not inline)
   - Honest JS badge: flips only after init runs
*/
(() => {
  "use strict";

  // ===== Helpers =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",          // dashboard | calendar | day | drivers | ...
    selectedDate: ymd(new Date()),
    calCursor: monthKey(new Date()),
    dayData: {
      // "YYYY-MM-DD": { jobs: [...], receipts: [...], notes: "..." }
    }
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateStoragePill();
  }

  function updateStoragePill() {
    const pill = $("#storagePill");
    if (!pill) return;
    let kb = 0;
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || "";
      kb = Math.max(1, Math.ceil(raw.length / 1024));
    } catch {}
    pill.textContent = `Local Storage: ON · ${kb} KB`;
  }

  function setJSLoaded(ok) {
    const pill = $("#jsStatusPill");
    if (!pill) return;
    if (ok) {
      pill.textContent = "JS: loaded";
      pill.classList.add("loaded");
    } else {
      pill.textContent = "JS: not loaded";
      pill.classList.remove("loaded");
    }
  }

  function setContextLine(text) {
    const el = $("#contextLine");
    if (el) el.textContent = text;
  }

  // ===== Global state =====
  let state = null;

  // ===== View switching =====
  function switchView(name) {
    state.view = name;
    saveState();

    // update nav button highlighting
    $$(".navbtn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });

    // update view panels
    $$(".view").forEach(v => v.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    if (name === "dashboard") {
      setContextLine("Foundation mode (Smart)");
      renderDashboard();
    } else if (name === "calendar") {
      setContextLine("Calendar navigation (Month)");
      renderCalendar();
    } else if (name === "day") {
      setContextLine(`Day Workspace: ${state.selectedDate}`);
      renderDay();
    } else {
      setContextLine(name[0].toUpperCase() + name.slice(1));
    }
  }

  function bindNav() {
    // sidebar nav
    $(".sidebar")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      switchView(btn.dataset.view);
    });

    // dashboard quick buttons
    $("#openToday")?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      saveState();
      switchView("day");
    });
    $("#openCalendar")?.addEventListener("click", () => switchView("calendar"));

    // toolbar
    $("#btnToday")?.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      // keep current view but rerender relevant pieces
      if (state.view === "calendar") renderCalendar();
      if (state.view === "day") renderDay();
      if (state.view === "dashboard") renderDashboard();
    });

    $("#btnPrev")?.addEventListener("click", () => shiftMonth(-1));
    $("#btnNext")?.addEventListener("click", () => shiftMonth(1));

    // Add Job modal
    $("#btnAddJob")?.addEventListener("click", () => openJobModal());
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptPlaceholder());
    $("#btnAddNote")?.addEventListener("click", () => openNotePlaceholder());

    // Modal close actions
    $("#modalClose")?.addEventListener("click", closeModal);
    $("#btnCancel")?.addEventListener("click", closeModal);
    $("#modalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") closeModal();
    });

    // Modal save
    $("#jobForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      saveJobFromModal();
    });

    // Day tabs
    $(".tabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      setDayTab(tab.dataset.tab);
    });
  }

  function shiftMonth(delta) {
    // state.calCursor is "YYYY-MM"
    const [yy, mm] = state.calCursor.split("-").map(Number);
    const d = new Date(yy, (mm - 1) + delta, 1);
    state.calCursor = monthKey(d);
    saveState();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "dashboard") renderDashboard(); // quick calendar mirrors cursor
  }

  // ===== Dashboard =====
  function renderDashboard() {
    // summary
    const d = state.selectedDate;
    const day = ensureDay(d);
    const jobs = day.jobs.length;
    const receipts = day.receipts.length;
    const notes = (day.notes || "").trim().length ? "yes" : "no";
    $("#dashSummary").textContent = `${d} — ${jobs} job(s), ${receipts} receipt(s), notes: ${notes}`;

    renderMiniCalendar("#dashCal");
  }

  // ===== Calendar =====
  function renderCalendar() {
    const [yy, mm] = state.calCursor.split("-").map(Number);
    const monthDate = new Date(yy, mm - 1, 1);
    const title = monthDate.toLocaleString(undefined, { month: "long", year: "numeric" });
    $("#calTitle").textContent = title;

    renderMonthGrid("#calendarGrid");
  }

  function renderMiniCalendar(containerSel) {
    // quick calendar uses calCursor too
    renderMonthGrid(containerSel, true);
  }

  function renderMonthGrid(containerSel, compact = false) {
    const host = $(containerSel);
    if (!host) return;
    host.innerHTML = "";

    const [yy, mm] = state.calCursor.split("-").map(Number);
    const first = new Date(yy, mm - 1, 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(yy, mm, 0).getDate();

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-day muted";
      blank.textContent = " ";
      host.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(yy, mm - 1, day);
      const key = ymd(d);

      const cell = document.createElement("div");
      cell.className = "cal-day";
      cell.textContent = String(day);

      // highlight selected date
      if (key === state.selectedDate) {
        cell.style.outline = "2px solid rgba(120,170,255,.55)";
      }

      cell.addEventListener("click", () => {
        state.selectedDate = key;
        saveState();
        switchView("day");
      });

      host.appendChild(cell);
    }
  }

  // ===== Day Workspace =====
  function ensureDay(dateStr) {
    if (!state.dayData[dateStr]) {
      state.dayData[dateStr] = { jobs: [], receipts: [], notes: "" };
    }
    // normalize
    if (!Array.isArray(state.dayData[dateStr].jobs)) state.dayData[dateStr].jobs = [];
    if (!Array.isArray(state.dayData[dateStr].receipts)) state.dayData[dateStr].receipts = [];
    if (typeof state.dayData[dateStr].notes !== "string") state.dayData[dateStr].notes = "";
    return state.dayData[dateStr];
  }

  function renderDay() {
    const d = state.selectedDate;
    const day = ensureDay(d);

    $("#dayTitle").textContent = `Day Workspace — ${d}`;

    // Jobs sheet: simple list/table-ish
    const jobsHost = $("#sheetJobs");
    jobsHost.innerHTML = "";

    const header = document.createElement("div");
    header.className = "muted";
    header.textContent = "Jobs (tap + Job (Day) to add)";
    jobsHost.appendChild(header);

    if (!day.jobs.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.marginTop = "12px";
      empty.textContent = "No jobs yet.";
      jobsHost.appendChild(empty);
    } else {
      const wrap = document.createElement("div");
      wrap.style.marginTop = "12px";
      wrap.style.display = "grid";
      wrap.style.gap = "10px";

      day.jobs.forEach((j) => {
        const row = document.createElement("div");
        row.style.padding = "10px 12px";
        row.style.borderRadius = "12px";
        row.style.border = "1px solid rgba(255,255,255,.10)";
        row.style.background = "rgba(255,255,255,.03)";
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <div><strong>${escapeHTML(j.customer || "—")}</strong></div>
            <div class="muted">${escapeHTML(j.id || "")}</div>
          </div>
          <div class="muted" style="margin-top:6px;">
            Pickup: ${escapeHTML(j.pickup || "—")} · Dropoff: ${escapeHTML(j.dropoff || "—")}
          </div>
          ${j.notes ? `<div class="muted" style="margin-top:6px;">Notes: ${escapeHTML(j.notes)}</div>` : ""}
        `;
        wrap.appendChild(row);
      });

      jobsHost.appendChild(wrap);
    }

    // Receipts placeholder
    $("#sheetReceipts").innerHTML = `<div class="muted">Receipts placeholder for ${d}.</div>`;

    // Notes sheet: normal textarea (not one-character-at-a-time nonsense)
    const notesHost = $("#sheetNotes");
    notesHost.innerHTML = "";
    const label = document.createElement("div");
    label.className = "muted";
    label.textContent = "Notes";
    const ta = document.createElement("textarea");
    ta.value = day.notes || "";
    ta.style.marginTop = "10px";
    ta.style.width = "100%";
    ta.style.minHeight = "140px";
    ta.style.padding = "10px 12px";
    ta.style.borderRadius = "12px";
    ta.style.border = "1px solid rgba(255,255,255,.10)";
    ta.style.background = "rgba(255,255,255,.04)";
    ta.style.color = "rgba(255,255,255,.92)";
    ta.addEventListener("input", () => {
      day.notes = ta.value;
      saveState();
    });
    notesHost.appendChild(label);
    notesHost.appendChild(ta);

    // default tab stays jobs unless user switched
    // (we store tab choice as DOM state only for now)
    setDayTab(getActiveTab());
  }

  function getActiveTab() {
    const active = $(".tab.active");
    return active ? active.dataset.tab : "jobs";
  }

  function setDayTab(tabName) {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
    $("#sheetJobs").classList.toggle("hidden", tabName !== "jobs");
    $("#sheetReceipts").classList.toggle("hidden", tabName !== "receipts");
    $("#sheetNotes").classList.toggle("hidden", tabName !== "notes");
  }

  // ===== Modal =====
  function openJobModal() {
    const overlay = $("#modalOverlay");
    if (!overlay) return;

    $("#modalTitle").textContent = "Add Job";

    // Prefill date with selectedDate
    $("#jobDate").value = state.selectedDate;

    // Clear fields
    $("#jobCustomer").value = "";
    $("#jobPickup").value = "";
    $("#jobDropoff").value = "";
    $("#jobNotes").value = "";

    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    // focus
    setTimeout(() => $("#jobCustomer")?.focus(), 50);
  }

  function closeModal() {
    const overlay = $("#modalOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  function saveJobFromModal() {
    const date = $("#jobDate").value || state.selectedDate;
    const customer = $("#jobCustomer").value.trim();
    const pickup = $("#jobPickup").value.trim();
    const dropoff = $("#jobDropoff").value.trim();
    const notes = $("#jobNotes").value.trim();

    const day = ensureDay(date);

    // Simple ID generator
    const id = `J-${Math.floor(1000 + Math.random() * 9000)}`;

    day.jobs.unshift({ id, customer, pickup, dropoff, notes, createdAt: Date.now() });
    state.selectedDate = date;
    saveState();

    closeModal();
    switchView("day"); // ensures view + render
  }

  function openReceiptPlaceholder() {
    // For now just route to Day + Receipts tab
    switchView("day");
    setDayTab("receipts");
  }

  function openNotePlaceholder() {
    switchView("day");
    setDayTab("notes");
  }

  // ===== Safety =====
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  // ===== Boot =====
  function init() {
    state = loadState();
    bindNav();
    updateStoragePill();

    // render initial view
    switchView(state.view || "dashboard");

    // always make sure dashboard has something
    renderDashboard();

    // honest badge only after we got here without throwing
    setJSLoaded(true);
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      init();
    } catch (err) {
      console.error(err);
      setJSLoaded(false);
      // leave UI visible but dead, which is basically the human condition anyway
    }
  });
})();
