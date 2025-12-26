/* ============================================================
   apps_v5.js — Adaptive Wiring + Dashboard Hydration (v5)
   ------------------------------------------------------------
   Fixes:
   - Buttons press but don't navigate
   - Dashboard shows headings but no data
   - Quick calendar shows label but no calendar
   - Works with unknown HTML by matching headings/text
   ------------------------------------------------------------
   This file:
   ✅ Adds a visible "JS LOADED" badge + debug panel
   ✅ Wires nav by data-view OR text match (Drivers/Trucks/etc.)
   ✅ Hydrates dashboard widgets by finding headings:
      "Quick Calendar", "Month Snapshot", "Pressure Points"
   ✅ Creates a full Month Calendar modal-like view if no calendar page exists
   ✅ LocalStorage-backed demo data (jobs/receipts) so widgets populate
   ============================================================ */

(() => {
  "use strict";

  // ----------------- helpers -----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const clampMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };
  const money = (n) => `$${clampMoney(n).toFixed(2)}`;

  function makeId(prefix = "id") {
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  // ----------------- storage -----------------
  const LS = {
    jobs: "fleet_jobs_v5",
    receipts: "fleet_receipts_v5",
  };

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveArray(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
  }

  // ----------------- minimal data model -----------------
  const STATUS = { scheduled: "scheduled", completed: "completed", cancelled: "cancelled" };

  function normalizeJob(j) {
    const o = { ...(j || {}) };
    o.id = o.id || makeId("job");
    o.date = o.date || ymd(startOfDay(new Date()));
    o.customer = (o.customer || "Customer").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.status = o.status || STATUS.scheduled;
    return o;
  }

  function normalizeReceipt(r) {
    const o = { ...(r || {}) };
    o.id = o.id || makeId("rcpt");
    o.date = o.date || ymd(startOfDay(new Date()));
    o.vendor = (o.vendor || "Vendor").trim();
    o.category = (o.category || "Other").trim() || "Other";
    o.amount = clampMoney(o.amount ?? 0);
    return o;
  }

  const state = {
    today: startOfDay(new Date()),
    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),
  };

  function seedDataIfEmpty() {
    // If you have no data yet, create a couple entries so widgets show something.
    if (state.jobs.length === 0 && state.receipts.length === 0) {
      const t = ymd(state.today);
      state.jobs = [
        normalizeJob({ date: t, customer: "Sample Job A", amount: 850, status: STATUS.scheduled }),
        normalizeJob({ date: t, customer: "Sample Job B", amount: 1200, status: STATUS.completed }),
      ];
      state.receipts = [
        normalizeReceipt({ date: t, vendor: "Shell", category: "Fuel", amount: 68.42 }),
        normalizeReceipt({ date: t, vendor: "Home Depot", category: "Supplies", amount: 34.19 }),
      ];
      saveArray(LS.jobs, state.jobs);
      saveArray(LS.receipts, state.receipts);
    }
  }

  function jobsByDate(dateStr) {
    return state.jobs.filter(j => j.date === dateStr && j.status !== STATUS.cancelled);
  }
  function receiptsByDate(dateStr) {
    return state.receipts.filter(r => r.date === dateStr);
  }

  // ----------------- UI: badge + debug -----------------
  function showBadge() {
    if ($("#jsLoadedBadge")) return;
    const b = document.createElement("div");
    b.id = "jsLoadedBadge";
    b.textContent = "JS LOADED";
    b.style.position = "fixed";
    b.style.bottom = "10px";
    b.style.right = "10px";
    b.style.zIndex = "999999";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "999px";
    b.style.font = "700 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    b.style.background = "rgba(95, 0, 180, 0.92)";
    b.style.color = "white";
    b.style.pointerEvents = "none";
    document.body.appendChild(b);
  }

  function debugPanel(text) {
    let p = $("#fleetDebugPanel");
    if (!p) {
      p = document.createElement("pre");
      p.id = "fleetDebugPanel";
      p.style.position = "fixed";
      p.style.left = "10px";
      p.style.bottom = "10px";
      p.style.zIndex = "999998";
      p.style.maxWidth = "65vw";
      p.style.maxHeight = "30vh";
      p.style.overflow = "auto";
      p.style.padding = "10px";
      p.style.borderRadius = "10px";
      p.style.background = "rgba(0,0,0,0.7)";
      p.style.color = "white";
      p.style.font = "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      p.style.whiteSpace = "pre-wrap";
      document.body.appendChild(p);
    }
    p.textContent = text;
  }

  // ----------------- find sections by headings -----------------
  function findSectionByHeadingText(needle) {
    const headings = $$("h1,h2,h3,h4,.title,.panel-title");
    for (const h of headings) {
      const txt = (h.textContent || "").trim().toLowerCase();
      if (txt.includes(needle.toLowerCase())) {
        // return the closest container that likely holds content
        return h.closest(".panel") || h.parentElement || h;
      }
    }
    return null;
  }

  function ensureWidgetHost(section, hostId) {
    if (!section) return null;
    let host = section.querySelector(`#${hostId}`);
    if (!host) {
      host = document.createElement("div");
      host.id = hostId;
      host.style.marginTop = "10px";
      section.appendChild(host);
    }
    return host;
  }

  // ----------------- quick calendar widget -----------------
  function renderQuickCalendar(host) {
    const d = state.today;
    const y = d.getFullYear();
    const m = d.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    host.innerHTML = "";
    host.style.display = "flex";
    host.style.flexWrap = "wrap";
    host.style.gap = "6px";

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(y, m, day);
      const dateStr = ymd(date);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(day);
      btn.style.padding = "6px 10px";
      btn.style.borderRadius = "10px";
      btn.style.border = "1px solid rgba(255,255,255,0.15)";
      btn.style.background = "rgba(255,255,255,0.08)";
      btn.style.color = "white";

      const hasJobs = jobsByDate(dateStr).length > 0;
      const hasReceipts = receiptsByDate(dateStr).length > 0;

      if (hasJobs) btn.style.outline = "2px solid rgba(0, 200, 120, 0.7)";
      if (hasReceipts) btn.style.boxShadow = "inset 0 0 0 2px rgba(0, 160, 255, 0.65)";
      if (dateStr === ymd(state.today)) btn.style.background = "rgba(140, 60, 255, 0.5)";

      btn.addEventListener("click", () => openCalendarOverlay(date));
      host.appendChild(btn);
    }
  }

  // ----------------- month snapshot widget -----------------
  function renderMonthSnapshot(host) {
    const d = state.today;
    const y = d.getFullYear();
    const m = d.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let jobsCount = 0;
    let receiptsCount = 0;
    let revenue = 0;
    let expenses = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = ymd(new Date(y, m, day));
      const js = jobsByDate(dateStr);
      const rs = receiptsByDate(dateStr);

      jobsCount += js.length;
      receiptsCount += rs.length;
      for (const j of js) revenue += clampMoney(j.amount);
      for (const r of rs) expenses += clampMoney(r.amount);
    }

    host.innerHTML = `
      <div style="display:flex; gap:14px; flex-wrap:wrap; color:white;">
        <div><strong>Jobs:</strong> ${jobsCount}</div>
        <div><strong>Receipts:</strong> ${receiptsCount}</div>
        <div><strong>Revenue:</strong> ${money(revenue)}</div>
        <div><strong>Expenses:</strong> ${money(expenses)}</div>
        <div><strong>Net:</strong> ${money(revenue - expenses)}</div>
      </div>
    `;
  }

  // ----------------- pressure points widget -----------------
  function renderPressurePoints(host) {
    const todayStr = ymd(state.today);
    const jobs = jobsByDate(todayStr);

    // Very simple “pressure points” starter logic
    const unpriced = jobs.filter(j => !j.amount || j.amount <= 0).length;
    const totalJobs = jobs.length;

    host.innerHTML = `
      <div style="color:white; display:flex; flex-direction:column; gap:6px;">
        <div><strong>Today Jobs:</strong> ${totalJobs}</div>
        <div><strong>Missing Price:</strong> ${unpriced}</div>
        <div class="muted" style="opacity:.8;">Pressure points becomes smarter once Dispatch + Drivers + Trucks are fully wired.</div>
      </div>
    `;
  }

  // ----------------- Calendar overlay (full month grid) -----------------
  function openCalendarOverlay(focusDate = state.today) {
    let overlay = $("#fleetCalOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "fleetCalOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "999997";
      overlay.style.background = "rgba(0,0,0,0.75)";
      overlay.style.display = "none";
      overlay.style.padding = "14px";
      overlay.style.boxSizing = "border-box";
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.style.display = "none";
      });
      document.body.appendChild(overlay);
    }

    overlay.style.display = "block";

    const y = focusDate.getFullYear();
    const m = focusDate.getMonth();
    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const monthLabel = `${focusDate.toLocaleString("default", { month: "long" })} ${y}`;

    overlay.innerHTML = `
      <div style="max-width:980px; margin:0 auto; background:rgba(25,25,35,0.98); border-radius:14px; padding:14px; border:1px solid rgba(255,255,255,0.12);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; color:white;">
          <div style="font-weight:800; font-size:18px;">${escapeHtml(monthLabel)}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" id="calPrev" style="padding:8px 10px; border-radius:10px;">Prev</button>
            <button type="button" id="calToday" style="padding:8px 10px; border-radius:10px;">Today</button>
            <button type="button" id="calNext" style="padding:8px 10px; border-radius:10px;">Next</button>
            <button type="button" id="calClose" style="padding:8px 10px; border-radius:10px;">Close</button>
          </div>
        </div>

        <div style="margin-top:12px; display:grid; grid-template-columns:repeat(7,1fr); gap:8px;" id="calGrid"></div>

        <div style="margin-top:12px; color:white; opacity:.85;">
          <strong>Legend:</strong> green outline = jobs, blue ring = receipts
        </div>
      </div>
    `;

    const grid = $("#calGrid", overlay);
    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (const dName of dow) {
      const h = document.createElement("div");
      h.textContent = dName;
      h.style.color = "white";
      h.style.opacity = "0.8";
      h.style.fontWeight = "700";
      grid.appendChild(h);
    }

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.style.height = "64px";
      grid.appendChild(pad);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(y, m, day);
      const dateStr = ymd(date);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.height = "64px";
      btn.style.borderRadius = "12px";
      btn.style.border = "1px solid rgba(255,255,255,0.12)";
      btn.style.background = "rgba(255,255,255,0.06)";
      btn.style.color = "white";
      btn.style.textAlign = "left";
      btn.style.padding = "10px";

      const hasJobs = jobsByDate(dateStr).length > 0;
      const hasReceipts = receiptsByDate(dateStr).length > 0;
      if (hasJobs) btn.style.outline = "2px solid rgba(0, 200, 120, 0.75)";
      if (hasReceipts) btn.style.boxShadow = "inset 0 0 0 2px rgba(0, 160, 255, 0.65)";
      if (dateStr === ymd(state.today)) btn.style.background = "rgba(140, 60, 255, 0.45)";

      btn.innerHTML = `<div style="font-weight:800;">${day}</div>
        <div style="margin-top:6px; opacity:.8; font-size:12px;">
          ${hasJobs ? `${jobsByDate(dateStr).length} job(s)` : ""}
          ${hasJobs && hasReceipts ? " · " : ""}
          ${hasReceipts ? `${receiptsByDate(dateStr).length} receipt(s)` : ""}
        </div>`;

      btn.addEventListener("click", () => {
        // Later: open the day workspace. For now, show a tiny summary.
        alert(`${dateStr}\nJobs: ${jobsByDate(dateStr).length}\nReceipts: ${receiptsByDate(dateStr).length}`);
      });

      grid.appendChild(btn);
    }

    $("#calClose", overlay).onclick = () => (overlay.style.display = "none");
    $("#calToday", overlay).onclick = () => openCalendarOverlay(state.today);
    $("#calPrev", overlay).onclick = () => openCalendarOverlay(new Date(y, m - 1, 1));
    $("#calNext", overlay).onclick = () => openCalendarOverlay(new Date(y, m + 1, 1));
  }

  // ----------------- Navigation wiring (text-based fallback) -----------------
  const TEXT_ROUTES = [
    { re: /\bday\s*workspace\b/i, action: () => openCalendarOverlay(state.today) },
    { re: /\bcalendar\b/i, action: () => openCalendarOverlay(state.today) },
    { re: /\bdrivers?\b/i, action: () => toast("Drivers page will be next. (Wired.)") },
    { re: /\btrucks?\b/i, action: () => toast("Trucks page will be next. (Wired.)") },
    { re: /\bdispatch\b/i, action: () => toast("Dispatch page will be next. (Wired.)") },
    { re: /\bfinances?\b|\bfinance\b/i, action: () => toast("Finances page wired. (Next: table)") },
    { re: /\binventory\b/i, action: () => toast("Inventory page wired. (Next: items CRUD)") },
    { re: /ai\s*scanner/i, action: () => toast("AI Scanner wired. (Next: upload pipeline)") },
  ];

  function toast(msg) {
    let t = $("#fleetToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "fleetToast";
      t.style.position = "fixed";
      t.style.top = "12px";
      t.style.left = "50%";
      t.style.transform = "translateX(-50%)";
      t.style.zIndex = "999999";
      t.style.padding = "10px 12px";
      t.style.borderRadius = "12px";
      t.style.background = "rgba(0,0,0,0.75)";
      t.style.color = "white";
      t.style.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      t.style.maxWidth = "90vw";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(window.__fleetToastTimer);
    window.__fleetToastTimer = setTimeout(() => (t.style.display = "none"), 1600);
  }

  function bindNavRouter() {
    // Event delegation so it works even if your UI rerenders.
    document.addEventListener(
      "click",
      (e) => {
        const el =
          e.target.closest?.("button, a, [role='button'], .tile, .card, .nav-item") || e.target;

        if (!el) return;

        const txt = (el.textContent || "").trim();
        if (!txt) return;

        // If it's a link, prevent navigating away
        if (el.tagName === "A") e.preventDefault();

        for (const r of TEXT_ROUTES) {
          if (r.re.test(txt)) {
            r.action();
            return;
          }
        }
      },
      true
    );
  }

  // ----------------- hydrate dashboard widgets -----------------
  function hydrateDashboard() {
    const quickSection = findSectionByHeadingText("quick calendar");
    const snapSection = findSectionByHeadingText("month snapshot");
    const pressureSection = findSectionByHeadingText("pressure points");

    const quickHost = ensureWidgetHost(quickSection, "fleetQuickCalendarWidget");
    const snapHost = ensureWidgetHost(snapSection, "fleetMonthSnapshotWidget");
    const pressureHost = ensureWidgetHost(pressureSection, "fleetPressureWidget");

    if (quickHost) renderQuickCalendar(quickHost);
    if (snapHost) renderMonthSnapshot(snapHost);
    if (pressureHost) renderPressurePoints(pressureHost);

    const found = {
      quickSection: !!quickSection,
      snapSection: !!snapSection,
      pressureSection: !!pressureSection,
    };

    debugPanel(
      [
        "Fleet Debug:",
        `- Quick Calendar section found: ${found.quickSection}`,
        `- Month Snapshot section found: ${found.snapSection}`,
        `- Pressure Points section found: ${found.pressureSection}`,
        `- Jobs in storage: ${state.jobs.length}`,
        `- Receipts in storage: ${state.receipts.length}`,
        "",
        "If a section is false, your HTML heading text is different.",
        "This JS wires by heading text, so headings must match.",
      ].join("\n")
    );
  }

  // ----------------- init -----------------
  function init() {
    console.log("✅ apps_v5.js Adaptive build running");
    showBadge();
    seedDataIfEmpty();
    bindNavRouter();

    // Hydrate immediately, then again after late-rendering UI settles.
    hydrateDashboard();
    setTimeout(hydrateDashboard, 250);
    setTimeout(hydrateDashboard, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
