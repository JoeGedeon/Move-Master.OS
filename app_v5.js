
/* =========================================================
   Fleet CRM — apps_v5.js (Router + Render Restore)
   ---------------------------------------------------------
   Goal: Make the "doors" open again.
   - Works even if HTML is missing view containers
   - Binds sidebar + topbar clicks (data-view OR button text)
   - Renders seeded data so you actually SEE content
   - Calendar is the foundation (date-first)
   - Event delegation = resilient
   ========================================================= */

(() => {
  "use strict";

  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monthName = (m) =>
    ["January","February","March","April","May","June","July","August","September","October","November","December"][m];

  const clampMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };
  const money = (n) => `$${clampMoney(n).toFixed(2)}`;

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function makeId(prefix="id"){
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1e6)}`; }
  }

  // ---------- constants ----------
  const VIEWS = [
    "dashboard","calendar","day","jobs","receipts","drivers","trucks","dispatch","finances","inventory","aiscanner"
  ];

  const VIEW_LABEL = {
    dashboard:"Dashboard",
    calendar:"Calendar",
    day:"Day Workspace",
    jobs:"Jobs",
    receipts:"Receipts",
    drivers:"Drivers",
    trucks:"Trucks",
    dispatch:"Dispatch",
    finances:"Finances",
    inventory:"Inventory",
    aiscanner:"AI Scanner",
  };

  const STATUS = { scheduled:"scheduled", completed:"completed", cancelled:"cancelled" };
  const RECEIPT_CATEGORIES = ["Fuel","Tolls","Supplies","Parking","Meals","Maintenance","Lodging","Other"];

  // ---------- storage ----------
  const LS = {
    jobs: "fleet_jobs_router_v1",
    receipts: "fleet_receipts_router_v1",
    drivers: "fleet_drivers_router_v1",
    trucks: "fleet_trucks_router_v1",
    dispatch: "fleet_dispatch_router_v1",
  };

  function load(key){
    try {
      const raw = localStorage.getItem(key);
      const val = raw ? JSON.parse(raw) : [];
      return Array.isArray(val) ? val : [];
    } catch { return []; }
  }
  function save(key, arr){
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  }

  // ---------- state ----------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: load(LS.jobs),
    receipts: load(LS.receipts),
    drivers: load(LS.drivers),
    trucks: load(LS.trucks),
    dispatch: load(LS.dispatch),
  };

  function persist(){
    save(LS.jobs, state.jobs);
    save(LS.receipts, state.receipts);
    save(LS.drivers, state.drivers);
    save(LS.trucks, state.trucks);
    save(LS.dispatch, state.dispatch);
  }

  // ---------- seed demo data so UI is not empty ----------
  function seedIfEmpty(){
    const empty =
      state.jobs.length === 0 &&
      state.receipts.length === 0 &&
      state.drivers.length === 0 &&
      state.trucks.length === 0 &&
      state.dispatch.length === 0;

    if (!empty) return;

    const today = ymd(state.currentDate);
    const drvId = makeId("drv");
    const trkId = makeId("trk");
    const jobId = makeId("job");

    state.drivers = [{ id: drvId, name:"Sample Driver", phone:"555-0101", status:"Active", role:"Driver" }];
    state.trucks = [{ id: trkId, unit:"Truck 12", plate:"ABC-123", status:"Ready", capacity:"26ft" }];

    state.jobs = [{
      id: jobId,
      date: today,
      jobNumber: "J-1001",
      customer: "Sample Customer",
      pickup: "Pickup Address",
      dropoff: "Dropoff Address",
      amount: 1100,
      status: STATUS.scheduled,
      driverId: drvId,
      truckId: trkId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    state.receipts = [{
      id: makeId("rcpt"),
      date: today,
      vendor: "Shell",
      category: "Fuel",
      amount: 68.42,
      notes: "Fuel for today",
      jobId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    state.dispatch = [{
      id: makeId("dsp"),
      date: today,
      jobId,
      driverId: drvId,
      truckId: trkId,
      startTime: "08:00",
      endTime: "12:00",
      notes: "Morning move",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];

    persist();
  }

  // ---------- find or create content host ----------
  function getMainHost(){
    // Try common ids/classes you likely already have
    return (
      $("#mainContent") ||
      $("#content") ||
      $("#dashboardContent") ||
      $(".main-content") ||
      $(".content") ||
      $("main") ||
      null
    );
  }

  function ensureViewContainers(){
    // If your HTML already has #view-xxxx, use them
    if ($("[id^='view-']")) return;

    const host = getMainHost();
    if (!host) {
      // If everything is weird, we create our own mount point
      const mount = document.createElement("div");
      mount.id = "mainContent";
      mount.style.padding = "12px";
      document.body.appendChild(mount);
    }

    const root = getMainHost();
    if (!root) return;

    // Create view sections inside your existing content area
    const wrap = document.createElement("div");
    wrap.id = "__fleetViews";
    VIEWS.forEach(v => {
      const sec = document.createElement("section");
      sec.id = `view-${v}`;
      sec.style.display = "none";
      wrap.appendChild(sec);
    });

    // Clear only the inside area, not your sidebar/topbar
    root.innerHTML = "";
    root.appendChild(wrap);
  }

  // ---------- badge so we know JS is alive ----------
  function showBadge(){
    if ($("#fleetBadge")) return;
    const b = document.createElement("div");
    b.id = "fleetBadge";
    b.textContent = "JS ✅ LOADED";
    b.style.position = "fixed";
    b.style.right = "12px";
    b.style.bottom = "12px";
    b.style.zIndex = "999999";
    b.style.padding = "8px 12px";
    b.style.borderRadius = "999px";
    b.style.background = "rgba(0,160,90,0.92)";
    b.style.color = "#fff";
    b.style.font = "800 12px system-ui";
    b.style.pointerEvents = "none";
    document.body.appendChild(b);
  }

  // ---------- routing: map button text to views ----------
  function normalizeLabel(txt){
    return String(txt || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function viewFromButton(btn){
    // Preferred: data-view
    const dv = btn?.dataset?.view;
    if (dv && VIEWS.includes(dv)) return dv;

    // Fallback: match by text
    const t = normalizeLabel(btn?.textContent);
    const map = {
      "dashboard": "dashboard",
      "calendar": "calendar",
      "day workspace": "day",
      "day": "day",
      "jobs": "jobs",
      "receipts": "receipts",
      "drivers": "drivers",
      "trucks": "trucks",
      "dispatch": "dispatch",
      "finances": "finances",
      "finance": "finances",
      "inventory": "inventory",
      "ai scanner": "aiscanner",
      "scanner": "aiscanner",
    };
    return map[t] || null;
  }

  function setView(view){
    if (!VIEWS.includes(view)) return;
    state.view = view;

    // Hide/show view panels
    $$("[id^='view-']").forEach(v => (v.style.display = "none"));
    const panel = $(`#view-${view}`);
    if (panel) panel.style.display = "block";

    // Highlight nav buttons if they use data-view
    $$("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));

    renderAll();
  }

  // ---------- computations ----------
  function jobsByDate(dateStr){ return state.jobs.filter(j => j.date === dateStr); }
  function receiptsByDate(dateStr){ return state.receipts.filter(r => r.date === dateStr); }

  function sumRevenue(dateStr){
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }
  function sumExpenses(dateStr){
    let total = 0;
    for (const r of receiptsByDate(dateStr)) total += clampMoney(r.amount);
    return clampMoney(total);
  }
  function monthTotals(y, m){
    let rev = 0, exp = 0;
    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (!Number.isNaN(d.getTime()) && d.getFullYear()===y && d.getMonth()===m && j.status!==STATUS.cancelled) rev += clampMoney(j.amount);
    }
    for (const r of state.receipts) {
      const d = new Date(r.date);
      if (!Number.isNaN(d.getTime()) && d.getFullYear()===y && d.getMonth()===m) exp += clampMoney(r.amount);
    }
    return { revenue: clampMoney(rev), expenses: clampMoney(exp), net: clampMoney(rev-exp) };
  }

  // ---------- renderers ----------
  function renderDashboard(){
    const host = $("#view-dashboard");
    if (!host) return;

    const todayStr = ymd(state.currentDate);
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const mt = monthTotals(y, m);

    host.innerHTML = `
      <div class="panel">
        <div class="title">Dashboard</div>
        <div class="sub">Date-first CRM. Calendar drives jobs, drivers, trucks, dispatch, and receipts.</div>
      </div>

      <div class="panel">
        <div><b>Today:</b> ${escapeHtml(todayStr)}</div>
        <div style="margin-top:6px;">Jobs: <b>${jobsByDate(todayStr).length}</b> · Receipts: <b>${receiptsByDate(todayStr).length}</b></div>
        <div style="margin-top:6px;">Revenue: <b>${money(sumRevenue(todayStr))}</b> · Expenses: <b>${money(sumExpenses(todayStr))}</b> · Net: <b>${money(sumRevenue(todayStr)-sumExpenses(todayStr))}</b></div>
      </div>

      <div class="panel">
        <div><b>Month Snapshot:</b> ${escapeHtml(monthName(m))} ${y}</div>
        <div style="margin-top:6px;">Revenue ${money(mt.revenue)} · Expenses ${money(mt.expenses)} · Net ${money(mt.net)}</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" data-view="calendar">Open Calendar</button>
          <button class="btn" type="button" data-view="day">Open Day Workspace</button>
        </div>
      </div>

      <div class="panel">
        <div><b>Quick Calendar</b></div>
        <div class="sub">Tap a day to jump into Day Workspace.</div>
        <div id="quickCal" class="pills" style="margin-top:10px;"></div>
      </div>
    `;

    const qc = $("#quickCal");
    if (!qc) return;

    qc.innerHTML = "";
    const yy = state.currentDate.getFullYear();
    const mm = state.currentDate.getMonth();
    const dim = new Date(yy, mm + 1, 0).getDate();

    for (let day=1; day<=dim; day++){
      const d = new Date(yy, mm, day);
      const ds = ymd(d);
      const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill";
      b.textContent = String(day);
      if (jc) b.classList.add("has-jobs");
      if (rc) b.classList.add("has-receipts");

      b.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      qc.appendChild(b);
    }
  }

  function renderCalendar(){
    const host = $("#view-calendar");
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const dim = new Date(y, m+1, 0).getDate();

    host.innerHTML = `
      <div class="panel">
        <div class="title">Calendar</div>
        <div class="sub">Month view with markers. Click a day to open Day Workspace.</div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px; flex-wrap:wrap;">
          <div style="font-weight:900;">${escapeHtml(monthName(m))} ${y}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn" id="calPrev" type="button">Prev</button>
            <button class="btn" id="calToday" type="button">Today</button>
            <button class="btn" id="calNext" type="button">Next</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="calendar-grid" id="calendarGrid"></div>
      </div>
    `;

    const grid = $("#calendarGrid");
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    dow.forEach(d => {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      grid.appendChild(h);
    });

    for (let i=0;i<firstDow;i++){
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

    for (let day=1; day<=dim; day++){
      const d = new Date(y, m, day);
      const ds = ymd(d);
      const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      cell.innerHTML = `
        <div class="num">${day}</div>
        <div class="markerbar">
          ${jc ? `<span class="chip chip-jobs">${jc} job${jc===1?"":"s"}</span>` : ""}
          ${rc ? `<span class="chip chip-receipts">🧾 ${rc}</span>` : ""}
        </div>
      `;
      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });
      grid.appendChild(cell);
    }

    $("#calPrev")?.addEventListener("click", () => { state.monthCursor = new Date(y, m-1, 1); renderAll(); });
    $("#calNext")?.addEventListener("click", () => { state.monthCursor = new Date(y, m+1, 1); renderAll(); });
    $("#calToday")?.addEventListener("click", () => {
      const now = new Date();
      state.currentDate = startOfDay(now);
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderAll();
    });
  }

  function renderDay(){
    const host = $("#view-day");
    if (!host) return;

    const dateStr = ymd(state.currentDate);
    const jobs = jobsByDate(dateStr);
    const receipts = receiptsByDate(dateStr);

    host.innerHTML = `
      <div class="panel">
        <div class="title">Day Workspace</div>
        <div class="sub">${escapeHtml(dateStr)}</div>
        <div style="margin-top:6px;">
          Revenue <b>${money(sumRevenue(dateStr))}</b> · Expenses <b>${money(sumExpenses(dateStr))}</b> · Net <b>${money(sumRevenue(dateStr)-sumExpenses(dateStr))}</b>
        </div>
      </div>

      <div class="panel">
        <div class="title">Jobs</div>
        <div class="sub">This is where the move gets tracked: customer + pickup + dropoff + amount + status.</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" type="button" data-view="calendar">Back to Calendar</button>
          <button class="btn" type="button" id="addSampleJob">Add Sample Job</button>
        </div>
        <div style="margin-top:12px;" id="dayJobs"></div>
      </div>

      <div class="panel">
        <div class="title">Receipts</div>
        <div class="sub">Track driver expenses by date. (AI scanner later.)</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:180px;">
            <span>Vendor</span><input id="rcVendor" placeholder="Shell, Home Depot..." />
          </label>
          <label class="field" style="min-width:140px;">
            <span>Amount</span><input id="rcAmount" type="number" step="0.01" placeholder="0.00" />
          </label>
          <label class="field" style="min-width:180px;">
            <span>Category</span>
            <select id="rcCategory">
              <option value="">Uncategorized</option>
              ${RECEIPT_CATEGORIES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>
          <button class="btn primary" id="rcAdd" type="button">Add Receipt</button>
        </div>
        <div style="margin-top:12px;" id="dayReceipts"></div>
      </div>
    `;

    // Render jobs list
    const jHost = $("#dayJobs");
    jHost.innerHTML = jobs.length ? jobs.map(j => `
      <div class="job-row">
        <div class="job-main">
          <div class="job-title">${escapeHtml(j.jobNumber || "")} ${escapeHtml(j.customer || "Customer")}</div>
          <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")} · ${money(j.amount || 0)}</div>
        </div>
        <div class="job-actions">
          <select data-job-status="${escapeHtml(j.id)}">
            <option value="scheduled" ${j.status===STATUS.scheduled?"selected":""}>Scheduled</option>
            <option value="completed" ${j.status===STATUS.completed?"selected":""}>Completed</option>
            <option value="cancelled" ${j.status===STATUS.cancelled?"selected":""}>Cancelled</option>
          </select>
          <button class="btn danger" data-job-del="${escapeHtml(j.id)}">Delete</button>
        </div>
      </div>
    `).join("") : `<div class="muted">No jobs for this day yet.</div>`;

    // Render receipts list
    const rHost = $("#dayReceipts");
    rHost.innerHTML = receipts.length ? receipts.map(r => `
      <div class="receipt-row">
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")} · ${money(r.amount || 0)}</div>
          <div class="receipt-sub">${escapeHtml(r.notes || "")}</div>
        </div>
        <div class="receipt-actions">
          <button class="btn danger" data-rc-del="${escapeHtml(r.id)}">Delete</button>
        </div>
      </div>
    `).join("") : `<div class="muted">No receipts for this day yet.</div>`;
  }

  function renderSimple(view){
    const host = $(`#view-${view}`);
    if (!host) return;
    host.innerHTML = `
      <div class="panel">
        <div class="title">${escapeHtml(VIEW_LABEL[view] || view)}</div>
        <div class="sub">This page is reachable. Data wiring comes next.</div>
      </div>
      <div class="panel">
        <div class="muted">Records: <b>${(state[view] && Array.isArray(state[view])) ? state[view].length : 0}</b></div>
      </div>
    `;
  }

  function renderAll(){
    // If your CSS expects active view class instead of display none, you can adjust later.
    if (state.view === "dashboard") renderDashboard();
    else if (state.view === "calendar") renderCalendar();
    else if (state.view === "day") renderDay();
    else renderSimple(state.view);
  }

  // ---------- event delegation: THIS is your "doors" ----------
  function bindDoors(){
    // 1) Navigation clicks (sidebar + topbar)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, a, div");
      if (!btn) return;

      // prefer data-view if present
      const v = viewFromButton(btn);
      if (v) {
        e.preventDefault?.();
        setView(v);
        return;
      }

      // 2) Day workspace actions
      if (btn.id === "addSampleJob") {
        const dateStr = ymd(state.currentDate);
        state.jobs.push({
          id: makeId("job"),
          date: dateStr,
          jobNumber: `J-${Math.floor(1000 + Math.random()*9000)}`,
          customer: "New Customer",
          pickup: "Pickup",
          dropoff: "Dropoff",
          amount: 900,
          status: STATUS.scheduled,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        persist();
        renderAll();
        return;
      }

      if (btn.id === "rcAdd") {
        const dateStr = ymd(state.currentDate);
        const vendor = ($("#rcVendor")?.value || "").trim();
        const amount = clampMoney($("#rcAmount")?.value ?? 0);
        const category = ($("#rcCategory")?.value || "").trim();

        if (!vendor) return alert("Vendor is required.");
        if (amount <= 0) return alert("Amount must be greater than 0.");

        state.receipts.push({
          id: makeId("rcpt"),
          date: dateStr,
          vendor,
          amount,
          category,
          notes: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        persist();
        renderAll();
        return;
      }

      const jobDel = btn.getAttribute?.("data-job-del");
      if (jobDel) {
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter(j => j.id !== jobDel);
        persist();
        renderAll();
        return;
      }

      const rcDel = btn.getAttribute?.("data-rc-del");
      if (rcDel) {
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== rcDel);
        persist();
        renderAll();
        return;
      }
    }, true);

    // Job status change
    document.addEventListener("change", (e) => {
      const sel = e.target.closest?.("select[data-job-status]");
      if (!sel) return;
      const id = sel.getAttribute("data-job-status");
      const job = state.jobs.find(j => j.id === id);
      if (!job) return;
      const val = sel.value;
      job.status = (val in STATUS) ? val : STATUS.scheduled;
      job.updatedAt = Date.now();
      persist();
      renderAll();
    }, true);
  }

  // ---------- attach data-view attributes automatically (optional booster) ----------
  function tagButtonsByText(){
    // This helps if your HTML has plain buttons without data-view attributes.
    const candidates = $$("button, a").filter(el => !el.dataset.view);
    candidates.forEach(el => {
      const v = viewFromButton(el);
      if (v) el.dataset.view = v;
    });
  }

  // ---------- init ----------
  function init(){
    console.log("✅ apps_v5.js running");
    showBadge();
    seedIfEmpty();
    ensureViewContainers();
    tagButtonsByText();
    bindDoors();

    // Default view
    setView("dashboard");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
