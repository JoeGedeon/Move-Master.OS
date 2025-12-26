document.documentElement.setAttribute("data-js-executed", "YES");
/* ============================================================
   Fleet CRM — apps_v5.js (SAFE RESTORE)
   ------------------------------------------------------------
   Purpose: Bring the app back even if HTML/CSS got mangled.
   - Self-healing: builds layout if missing
   - Event routing always works (data-view + delegation)
   - Full month calendar + quick calendar
   - Day Workspace: Jobs + Receipts with totals + markers
   - LocalStorage persistence
   - Visible "JS LOADED" badge so you KNOW it’s connected

   Works on GitHub Pages (no build tools).
   ============================================================ */

(() => {
  "use strict";

  // ---------------------------
  // Utilities
  // ---------------------------
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

  function makeId(prefix = "id") {
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  function safe(fn) {
    try { fn(); } catch (e) { console.error("[Fleet]", e); showCrash(e); }
  }

  // ---------------------------
  // Storage
  // ---------------------------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";

  const STATUS = { scheduled:"scheduled", completed:"completed", cancelled:"cancelled" };
  const STATUS_LABEL = { scheduled:"Scheduled", completed:"Completed", cancelled:"Cancelled" };
  const RECEIPT_CATEGORIES = ["Fuel","Tolls","Supplies","Parking","Meals","Maintenance","Lodging","Other"];

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function saveArray(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  }

  function normalizeJob(j) {
    const job = { ...(j || {}) };
    if (!job.id) job.id = makeId("job");
    if (!job.date) job.date = ymd(startOfDay(new Date()));
    job.status = STATUS_LABEL[job.status] ? job.status : STATUS.scheduled;
    job.customer = (job.customer || "").trim();
    job.pickup = (job.pickup || "").trim();
    job.dropoff = (job.dropoff || "").trim();
    job.amount = clampMoney(job.amount ?? 0);
    job.notes = (job.notes || "").trim();
    job.createdAt = job.createdAt || Date.now();
    job.updatedAt = job.updatedAt || job.createdAt;
    return job;
  }

  function normalizeReceipt(r) {
    const rec = { ...(r || {}) };
    if (!rec.id) rec.id = makeId("rcpt");
    if (!rec.date) rec.date = ymd(startOfDay(new Date()));
    rec.vendor = (rec.vendor || "").trim();
    rec.category = (rec.category || "").trim();
    rec.amount = clampMoney(rec.amount ?? 0);
    rec.notes = (rec.notes || "").trim();
    rec.jobId = (rec.jobId || "").trim();
    rec.createdAt = rec.createdAt || Date.now();
    rec.updatedAt = rec.updatedAt || rec.createdAt;
    return rec;
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
  }

  function seedIfEmpty() {
    if (state.jobs.length || state.receipts.length) return;
    const t = ymd(state.currentDate);
    state.jobs = [
      normalizeJob({ date: t, customer: "Sample Job A", pickup: "Pickup", dropoff: "Dropoff", amount: 950, status: STATUS.scheduled }),
      normalizeJob({ date: t, customer: "Sample Job B", pickup: "Pickup", dropoff: "Dropoff", amount: 1250, status: STATUS.completed }),
    ];
    state.receipts = [
      normalizeReceipt({ date: t, vendor: "Shell", category: "Fuel", amount: 72.18, notes: "Fuel" }),
      normalizeReceipt({ date: t, vendor: "Home Depot", category: "Supplies", amount: 29.40, notes: "Supplies" }),
    ];
    persist();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) {
    return state.jobs.filter(j => j.date === dateStr);
  }
  function receiptsByDate(dateStr) {
    return state.receipts.filter(r => r.date === dateStr);
  }
  function sumJobRevenue(dateStr) {
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }
  function sumReceiptExpense(dateStr) {
    let total = 0;
    for (const r of receiptsByDate(dateStr)) total += clampMoney(r.amount);
    return clampMoney(total);
  }
  function monthTotals(y, m) {
    let rev = 0, exp = 0;
    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() === y && d.getMonth() === m && j.status !== STATUS.cancelled) rev += clampMoney(j.amount);
    }
    for (const r of state.receipts) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() === y && d.getMonth() === m) exp += clampMoney(r.amount);
    }
    return { revenue: clampMoney(rev), expenses: clampMoney(exp), net: clampMoney(rev - exp) };
  }

  // ---------------------------
  // HARD FIX: if clicks are dead because of overlay/pointer-events
  // ---------------------------
  function unbrickClicks() {
    // Ensure base containers accept pointer events
    document.documentElement.style.pointerEvents = "auto";
    document.body.style.pointerEvents = "auto";

    // Kill invisible overlays that block taps
    $$("[id*='overlay'], .overlay, .modal-overlay").forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && cs.inset !== "auto" && cs.display !== "none") {
        // if it looks like a full-screen overlay and is not visibly active, disable it
        if (cs.opacity === "0" || el.hidden === true) el.style.display = "none";
      }
    });
  }

  // ---------------------------
  // Badge + Crash panel
  // ---------------------------
  function showBadge() {
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
    b.style.font = "800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    b.style.pointerEvents = "none";
    document.body.appendChild(b);
  }

  function showCrash(err) {
    let box = $("#fleetCrash");
    if (!box) {
      box = document.createElement("pre");
      box.id = "fleetCrash";
      box.style.position = "fixed";
      box.style.left = "12px";
      box.style.bottom = "12px";
      box.style.zIndex = "999999";
      box.style.maxWidth = "78vw";
      box.style.maxHeight = "32vh";
      box.style.overflow = "auto";
      box.style.padding = "10px";
      box.style.borderRadius = "12px";
      box.style.background = "rgba(150,0,0,0.75)";
      box.style.color = "#fff";
      box.style.font = "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      box.style.whiteSpace = "pre-wrap";
      document.body.appendChild(box);
    }
    box.textContent = `JS crashed:\n${String(err?.message || err)}\n\n${String(err?.stack || "")}`;
  }

  // ---------------------------
  // Inject minimal CSS (so even broken styles.css still shows a usable app)
  // ---------------------------
  function injectEmergencyStyles() {
    if ($("#fleetEmergencyCSS")) return;
    const s = document.createElement("style");
    s.id = "fleetEmergencyCSS";
    s.textContent = `
      :root{
        --bg:#0b0b12;
        --panel:rgba(255,255,255,0.06);
        --panel2:rgba(0,0,0,0.25);
        --border:rgba(255,255,255,0.12);
        --text:#eaeaff;
        --muted:rgba(234,234,255,0.72);
        --accent:#8c3cff;
        --accent2:#5a2bd6;
        --good:#00c878;
        --info:#00a0ff;
        --danger:#ff4d5a;
      }
      body{ margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; }
      #fleetApp{ height:100vh; display:grid; grid-template-columns:260px 1fr; grid-template-rows:56px 1fr; }
      .fleet-topbar{ grid-column:1/-1; display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--border); background:rgba(20,20,35,0.9); position:sticky; top:0; z-index:50; overflow:auto; }
      .fleet-brand{ font-weight:900; letter-spacing:.3px; white-space:nowrap; }
      .fleet-topnav{ display:flex; gap:8px; flex:1; min-width:max-content; }
      .fleet-btn{ border:1px solid var(--border); background:var(--panel); color:var(--text); padding:8px 10px; border-radius:12px; font-weight:800; cursor:pointer; white-space:nowrap; }
      .fleet-btn.active{ outline:2px solid rgba(140,60,255,0.6); }
      .fleet-sidebar{ grid-row:2; border-right:1px solid var(--border); padding:12px; overflow:auto; background:rgba(12,12,22,0.9); }
      .fleet-sidebtn{ width:100%; text-align:left; margin:0 0 8px; }
      .fleet-main{ grid-row:2; overflow:auto; padding:12px; }
      .panel{ background:var(--panel2); border:1px solid var(--border); border-radius:14px; padding:12px; margin-bottom:12px; }
      .title{ font-weight:900; font-size:18px; }
      .sub{ color:var(--muted); margin-top:6px; }
      .grid3{ display:grid; grid-template-columns:repeat(3,minmax(220px,1fr)); gap:12px; }
      @media (max-width: 980px){ #fleetApp{ grid-template-columns:1fr; grid-template-rows:56px auto 1fr; } .fleet-sidebar{ grid-row:2; display:flex; gap:8px; overflow:auto; } .fleet-sidebtn{ width:auto; margin:0; } .fleet-main{ grid-row:3; } .grid3{ grid-template-columns:1fr; } }
      .chips{ display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
      .chip{ display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; border:1px solid var(--border); background:rgba(255,255,255,0.07); font-size:12px; font-weight:800; }
      .chip.jobs{ outline:2px solid rgba(0,200,120,0.45); }
      .chip.receipts{ box-shadow: inset 0 0 0 2px rgba(0,160,255,0.45); }
      .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
      .field{ display:flex; flex-direction:column; gap:6px; min-width:200px; }
      input, select{ border:1px solid var(--border); background:rgba(255,255,255,0.06); color:var(--text); padding:10px; border-radius:12px; outline:none; }
      .danger{ background:rgba(255,77,90,0.12); border-color:rgba(255,77,90,0.35); }
      .primary{ background:rgba(140,60,255,0.18); border-color:rgba(140,60,255,0.45); }
      .muted{ color:var(--muted); }
      .calendar-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:8px; margin-top:10px; }
      .dow{ color:var(--muted); font-weight:900; }
      .daycell{ min-height:74px; border-radius:14px; border:1px solid var(--border); background:rgba(255,255,255,0.06); padding:10px; cursor:pointer; text-align:left; }
      .daycell.today{ background:rgba(140,60,255,0.25); }
      .jobrow,.rrow{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border-radius:14px; border:1px solid var(--border); background:rgba(255,255,255,0.04); }
      .jobmain,.rmain{ min-width:0; }
      .jobtitle,.rtitle{ font-weight:900; }
      .jobsub,.rsub{ color:var(--muted); font-size:12px; margin-top:4px; }
      .actions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    `;
    document.head.appendChild(s);
  }

  // ---------------------------
  // Force-create the app shell (only if your current HTML doesn’t already have views)
  // ---------------------------
  const NAV = [
    { label:"Dashboard", view:"dashboard" },
    { label:"Calendar", view:"calendar" },
    { label:"Day Workspace", view:"day" },
    { label:"Drivers", view:"drivers" },
    { label:"Trucks", view:"trucks" },
    { label:"Dispatch", view:"dispatch" },
    { label:"Finances", view:"finances" },
    { label:"Inventory", view:"inventory" },
    { label:"AI Scanner", view:"aiscanner" },
  ];

  function ensureShell() {
    // If the user’s HTML already has view containers, we won’t replace them.
    if ($("[id^='view-']")) return;

    let app = $("#fleetApp");
    if (!app) {
      app = document.createElement("div");
      app.id = "fleetApp";
      document.body.prepend(app);
    }
    app.innerHTML = `
      <div class="fleet-topbar">
        <div class="fleet-brand">Fleet CRM</div>
        <div class="fleet-topnav" id="fleetTopNav"></div>
        <button class="fleet-btn" id="fleetTodayBtn" type="button">Today</button>
        <button class="fleet-btn" id="fleetPrevBtn" type="button">◀</button>
        <button class="fleet-btn" id="fleetNextBtn" type="button">▶</button>
      </div>

      <aside class="fleet-sidebar" id="fleetSidebar"></aside>
      <main class="fleet-main" id="fleetMain"></main>
    `;

    const top = $("#fleetTopNav");
    const side = $("#fleetSidebar");

    NAV.forEach(n => {
      const b1 = document.createElement("button");
      b1.className = "fleet-btn";
      b1.type = "button";
      b1.setAttribute("data-view", n.view);
      b1.textContent = n.label;
      top.appendChild(b1);

      const b2 = document.createElement("button");
      b2.className = "fleet-btn fleet-sidebtn";
      b2.type = "button";
      b2.setAttribute("data-view", n.view);
      b2.textContent = n.label;
      side.appendChild(b2);
    });

    // Create view containers
    const main = $("#fleetMain");
    NAV.forEach(n => {
      const sec = document.createElement("section");
      sec.id = `view-${n.view}`;
      sec.style.display = "none";
      main.appendChild(sec);
    });
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function setView(view) {
    state.view = view;

    $$("[data-view]").forEach(b => b.classList.toggle("active", (b.dataset.view || "") === view));
    $$("[id^='view-']").forEach(v => (v.style.display = "none"));
    const panel = $(`#view-${view}`);
    if (panel) panel.style.display = "block";

    renderAll();
  }

  function renderDashboard() {
    const host = $("#view-dashboard");
    if (!host) return;

    const todayStr = ymd(state.currentDate);
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const mt = monthTotals(y, m);

    host.innerHTML = `
      <div class="panel">
        <div class="title">Dashboard</div>
        <div class="sub">Your core metrics and quick navigation.</div>
      </div>

      <div class="grid3">
        <div class="panel">
          <div class="title">Today</div>
          <div class="sub">${escapeHtml(todayStr)}</div>
          <div style="margin-top:10px; font-weight:800;">
            Jobs: ${jobsByDate(todayStr).length} · Receipts: ${receiptsByDate(todayStr).length}
          </div>
          <div style="margin-top:8px;">
            Revenue: <b>${money(sumJobRevenue(todayStr))}</b><br/>
            Expenses: <b>${money(sumReceiptExpense(todayStr))}</b>
          </div>
          <div style="margin-top:8px;">
            Net: <b>${money(sumJobRevenue(todayStr) - sumReceiptExpense(todayStr))}</b>
          </div>
        </div>

        <div class="panel">
          <div class="title">Month Snapshot</div>
          <div class="sub">${escapeHtml(monthName(m))} ${y}</div>
          <div style="margin-top:10px;">
            Revenue: <b>${money(mt.revenue)}</b><br/>
            Expenses: <b>${money(mt.expenses)}</b><br/>
            Net: <b>${money(mt.net)}</b>
          </div>
        </div>

        <div class="panel">
          <div class="title">Quick Calendar</div>
          <div class="sub">Tap a day to open Day Workspace.</div>
          <div class="chips" id="quickCal"></div>
        </div>
      </div>

      <div class="panel">
        <div class="title">Pressure Points</div>
        <div class="sub">Where the money is leaking or stacking.</div>
        <div style="margin-top:10px;">
          • Highest job count days have markers in Calendar<br/>
          • Receipt spikes show as 🧾 chips on the month grid
        </div>
      </div>
    `;

    // Build quick calendar pills
    const quick = $("#quickCal");
    if (!quick) return;
    quick.innerHTML = "";
    const y2 = state.currentDate.getFullYear();
    const m2 = state.currentDate.getMonth();
    const daysInMonth = new Date(y2, m2 + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y2, m2, day);
      const ds = ymd(d);

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "chip";
      pill.textContent = String(day);

      const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      if (jc) pill.classList.add("jobs");
      if (rc) pill.classList.add("receipts");

      pill.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      quick.appendChild(pill);
    }
  }

  function renderCalendar() {
    const host = $("#view-calendar");
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    host.innerHTML = `
      <div class="panel">
        <div class="title">Calendar</div>
        <div class="sub">Month view with job + receipt markers. Click a day for Day Workspace.</div>
        <div style="margin-top:10px; font-weight:900;">${escapeHtml(monthName(m))} ${y}</div>
      </div>

      <div class="panel">
        <div class="calendar-grid" id="calGrid"></div>
      </div>
    `;

    const grid = $("#calGrid");
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    dow.forEach(d => {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      grid.appendChild(h);
    });

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      grid.appendChild(pad);
    }

    const todayStr = ymd(startOfDay(new Date()));

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const ds = ymd(d);

      const jc = jobsByDate(ds).filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "daycell" + (ds === todayStr ? " today" : "");
      cell.innerHTML = `
        <div style="font-weight:900;">${day}</div>
        <div class="chips">
          ${jc ? `<span class="chip jobs">${jc} job${jc===1?"":"s"}</span>` : ""}
          ${rc ? `<span class="chip receipts">🧾 ${rc}</span>` : ""}
        </div>
      `;

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  function renderDay() {
    const host = $("#view-day");
    if (!host) return;

    const dateStr = ymd(state.currentDate);
    const jobs = jobsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const receipts = receiptsByDate(dateStr).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));

    const rev = sumJobRevenue(dateStr);
    const exp = sumReceiptExpense(dateStr);
    const net = clampMoney(rev - exp);

    // job options for receipt linking
    const jobOptions = [
      `<option value="">(Not linked)</option>`,
      ...jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="title">Day Workspace</div>
        <div class="sub">${escapeHtml(dateStr)}</div>
        <div style="margin-top:10px; font-weight:900;">
          Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}
        </div>
      </div>

      <div class="panel">
        <div class="title">Jobs</div>
        <div class="sub">Edit status, edit details, delete. (Add job UI comes next step.)</div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;" id="jobsList"></div>
      </div>

      <div class="panel">
        <div class="title">Receipts</div>
        <div class="sub">Add expenses and link to a job when relevant.</div>

        <div class="row" style="margin-top:10px;">
          <label class="field">
            <span class="muted">Vendor</span>
            <input id="rcVendor" type="text" placeholder="Shell, Home Depot..." />
          </label>
          <label class="field" style="min-width:140px;">
            <span class="muted">Amount</span>
            <input id="rcAmount" type="number" step="0.01" placeholder="0.00" />
          </label>
          <label class="field" style="min-width:180px;">
            <span class="muted">Category</span>
            <select id="rcCategory">
              <option value="">Uncategorized</option>
              ${RECEIPT_CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
            </select>
          </label>
          <label class="field" style="min-width:240px;">
            <span class="muted">Link to Job</span>
            <select id="rcJob">${jobOptions}</select>
          </label>
          <label class="field" style="min-width:260px; flex:1;">
            <span class="muted">Notes</span>
            <input id="rcNotes" type="text" placeholder="receipt #, reason..." />
          </label>
          <button class="fleet-btn primary" id="rcAdd" type="button">Add Receipt</button>
        </div>

        <div id="rcErr" class="muted" style="margin-top:10px; color: var(--danger); font-weight:900;"></div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;" id="rcList"></div>
      </div>
    `;

    // Render jobs list
    const jHost = $("#jobsList");
    if (jHost) {
      jHost.innerHTML = jobs.length ? "" : `<div class="muted">No jobs for this day yet.</div>`;
      jobs.forEach(job => {
        const row = document.createElement("div");
        row.className = "jobrow";
        row.innerHTML = `
          <div class="jobmain">
            <div class="jobtitle">${escapeHtml(job.customer || "Customer")} · ${money(job.amount)}</div>
            <div class="jobsub">${escapeHtml(job.pickup || "Pickup")} → ${escapeHtml(job.dropoff || "Dropoff")}</div>
          </div>
          <div class="actions">
            <select data-job-status="${escapeHtml(job.id)}">
              <option value="scheduled" ${job.status===STATUS.scheduled?"selected":""}>Scheduled</option>
              <option value="completed" ${job.status===STATUS.completed?"selected":""}>Completed</option>
              <option value="cancelled" ${job.status===STATUS.cancelled?"selected":""}>Cancelled</option>
            </select>
            <button class="fleet-btn" type="button" data-job-edit="${escapeHtml(job.id)}">Edit</button>
            <button class="fleet-btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
          </div>
        `;
        jHost.appendChild(row);
      });
    }

    // Render receipts list
    const rHost = $("#rcList");
    if (rHost) {
      rHost.innerHTML = receipts.length ? "" : `<div class="muted">No receipts for this day yet.</div>`;
      receipts.forEach(r => {
        const linked = r.jobId ? state.jobs.find(j => j.id === r.jobId) : null;
        const row = document.createElement("div");
        row.className = "rrow";
        row.innerHTML = `
          <div class="rmain">
            <div class="rtitle">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")} · ${money(r.amount)}
              ${linked ? ` <span class="chip jobs">Linked: ${escapeHtml(linked.customer || "Job")}</span>` : ""}
            </div>
            <div class="rsub">${escapeHtml(r.notes || "")}</div>
          </div>
          <div class="actions">
            <button class="fleet-btn" type="button" data-rc-edit="${escapeHtml(r.id)}">Edit</button>
            <button class="fleet-btn danger" type="button" data-rc-del="${escapeHtml(r.id)}">Delete</button>
          </div>
        `;
        rHost.appendChild(row);
      });
    }
  }

  function renderPlaceholder(view, title) {
    const host = $(`#view-${view}`);
    if (!host) return;
    host.innerHTML = `
      <div class="panel">
        <div class="title">${escapeHtml(title)}</div>
        <div class="sub">Page is reachable. Next logic will populate it.</div>
      </div>
    `;
  }

  function renderAll() {
    // Always render something for every view so nothing looks “dead”
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();

    if (state.view === "drivers") renderPlaceholder("drivers","Drivers");
    if (state.view === "trucks") renderPlaceholder("trucks","Trucks");
    if (state.view === "dispatch") renderPlaceholder("dispatch","Dispatch");
    if (state.view === "finances") renderPlaceholder("finances","Finances");
    if (state.view === "inventory") renderPlaceholder("inventory","Inventory");
    if (state.view === "aiscanner") renderPlaceholder("aiscanner","AI Scanner");
  }

  // ---------------------------
  // Events (delegation so it never breaks)
  // ---------------------------
  function bindEvents() {
    // Navigation always works
    document.addEventListener("click", (e) => {
      const nav = e.target.closest?.("[data-view]");
      if (nav) {
        e.preventDefault();
        setView(nav.dataset.view);
        return;
      }

      // Job status
      const sel = e.target.closest?.("select[data-job-status]");
      if (sel) {
        const id = sel.getAttribute("data-job-status");
        const j = state.jobs.find(x => x.id === id);
        if (!j) return;
        j.status = STATUS_LABEL[sel.value] ? sel.value : STATUS.scheduled;
        j.updatedAt = Date.now();
        persist();
        renderAll();
        return;
      }

      // Job delete
      const del = e.target.closest?.("[data-job-del]");
      if (del) {
        const id = del.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter(j => j.id !== id);
        // unlink receipts
        state.receipts = state.receipts.map(r => r.jobId === id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r);
        persist();
        renderAll();
        return;
      }

      // Job edit (prompt editor)
      const edit = e.target.closest?.("[data-job-edit]");
      if (edit) {
        const id = edit.getAttribute("data-job-edit");
        const j = state.jobs.find(x => x.id === id);
        if (!j) return;

        const customer = prompt("Customer:", j.customer || "");
        if (customer === null) return;
        const pickup = prompt("Pickup:", j.pickup || "");
        if (pickup === null) return;
        const dropoff = prompt("Dropoff:", j.dropoff || "");
        if (dropoff === null) return;
        const amount = prompt("Amount:", String(j.amount ?? 0));
        if (amount === null) return;

        j.customer = customer.trim();
        j.pickup = pickup.trim();
        j.dropoff = dropoff.trim();
        j.amount = clampMoney(amount);
        j.updatedAt = Date.now();

        persist();
        renderAll();
        return;
      }

      // Receipt delete
      const rdel = e.target.closest?.("[data-rc-del]");
      if (rdel) {
        const id = rdel.getAttribute("data-rc-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== id);
        persist();
        renderAll();
        return;
      }

      // Receipt edit
      const redit = e.target.closest?.("[data-rc-edit]");
      if (redit) {
        const id = redit.getAttribute("data-rc-edit");
        const r = state.receipts.find(x => x.id === id);
        if (!r) return;

        const vendor = prompt("Vendor:", r.vendor || "");
        if (vendor === null) return;
        const amount = prompt("Amount:", String(r.amount ?? 0));
        if (amount === null) return;
        const category = prompt(`Category (e.g. ${RECEIPT_CATEGORIES.join(", ")}):`, r.category || "");
        if (category === null) return;
        const notes = prompt("Notes:", r.notes || "");
        if (notes === null) return;

        r.vendor = vendor.trim();
        r.amount = clampMoney(amount);
        r.category = category.trim();
        r.notes = notes.trim();
        r.updatedAt = Date.now();

        persist();
        renderAll();
        return;
      }
    }, true);

    // Add receipt button
    document.addEventListener("click", (e) => {
      const btn = e.target.closest?.("#rcAdd");
      if (!btn) return;

      const host = $("#view-day");
      if (!host) return;

      const vendor = ($("#rcVendor")?.value || "").trim();
      const amount = clampMoney($("#rcAmount")?.value ?? 0);
      const category = ($("#rcCategory")?.value || "").trim();
      const jobId = ($("#rcJob")?.value || "").trim();
      const notes = ($("#rcNotes")?.value || "").trim();
      const err = $("#rcErr");

      if (!vendor) { if (err) err.textContent = "Vendor is required."; return; }
      if (amount <= 0) { if (err) err.textContent = "Amount must be greater than 0."; return; }
      if (err) err.textContent = "";

      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date: ymd(state.currentDate),
        vendor, amount, category, jobId, notes,
        createdAt: Date.now(), updatedAt: Date.now(),
      }));

      persist();
      renderAll();
    });

    // Topbar date nav
    $("#fleetTodayBtn")?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      renderAll();
    });

    $("#fleetPrevBtn")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
        renderAll();
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        renderAll();
      }
    });

    $("#fleetNextBtn")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
        renderAll();
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        renderAll();
      }
    });
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    console.log("✅ SAFE RESTORE init");
    showBadge();
    injectEmergencyStyles();
    unbrickClicks();
    seedIfEmpty();
    ensureShell();         // only builds shell if your HTML doesn’t already have views
    bindEvents();
    setView("dashboard");  // brings you back to a working home base
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
