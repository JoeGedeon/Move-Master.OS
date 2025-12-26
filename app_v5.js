/* ============================================================
   Fleet CRM — apps_v5.js (RECOVERY MODE v6)
   ------------------------------------------------------------
   Goal: restore navigation + dashboard widgets + full calendar
   EVEN IF HTML ids/classes changed or are partially missing.

   Fixes:
   - Buttons press but do nothing
   - Can't tap into pages
   - Dashboard headings but no data
   - Calendar tab not showing real calendar

   Notes:
   - Uses CAPTURE phase click routing (hard to break)
   - Restores pointer-events on common containers
   - Creates fallback views/widgets if missing
   - LocalStorage seed so widgets show data
   ============================================================ */

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const clampMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };
  const money = (n) => `$${clampMoney(n).toFixed(2)}`;
  const monthName = (m) =>
    ["January","February","March","April","May","June","July","August","September","October","November","December"][m];

  function makeId(prefix="id"){
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random()*1e6)}`; }
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------- Storage ----------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";

  function loadArray(key){
    try{
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }
  function saveArray(key, arr){
    try{ localStorage.setItem(key, JSON.stringify(arr)); }catch{}
  }

  const STATUS = { scheduled:"scheduled", completed:"completed", cancelled:"cancelled" };

  function normalizeJob(j){
    const o = { ...(j||{}) };
    o.id = o.id || makeId("job");
    o.date = o.date || ymd(startOfDay(new Date()));
    o.customer = (o.customer || "Customer").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.status = o.status || STATUS.scheduled;
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }
  function normalizeReceipt(r){
    const o = { ...(r||{}) };
    o.id = o.id || makeId("rcpt");
    o.date = o.date || ymd(startOfDay(new Date()));
    o.vendor = (o.vendor || "Vendor").trim();
    o.category = (o.category || "Other").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  // ---------- State ----------
  const state = {
    view: "dashboard",
    today: startOfDay(new Date()),
    cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
  };

  function persist(){
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
  }

  function seedIfEmpty(){
    if (state.jobs.length === 0 && state.receipts.length === 0){
      const t = ymd(state.today);
      state.jobs = [
        normalizeJob({ date:t, customer:"Sample Job A", amount:900, status:STATUS.scheduled }),
        normalizeJob({ date:t, customer:"Sample Job B", amount:1200, status:STATUS.completed }),
      ];
      state.receipts = [
        normalizeReceipt({ date:t, vendor:"Shell", category:"Fuel", amount:68.42 }),
        normalizeReceipt({ date:t, vendor:"Home Depot", category:"Supplies", amount:34.19 }),
      ];
      persist();
    }
  }

  // ---------- UI Proof ----------
  function badge(){
    if ($("#fleetJsBadge")) return;
    const b = document.createElement("div");
    b.id = "fleetJsBadge";
    b.textContent = "JS ✅";
    b.style.position = "fixed";
    b.style.bottom = "10px";
    b.style.right = "10px";
    b.style.zIndex = "999999";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "999px";
    b.style.background = "rgba(0,160,90,0.9)";
    b.style.color = "#fff";
    b.style.font = "700 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    b.style.pointerEvents = "none";
    document.body.appendChild(b);
  }

  function debugBox(text){
    let p = $("#fleetDebug");
    if (!p){
      p = document.createElement("pre");
      p.id = "fleetDebug";
      p.style.position = "fixed";
      p.style.left = "10px";
      p.style.bottom = "10px";
      p.style.zIndex = "999998";
      p.style.maxWidth = "70vw";
      p.style.maxHeight = "28vh";
      p.style.overflow = "auto";
      p.style.padding = "10px";
      p.style.borderRadius = "10px";
      p.style.background = "rgba(0,0,0,0.65)";
      p.style.color = "#fff";
      p.style.font = "12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      p.style.whiteSpace = "pre-wrap";
      document.body.appendChild(p);
    }
    p.textContent = text;
  }

  // ---------- Critical fix: pointer events / overlays ----------
  function restorePointerEvents(){
    // Common offenders: parent containers accidentally set to pointer-events:none
    const zones = [
      document.body,
      $(".sidebar"),
      $(".topbar"),
      $(".toolbar"),
      $("nav"),
      $("#app"),
      $("#root")
    ].filter(Boolean);

    zones.forEach(z => {
      z.style.pointerEvents = "auto";
    });

    // Also ensure any hidden overlays aren't sitting on top
    $$("[id*='overlay'], .overlay, .modal-overlay").forEach(o => {
      // If overlay is visible but shouldn't be, it blocks clicks.
      // We don't destroy it, just stop it from blocking unless explicitly shown.
      if (o.hidden === true) o.style.display = "none";
      if (getComputedStyle(o).display !== "none" && getComputedStyle(o).opacity === "0") {
        o.style.display = "none";
      }
    });
  }

  // ---------- Views (use existing if present, otherwise create minimal) ----------
  const VIEWS = ["dashboard","calendar","day","drivers","trucks","dispatch","finances","inventory","aiscanner"];

  function ensureView(view){
    let el = document.getElementById(`view-${view}`);
    if (el) return el;

    // attach to the same parent as existing view containers if possible
    const any = $$('[id^="view-"]')[0];
    const mount = (any && any.parentElement) ? any.parentElement : ( $("main") || $(".main") || document.body );
    el = document.createElement("section");
    el.id = `view-${view}`;
    el.className = "view";
    el.style.display = "none";
    el.style.padding = "12px";
    mount.appendChild(el);
    return el;
  }

  function showView(view){
    state.view = view;
    $$('[id^="view-"]').forEach(v => {
      v.style.display = "none";
      v.classList.remove("active");
    });
    const el = ensureView(view);
    el.style.display = "block";
    el.classList.add("active");

    // mark nav active if data-view exists
    $$("[data-view]").forEach(b => b.classList.toggle("active", (b.dataset.view||"") === view));
  }

  // ---------- Data helpers ----------
  function jobsByDate(dateStr){
    return state.jobs.filter(j => j.date === dateStr && j.status !== STATUS.cancelled);
  }
  function receiptsByDate(dateStr){
    return state.receipts.filter(r => r.date === dateStr);
  }

  // ---------- Dashboard widgets ----------
  function renderDashboard(){
    const host = ensureView("dashboard");

    // If the user already has dashboard markup, do not nuke it.
    // We only ensure there is a widget strip present.
    let widgetWrap = $("#fleetDashWidgets", host);
    if (!widgetWrap){
      widgetWrap = document.createElement("div");
      widgetWrap.id = "fleetDashWidgets";
      widgetWrap.style.marginTop = "10px";
      host.appendChild(widgetWrap);
    }

    const todayStr = ymd(state.today);
    const y = state.cursor.getFullYear();
    const m = state.cursor.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let monthRevenue = 0, monthExpenses = 0;
    for (const j of state.jobs){
      const d = new Date(j.date);
      if (!Number.isNaN(d) && d.getFullYear()===y && d.getMonth()===m && j.status!==STATUS.cancelled){
        monthRevenue += clampMoney(j.amount);
      }
    }
    for (const r of state.receipts){
      const d = new Date(r.date);
      if (!Number.isNaN(d) && d.getFullYear()===y && d.getMonth()===m){
        monthExpenses += clampMoney(r.amount);
      }
    }

    const revToday = jobsByDate(todayStr).reduce((s,j)=>s+clampMoney(j.amount),0);
    const expToday = receiptsByDate(todayStr).reduce((s,r)=>s+clampMoney(r.amount),0);

    widgetWrap.innerHTML = `
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:12px; min-width:240px;">
          <div style="font-weight:800;">Today</div>
          <div style="opacity:.9; margin-top:6px;">${escapeHtml(todayStr)}</div>
          <div style="margin-top:6px;">Jobs: <b>${jobsByDate(todayStr).length}</b> · Receipts: <b>${receiptsByDate(todayStr).length}</b></div>
          <div style="margin-top:6px;">Revenue: <b>${money(revToday)}</b> · Expenses: <b>${money(expToday)}</b></div>
        </div>

        <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:12px; min-width:260px;">
          <div style="font-weight:800;">Month Snapshot</div>
          <div style="opacity:.9; margin-top:6px;">${escapeHtml(monthName(m))} ${y}</div>
          <div style="margin-top:6px;">Revenue: <b>${money(monthRevenue)}</b></div>
          <div style="margin-top:6px;">Expenses: <b>${money(monthExpenses)}</b></div>
          <div style="margin-top:6px;">Net: <b>${money(monthRevenue - monthExpenses)}</b></div>
        </div>

        <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:12px; min-width:260px;">
          <div style="font-weight:800;">Quick Calendar</div>
          <div id="fleetQuickCal" style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;"></div>
          <div style="margin-top:8px; opacity:.85; font-size:12px;">Tap a day to open the full calendar.</div>
        </div>
      </div>
    `;

    const q = $("#fleetQuickCal", widgetWrap);
    if (q){
      q.innerHTML = "";
      for (let day=1; day<=daysInMonth; day++){
        const d = new Date(y, m, day);
        const ds = ymd(d);
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = String(day);
        b.style.padding = "6px 10px";
        b.style.borderRadius = "10px";
        b.style.border = "1px solid rgba(255,255,255,0.12)";
        b.style.background = "rgba(255,255,255,0.08)";
        b.style.color = "inherit";
        if (jobsByDate(ds).length) b.style.outline = "2px solid rgba(0,200,120,0.7)";
        if (receiptsByDate(ds).length) b.style.boxShadow = "inset 0 0 0 2px rgba(0,160,255,0.65)";
        b.addEventListener("click", () => openCalendarOverlay(new Date(y, m, day)));
        q.appendChild(b);
      }
    }
  }

  // ---------- Calendar overlay (always works) ----------
  function openCalendarOverlay(focusDate){
    const fd = focusDate ? startOfDay(focusDate) : state.today;
    let overlay = $("#fleetCalOverlay");
    if (!overlay){
      overlay = document.createElement("div");
      overlay.id = "fleetCalOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "999997";
      overlay.style.background = "rgba(0,0,0,0.78)";
      overlay.style.display = "none";
      overlay.style.padding = "14px";
      overlay.style.boxSizing = "border-box";
      overlay.addEventListener("click",(e)=>{ if (e.target===overlay) overlay.style.display="none"; });
      document.body.appendChild(overlay);
    }

    const y = fd.getFullYear();
    const m = fd.getMonth();
    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();

    overlay.style.display = "block";
    overlay.innerHTML = `
      <div style="max-width:980px; margin:0 auto; background:rgba(24,24,34,0.98); border-radius:14px; padding:14px; border:1px solid rgba(255,255,255,0.12);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="color:#fff; font-weight:900; font-size:18px;">${escapeHtml(monthName(m))} ${y}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" id="calPrev" style="padding:8px 10px; border-radius:10px;">Prev</button>
            <button type="button" id="calToday" style="padding:8px 10px; border-radius:10px;">Today</button>
            <button type="button" id="calNext" style="padding:8px 10px; border-radius:10px;">Next</button>
            <button type="button" id="calClose" style="padding:8px 10px; border-radius:10px;">Close</button>
          </div>
        </div>

        <div id="calGrid" style="margin-top:12px; display:grid; grid-template-columns:repeat(7,1fr); gap:8px;"></div>
        <div style="margin-top:12px; color:#fff; opacity:.85; font-size:12px;">
          Legend: green outline = jobs · blue ring = receipts
        </div>
      </div>
    `;

    const grid = $("#calGrid", overlay);
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (const d of dow){
      const h = document.createElement("div");
      h.textContent = d;
      h.style.color = "#fff";
      h.style.opacity = "0.8";
      h.style.fontWeight = "800";
      grid.appendChild(h);
    }

    for (let i=0; i<firstDow; i++){
      const pad = document.createElement("div");
      pad.style.height = "64px";
      grid.appendChild(pad);
    }

    for (let day=1; day<=daysInMonth; day++){
      const date = new Date(y, m, day);
      const ds = ymd(date);
      const jc = jobsByDate(ds).length;
      const rc = receiptsByDate(ds).length;

      const btn = document.createElement("button");
      btn.type="button";
      btn.style.height="64px";
      btn.style.borderRadius="12px";
      btn.style.border="1px solid rgba(255,255,255,0.12)";
      btn.style.background="rgba(255,255,255,0.06)";
      btn.style.color="#fff";
      btn.style.textAlign="left";
      btn.style.padding="10px";

      if (jc) btn.style.outline="2px solid rgba(0,200,120,0.75)";
      if (rc) btn.style.boxShadow="inset 0 0 0 2px rgba(0,160,255,0.65)";
      if (ds === ymd(state.today)) btn.style.background="rgba(140,60,255,0.45)";

      btn.innerHTML = `
        <div style="font-weight:900;">${day}</div>
        <div style="margin-top:6px; opacity:.85; font-size:12px;">
          ${jc ? `${jc} job(s)` : ""}${jc && rc ? " · " : ""}${rc ? `${rc} receipt(s)` : ""}
        </div>
      `;

      btn.addEventListener("click", ()=>{
        alert(`${ds}\nJobs: ${jc}\nReceipts: ${rc}`);
      });

      grid.appendChild(btn);
    }

    $("#calClose", overlay).onclick = ()=> overlay.style.display="none";
    $("#calToday", overlay).onclick = ()=> openCalendarOverlay(state.today);
    $("#calPrev", overlay).onclick = ()=> openCalendarOverlay(new Date(y, m-1, 1));
    $("#calNext", overlay).onclick = ()=> openCalendarOverlay(new Date(y, m+1, 1));
  }

  // ---------- Routing: data-view OR text fallback ----------
  const TEXT_TO_VIEW = [
    { re: /dashboard/i, view: "dashboard" },
    { re: /\bcalendar\b/i, view: "calendar" },
    { re: /day\s*workspace/i, view: "day" },
    { re: /\bdrivers?\b/i, view: "drivers" },
    { re: /\btrucks?\b/i, view: "trucks" },
    { re: /\bdispatch\b/i, view: "dispatch" },
    { re: /\bfinances?\b|\bfinance\b/i, view: "finances" },
    { re: /\binventory\b/i, view: "inventory" },
    { re: /ai\s*scanner/i, view: "aiscanner" },
  ];

  function resolveViewFromClick(target){
    const el = target?.closest?.("[data-view],button,a,[role='button'],.nav-item,.tile,.card") || target;
    if (!el) return null;

    const dv = (el.getAttribute?.("data-view") || el.dataset?.view || "").trim();
    if (dv) return dv;

    const txt = (el.textContent || "").trim();
    for (const m of TEXT_TO_VIEW){
      if (m.re.test(txt)) return m.view;
    }
    return null;
  }

  function bindRouter(){
    // capture phase so it still works if something stops bubbling
    document.addEventListener("click", (e)=>{
      const view = resolveViewFromClick(e.target);
      if (!view) return;

      // Prevent accidental navigation away
      if (e.target?.closest?.("a")) e.preventDefault();

      // Calendar gets the overlay (guaranteed calendar)
      if (view === "calendar"){
        e.preventDefault();
        openCalendarOverlay(state.today);
        return;
      }

      // Show view container if it exists or create minimal
      showView(view);

      // Render essentials when landing
      if (view === "dashboard") renderDashboard();
      else {
        const v = ensureView(view);
        if (!v.dataset.filled){
          v.dataset.filled = "1";
          v.innerHTML = `
            <div style="border-radius:12px; padding:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12);">
              <div style="font-size:18px; font-weight:900;">${escapeHtml(view.toUpperCase())}</div>
              <div style="opacity:.9; margin-top:6px;">This page is reachable again. Next we wire its actual tables.</div>
            </div>
          `;
        }
      }
    }, true);
  }

  // ---------- Init ----------
  function init(){
    console.log("✅ Recovery v6 init");
    badge();
    restorePointerEvents();
    seedIfEmpty();

    // Ensure baseline view containers exist if HTML is missing them
    VIEWS.forEach(ensureView);

    // Render dashboard data (even if your HTML dashboard exists, we append our widget strip)
    showView("dashboard");
    renderDashboard();

    // Bind router last so it catches everything
    bindRouter();

    // Debug readout: helps identify if your HTML has data-view buttons
    const dvCount = $$("[data-view]").length;
    debugBox(
      [
        "Fleet Recovery Debug:",
        `- data-view buttons found: ${dvCount}`,
        `- jobs stored: ${state.jobs.length}`,
        `- receipts stored: ${state.receipts.length}`,
        "",
        "If data-view buttons = 0, routing will still work by button text.",
        "Calendar always works via overlay even if calendar HTML is broken."
      ].join("\n")
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
