/* FleetPro / Move-Master.OS — app_v5.js
   Purpose:
   - Keep your current HTML/CSS layout
   - Restore rendering: Dashboard + Calendar + Day Workspace
   - Restore button wiring (sidebar + top toolbar)
   - Keep "JS: loaded" honest (only flips after init runs)
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;

  const STORAGE_KEY = "fleetpro_foundation_v5";

  const DEFAULT_STATE = {
    view: "dashboard",              // dashboard | calendar | day | drivers | trucks | dispatch | finance | inventory | ai
    selectedDate: ymd(new Date()),  // YYYY-MM-DD
    calCursor: monthKey(new Date()),// YYYY-MM
    dayData: {}                     // { [YYYY-MM-DD]: { jobs:[], receipts:[], notes:"", warnings:[] } }
  };

  function safeJSONParse(str, fallback){
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function loadState(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const st = raw ? safeJSONParse(raw, DEFAULT_STATE) : structuredClone(DEFAULT_STATE);
    if (!st.dayData) st.dayData = {};
    if (!st.selectedDate) st.selectedDate = ymd(new Date());
    if (!st.calCursor) st.calCursor = monthKey(new Date());
    if (!st.view) st.view = "dashboard";
    return st;
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStoragePill();
    }catch(e){
      // localStorage can fail in private mode, etc.
      updateStoragePill(true);
    }
  }

  function updateStoragePill(failed=false){
    const pill = $("#storagePill");
    if (!pill) return;
    if (failed){
      pill.textContent = "Local Storage: OFF";
      return;
    }
    const bytes = (localStorage.getItem(STORAGE_KEY) || "").length;
    pill.textContent = `Local Storage: ON · ${bytes} B`;
  }

  // ---------- JS Badge (honest) ----------
  function setJSLoaded(ok){
    const el = $("#jsStatus");
    if (!el) return; // if missing, don't crash the whole app
    el.textContent = ok ? "JS: loaded" : "JS: not loaded";
    el.style.color = ok ? "rgba(82, 232, 176, .95)" : "rgba(255, 120, 120, .95)";
  }

  // ---------- View switching ----------
  function switchView(viewName){
    state.view = viewName;
    saveState();

    // Sidebar active
    $$(".navbtn").forEach(btn => btn.classList.toggle("is-active", btn.dataset.view === viewName));

    // Views
    $$(".view").forEach(v => v.classList.remove("is-active"));
    const viewEl = $(`#view-${viewName}`);
    if (viewEl) viewEl.classList.add("is-active");

    // Context line
    const ctx = $("#contextLine");
    if (ctx){
      const map = {
        dashboard: "Foundation mode (Smart)",
        calendar: "Calendar navigation (Month)",
        day: "Day Workspace",
        drivers: "Drivers",
        trucks: "Trucks",
        dispatch: "Dispatch",
        finance: "Finance",
        inventory: "Inventory",
        ai: "AI Scanner"
      };
      ctx.textContent = map[viewName] || "Foundation mode (Smart)";
    }

    // Render on demand
    if (viewName === "dashboard") renderDashboard();
    if (viewName === "calendar") renderCalendar();
    if (viewName === "day") renderDay();
  }

  // ---------- Calendar math ----------
  function parseMonthKey(key){
    const [y,m] = key.split("-").map(Number);
    return new Date(y, m-1, 1);
  }

  function monthTitle(d){
    return d.toLocaleString(undefined, { month:"long", year:"numeric" });
  }

  function buildMonthCells(monthStart){
    // returns array of {date: Date|null, label:string, isToday:boolean, isDim:boolean}
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay(); // 0 Sun
    const daysInMonth = new Date(year, month+1, 0).getDate();

    // Build 6 weeks (42 cells) for stable grid
    const cells = [];
    const today = ymd(new Date());

    for (let i=0; i<42; i++){
      const dayNum = i - startDow + 1; // 1..daysInMonth
      if (dayNum < 1 || dayNum > daysInMonth){
        cells.push({ date:null, label:"", isToday:false, isDim:true });
      } else {
        const dt = new Date(year, month, dayNum);
        cells.push({
          date: dt,
          label: String(dayNum),
          isToday: ymd(dt) === today,
          isDim: false
        });
      }
    }
    return cells;
  }

  function shiftMonth(delta){
    const d = parseMonthKey(state.calCursor);
    const moved = new Date(d.getFullYear(), d.getMonth()+delta, 1);
    state.calCursor = monthKey(moved);
    saveState();
    renderCalendar();
    renderMiniCalendar();
  }

  // ---------- Rendering ----------
  function ensureDay(dateKey){
    if (!state.dayData[dateKey]){
      state.dayData[dateKey] = { jobs: [], receipts: [], notes: "", warnings: [] };
    }
    return state.dayData[dateKey];
  }

  function renderDashboard(){
    const todayKey = ymd(new Date());
    const day = ensureDay(todayKey);

    // Today line
    const dashLine = $("#dashTodayLine");
    if (dashLine){
      dashLine.textContent = `${day.jobs.length} job(s), ${day.receipts.length} receipt(s)`;
    }

    // Pressure points
    const pressure = $("#pressureList");
    if (pressure){
      pressure.innerHTML = "";
      const items = [
        "Overbooked drivers: AI later",
        "Truck maintenance conflicts: rules later",
        "Receipts missing: driver app later"
      ];
      items.forEach(t => {
        const li = document.createElement("li");
        li.textContent = t;
        pressure.appendChild(li);
      });
    }

    // Month snapshot
    const cursor = state.calCursor;
    let jobs=0, receipts=0, notes=0, warnings=0;
    Object.entries(state.dayData).forEach(([k, v]) => {
      if (k.startsWith(cursor)){
        jobs += (v.jobs||[]).length;
        receipts += (v.receipts||[]).length;
        notes += (v.notes && v.notes.trim() ? 1 : 0);
        warnings += (v.warnings||[]).length;
      }
    });
    const setText = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };
    setText("#statJobsMonth", jobs);
    setText("#statReceiptsMonth", receipts);
    setText("#statNotesMonth", notes);
    setText("#statWarningsMonth", warnings);

    // Mini calendar
    renderMiniCalendar();
  }

  function renderMiniCalendar(){
    const grid = $("#miniCalendarGrid");
    const title = $("#miniCalTitle");
    if (!grid || !title) return;

    const monthStart = parseMonthKey(state.calCursor);
    title.textContent = monthTitle(monthStart);

    grid.innerHTML = "";
    const cells = buildMonthCells(monthStart);
    cells.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "daycell" + (c.isDim ? " is-dim" : "") + (c.isToday ? " is-today" : "");
      btn.textContent = c.label;
      if (!c.date){
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          state.selectedDate = ymd(c.date);
          saveState();
          switchView("day");
        });
      }
      grid.appendChild(btn);
    });
  }

  function renderCalendar(){
    const title = $("#calTitle");
    const grid = $("#calendarGrid");
    if (!title || !grid) return;

    const monthStart = parseMonthKey(state.calCursor);
    title.textContent = monthTitle(monthStart);

    grid.innerHTML = "";
    const cells = buildMonthCells(monthStart);

    cells.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "daycell" + (c.isDim ? " is-dim" : "") + (c.isToday ? " is-today" : "");
      btn.textContent = c.label;

      if (!c.date){
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          state.selectedDate = ymd(c.date);
          saveState();
          switchView("day");
        });
      }
      grid.appendChild(btn);
    });
  }

  function renderDay(){
    const key = state.selectedDate;
    const day = ensureDay(key);

    const title = $("#dayTitle");
    const meta = $("#dayMeta");
    if (title) title.textContent = `Day Workspace — ${key}`;
    if (meta) meta.textContent = `${day.jobs.length} job(s) · ${day.receipts.length} receipt(s)`;

    renderJobsTable(day);
    renderReceiptsTable(day);

    const notes = $("#dayNotes");
    if (notes){
      notes.value = day.notes || "";
    }

    const warnings = $("#warningsList");
    if (warnings){
      warnings.innerHTML = "";
      const list = (day.warnings && day.warnings.length)
        ? day.warnings
        : buildWarnings(day);

      list.forEach(w => {
        const li = document.createElement("li");
        li.textContent = w;
        warnings.appendChild(li);
      });
    }
  }

  function buildWarnings(day){
    const warnings = [];
    day.jobs.forEach(j => {
      if (!j.volume) warnings.push(`${j.jobId || "Job"} missing volume (jobs → volume)`);
      if (!j.dropoff) warnings.push(`${j.jobId || "Job"} missing dropoff (jobs → dropoff)`);
    });
    return warnings;
  }

  function renderJobsTable(day){
    const tbody = $("#jobsTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // seed a default row if empty (so you see “data” immediately)
    if (!day.jobs.length){
      day.jobs.push({ jobId: "J-0001", customer: "Join", pickup: "—", dropoff: "—", volume: "" });
      saveState();
    }

    day.jobs.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.appendChild(cellInput(row.jobId, v => { row.jobId = v; saveState(); }));
      tr.appendChild(cellInput(row.customer, v => { row.customer = v; saveState(); }));
      tr.appendChild(cellInput(row.pickup, v => { row.pickup = v; saveState(); }));
      tr.appendChild(cellInput(row.dropoff, v => { row.dropoff = v; saveState(); }));
      tr.appendChild(cellInput(row.volume, v => { row.volume = v; saveState(); }));
      tbody.appendChild(tr);
    });
  }

  function renderReceiptsTable(day){
    const tbody = $("#receiptsTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!day.receipts.length){
      // keep empty unless you add one
      return;
    }

    day.receipts.forEach((r) => {
      const tr = document.createElement("tr");
      tr.appendChild(cellInput(r.receiptId, v => { r.receiptId = v; saveState(); }));
      tr.appendChild(cellInput(r.vendor, v => { r.vendor = v; saveState(); }));
      tr.appendChild(cellInput(r.amount, v => { r.amount = v; saveState(); }));
      tr.appendChild(cellInput(r.category, v => { r.category = v; saveState(); }));
      tr.appendChild(cellInput(r.note, v => { r.note = v; saveState(); }));
      tbody.appendChild(tr);
    });
  }

  function cellInput(value, onChange){
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.className = "cell-input";
    input.type = "text";
    input.value = value ?? "";
    input.addEventListener("input", () => onChange(input.value));
    td.appendChild(input);
    return td;
  }

  // ---------- Binding ----------
  function bindNav(){
    // Sidebar
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".navbtn");
      if (!btn) return;
      const view = btn.dataset.view;
      if (!view) return;
      switchView(view);
    });

    // Toolbar
    const btnToday = $("#btnToday");
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");

    if (btnToday) btnToday.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      state.calCursor = monthKey(new Date());
      saveState();
      // Go to dashboard by default, but keep calendar updated
      switchView("dashboard");
      renderCalendar();
    });

    if (btnPrev) btnPrev.addEventListener("click", () => shiftMonth(-1));
    if (btnNext) btnNext.addEventListener("click", () => shiftMonth(+1));

    // Dashboard quick actions
    const openToday = $("#openToday");
    const openCalendar = $("#openCalendar");
    if (openToday) openToday.addEventListener("click", () => {
      state.selectedDate = ymd(new Date());
      saveState();
      switchView("day");
    });
    if (openCalendar) openCalendar.addEventListener("click", () => switchView("calendar"));

    // Day workspace add buttons
    const addJob = $("#btnAddJob");
    const addReceipt = $("#btnAddReceipt");
    const addNote = $("#btnAddNote");

    if (addJob) addJob.addEventListener("click", () => {
      state.selectedDate = state.selectedDate || ymd(new Date());
      const day = ensureDay(state.selectedDate);
      const nextNum = String(day.jobs.length + 1).padStart(4, "0");
      day.jobs.push({ jobId:`J-${nextNum}`, customer:"", pickup:"", dropoff:"", volume:"" });
      saveState();
      switchView("day");
    });

    if (addReceipt) addReceipt.addEventListener("click", () => {
      state.selectedDate = state.selectedDate || ymd(new Date());
      const day = ensureDay(state.selectedDate);
      const nextNum = String(day.receipts.length + 1).padStart(4, "0");
      day.receipts.push({ receiptId:`R-${nextNum}`, vendor:"", amount:"", category:"", note:"" });
      saveState();
      switchView("day");
      renderDay();
      // switch to receipts tab
      setDayTab("receipts");
    });

    if (addNote) addNote.addEventListener("click", () => {
      switchView("day");
      setDayTab("notes");
      const ta = $("#dayNotes");
      if (ta) ta.focus();
    });

    // Day tabs
    document.addEventListener("click", (e) => {
      const tab = e.target.closest(".tabbtn");
      if (!tab) return;
      const name = tab.dataset.tab;
      if (!name) return;
      setDayTab(name);
    });

    // Notes persistence
    const notes = $("#dayNotes");
    if (notes){
      notes.addEventListener("input", () => {
        const day = ensureDay(state.selectedDate);
        day.notes = notes.value;
        saveState();
      });
    }
  }

  function setDayTab(name){
    $$(".tabbtn").forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
    $$(".tabpanel").forEach(p => p.classList.remove("is-active"));
    const panel = $(`#tab-${name}`);
    if (panel) panel.classList.add("is-active");
  }

  // ---------- Boot ----------
  let state;

  document.addEventListener("DOMContentLoaded", () => {
    try{
      state = loadState();
      updateStoragePill();
      bindNav();

      // Initial render
      renderDashboard();
      renderCalendar();

      // Restore last view
      switchView(state.view || "dashboard");

      // Only flip badge after everything above succeeds
      setJSLoaded(true);
    }catch(err){
      console.error(err);
      setJSLoaded(false);
    }
  });

})();
