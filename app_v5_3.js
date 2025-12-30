/* =========================================================
   Move-Master.OS — app_v5_3.js (FULL SMART + SHEETS VIEW)
   Compatible with your HTML + styles.css baseline

   Features:
   - Single file, no half-code, no duplicates
   - LocalStorage persistence (migrates from v5_1/v5_2)
   - Calendar + Day Workspace (Jobs + Receipts)
   - Drivers roster + Driver Ledger (week/month rollups + export)
   - Trucks roster
   - Dispatch table: assign driver+truck+notes per job per day (+ export)
   - Finance snapshot
   - Sheets view: Export/Import CSV (Jobs/Receipts/Dispatch/Driver Ledger)
   - Receipt modal supports optional Driver + Photo (your HTML includes these)
   ========================================================= */

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function setPill(text, ok) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove("ok", "bad");
    pill.classList.add(ok ? "ok" : "bad");
  }

  function safe(fn) {
    try { fn(); }
    catch (e) {
      console.error("[Move-Master.OS]", e);
      setPill("JS: error ❌", false);
      alert("JS crashed. Open console for details.");
    }
  }

  function downloadTextFile(filename, text, mime = "text/plain") {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  // CSV helpers
  function toCSV(rows) {
    const esc = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };
    return rows.map(r => r.map(esc).join(",")).join("\n");
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQ) {
        if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
        if (ch === '"') { inQ = false; continue; }
        cur += ch;
      } else {
        if (ch === '"') { inQ = true; continue; }
        if (ch === ",") { row.push(cur); cur = ""; continue; }
        if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
        if (ch === "\r") continue;
        cur += ch;
      }
    }
    row.push(cur);
    rows.push(row);
    return rows.filter(r => r.some(x => String(x).trim() !== ""));
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("File read failed"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------
  // Storage keys
  // ---------------------------
  const LS = {
    jobs: "mm_jobs_v5_3",
    receipts: "mm_receipts_v5_3",
    drivers: "mm_drivers_v5_3",
    trucks: "mm_trucks_v5_3",
    dispatch: "mm_dispatch_v5_3",
    finance: "mm_finance_v5_3",
    inventory: "mm_inventory_v5_3",
    scans: "mm_scans_v5_3",
  };

  // Prior versions (for migration)
  const LS_OLD = [
    { jobs:"mm_jobs_v5_2", receipts:"mm_receipts_v5_2", drivers:"mm_drivers_v5_2", trucks:"mm_trucks_v5_2", dispatch:"mm_dispatch_v5_2", inventory:"mm_inventory_v5_2", scans:"mm_scans_v5_2" },
    { jobs:"mm_jobs_v5_1", receipts:"mm_receipts_v5_1", drivers:"mm_drivers_v5_1", trucks:"mm_trucks_v5_1", dispatch:"mm_dispatch_v5_1", inventory:"mm_inventory_v5_1", scans:"mm_scans_v5_1" },
  ];

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

  function loadObj(key) {
    try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; }
    catch { return {}; }
  }
  function saveObj(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch {}
  }

  function migrateIfNeeded() {
    const hasNew = localStorage.getItem(LS.jobs);
    if (hasNew) return;

    for (const old of LS_OLD) {
      const hasOld = localStorage.getItem(old.jobs);
      if (!hasOld) continue;

      localStorage.setItem(LS.jobs, localStorage.getItem(old.jobs));
      localStorage.setItem(LS.receipts, localStorage.getItem(old.receipts) || "[]");
      localStorage.setItem(LS.drivers, localStorage.getItem(old.drivers) || "[]");
      localStorage.setItem(LS.trucks, localStorage.getItem(old.trucks) || "[]");
      localStorage.setItem(LS.dispatch, localStorage.getItem(old.dispatch) || "{}");
      localStorage.setItem(LS.inventory, localStorage.getItem(old.inventory) || "[]");
      localStorage.setItem(LS.scans, localStorage.getItem(old.scans) || "[]");
      break;
    }
  }

  // ---------------------------
  // Domain normalize
  // ---------------------------
  const STATUS = { scheduled:"scheduled", completed:"completed", cancelled:"cancelled" };

  function normalizeJob(j) {
    const o = { ...(j || {}) };
    if (!o.id) o.id = makeId("job");
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    if (!o.status || !STATUS[o.status]) o.status = STATUS.scheduled;
    o.customer = (o.customer || "").trim();
    o.pickup = (o.pickup || "").trim();
    o.dropoff = (o.dropoff || "").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeReceipt(r) {
    const o = { ...(r || {}) };
    if (!o.id) o.id = makeId("rcpt");
    if (!o.date) o.date = ymd(startOfDay(new Date()));
    o.vendor = (o.vendor || "").trim();
    o.category = (o.category || "").trim();
    o.amount = clampMoney(o.amount ?? 0);
    o.linkedJobId = (o.linkedJobId || "").trim();
    o.notes = (o.notes || "").trim();
    o.driverId = (o.driverId || "").trim();
    o.photoDataUrl = (o.photoDataUrl || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeNamedRow(x, prefix) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId(prefix);
    o.name = (o.name || "").trim();
    o.notes = (o.notes || "").trim();
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeInventoryItem(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("inv");
    o.name = (o.name || "").trim();
    o.category = (o.category || "Other").trim();
    o.cuft = Number(o.cuft ?? 0);
    if (!Number.isFinite(o.cuft)) o.cuft = 0;
    o.cuft = Math.round(o.cuft * 10) / 10;
    o.createdAt = o.createdAt || Date.now();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function normalizeScan(x) {
    const o = { ...(x || {}) };
    if (!o.id) o.id = makeId("scan");
    o.type = (o.type || "unknown").trim();
    o.source = (o.source || "manual").trim();
    o.text = (o.text || "").trim();
    o.result = o.result || {};
    o.createdAt = o.createdAt || Date.now();
    return o;
  }

  // Dispatch state: { "YYYY-MM-DD": { "jobId": { driverId, truckId, notes, updatedAt } } }
  function normalizeDispatchState(x) {
    const obj = (x && typeof x === "object") ? x : {};
    return obj;
  }

  function groupReceiptsByWeek(receipts) {
    const by = {};
    for (const r of receipts) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;

      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);

      const key = `${tmp.getUTCFullYear()}-W${pad2(weekNo)}`;
      by[key] = by[key] || { count: 0, total: 0 };
      by[key].count += 1;
      by[key].total += clampMoney(r.amount);
    }
    for (const k of Object.keys(by)) by[k].total = clampMoney(by[k].total);
    return by;
  }

  // ---------------------------
  // State
  // ---------------------------
  migrateIfNeeded();

  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),

    drivers: loadArray(LS.drivers).map((x) => normalizeNamedRow(x, "drv")),
    trucks: loadArray(LS.trucks).map((x) => normalizeNamedRow(x, "trk")),

    dispatch: normalizeDispatchState(loadObj(LS.dispatch)),

    finance: loadArray(LS.finance),
    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans).map(normalizeScan),

    editingJobId: null,
    editingReceiptId: null,

    selectedDriverId: "",
  };

  function persist() {
    saveArray(LS.jobs, state.jobs);
    saveArray(LS.receipts, state.receipts);
    saveArray(LS.drivers, state.drivers);
    saveArray(LS.trucks, state.trucks);
    saveObj(LS.dispatch, state.dispatch);
    saveArray(LS.finance, state.finance);
    saveArray(LS.inventory, state.inventory);
    saveArray(LS.scans, state.scans);
  }

  // ---------------------------
  // Router
  // ---------------------------
  function setView(name) {
    state.view = name;

    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));

    renderAll();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) { return state.jobs.filter(j => j.date === dateStr); }
  function receiptsByDate(dateStr) { return state.receipts.filter(r => r.date === dateStr); }

  function sumRevenue(dateStr) {
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumExpenses(dateStr) {
    let total = 0;
    for (const r of receiptsByDate(dateStr)) total += clampMoney(r.amount);
    return clampMoney(total);
  }

  function monthTotals(year, monthIndex) {
    let revenue = 0, expenses = 0;

    for (const j of state.jobs) {
      const d = new Date(j.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      if (j.status === STATUS.cancelled) continue;
      revenue += clampMoney(j.amount);
    }

    for (const r of state.receipts) {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) continue;
      expenses += clampMoney(r.amount);
    }

    revenue = clampMoney(revenue);
    expenses = clampMoney(expenses);
    return { revenue, expenses, net: clampMoney(revenue - expenses) };
  }

  // ---------------------------
  // Dashboard
  // ---------------------------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);
    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `${todayStr}`;

    const todayStats = $("#todayStats");
    if (todayStats) {
      const rev = sumRevenue(todayStr);
      const exp = sumExpenses(todayStr);
      const net = clampMoney(rev - exp);
      todayStats.innerHTML = `
        <div>Jobs: <strong>${jobsByDate(todayStr).length}</strong></div>
        <div>Receipts: <strong>${receiptsByDate(todayStr).length}</strong></div>
        <div style="margin-top:6px;">Revenue: <strong>${money(rev)}</strong></div>
        <div>Expenses: <strong>${money(exp)}</strong></div>
        <div>Net: <strong>${money(net)}</strong></div>
      `;
    }

    const ms = $("#monthSnapshot");
    if (ms) {
      const y = state.monthCursor.getFullYear();
      const m = state.monthCursor.getMonth();
      const t = monthTotals(y, m);
      ms.innerHTML = `
        <div><strong>${MONTHS[m]} ${y}</strong></div>
        <div style="margin-top:6px;">Revenue: <strong>${money(t.revenue)}</strong></div>
        <div>Expenses: <strong>${money(t.expenses)}</strong></div>
        <div>Net: <strong>${money(t.net)}</strong></div>
      `;
    }

    const quick = $("#dashboardCalendar");
    if (quick) renderQuickCalendar(quick);
  }

  function renderQuickCalendar(container) {
    const y = state.currentDate.getFullYear();
    const m = state.currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    container.innerHTML = "";
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (sameDay(d, state.currentDate)) btn.classList.add("active");
      if (jobsByDate(dateStr).length) btn.classList.add("has-jobs");
      if (receiptsByDate(dateStr).length) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      container.appendChild(btn);
    }
  }

  // ---------------------------
  // Calendar
  // ---------------------------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    label.textContent = `${MONTHS[m]} ${y}`;
    grid.innerHTML = "";

    for (const d of DOW) {
      const h = document.createElement("div");
      h.className = "dow";
      h.textContent = d;
      grid.appendChild(h);
    }

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

    const today = startOfDay(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (sameDay(d, today)) cell.classList.add("today");
      if (sameDay(d, state.currentDate)) cell.classList.add("selected");

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(day);

      const marker = document.createElement("div");
      marker.className = "markerbar";

      const jobs = jobsByDate(dateStr);
      const receipts = receiptsByDate(dateStr);

      const scheduled = jobs.filter(j => j.status === STATUS.scheduled).length;
      const completed = jobs.filter(j => j.status === STATUS.completed).length;
      const cancelled = jobs.filter(j => j.status === STATUS.cancelled).length;

      if (scheduled) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `S:${scheduled}`;
        marker.appendChild(chip);
        cell.classList.add("has-scheduled");
      }
      if (completed) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `C:${completed}`;
        marker.appendChild(chip);
        cell.classList.add("has-completed");
      }
      if (cancelled) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `X:${cancelled}`;
        marker.appendChild(chip);
        cell.classList.add("has-cancelled");
      }
      if (receipts.length) {
        const chip = document.createElement("span");
        chip.className = "chip chip-receipts";
        chip.textContent = `🧾 ${receipts.length}`;
        marker.appendChild(chip);
        cell.classList.add("has-receipts");
      }

      cell.appendChild(num);
      cell.appendChild(marker);

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ---------------------------
  // Day workspace
  // ---------------------------
  function renderDay() {
    const dateStr = ymd(state.currentDate);
    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace — ${dateStr}`;
    renderDayJobs(dateStr);
    renderDayReceipts(dateStr);
  }

  function renderDayJobs(dateStr) {
    const host = $("#dayJobsList");
    if (!host) return;

    const jobs = jobsByDate(dateStr).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const rev = sumRevenue(dateStr);
    const exp = sumExpenses(dateStr);
    const net = clampMoney(rev - exp);

    host.innerHTML = `
      <div class="day-totals">
        <div><strong>Totals</strong></div>
        <div>Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}</div>
      </div>
    `;

    if (!jobs.length) {
      host.innerHTML += `<div class="muted empty">No jobs for this day yet.</div>`;
      return;
    }

    for (const job of jobs) {
      const row = document.createElement("div");
      row.className = "job-row";
      if (job.status === STATUS.completed) row.classList.add("is-completed");
      if (job.status === STATUS.cancelled) row.classList.add("is-cancelled");

      row.innerHTML = `
        <div class="job-main">
          <div class="job-title">${escapeHtml(job.customer || "Customer")}</div>
          <div class="job-sub">${escapeHtml(job.pickup || "Pickup")} → ${escapeHtml(job.dropoff || "Dropoff")} · ${money(job.amount)}</div>
        </div>
        <div class="job-actions">
          <select class="job-status" data-job-status="${escapeHtml(job.id)}">
            <option value="scheduled" ${job.status === STATUS.scheduled ? "selected" : ""}>Scheduled</option>
            <option value="completed" ${job.status === STATUS.completed ? "selected" : ""}>Completed</option>
            <option value="cancelled" ${job.status === STATUS.cancelled ? "selected" : ""}>Cancelled</option>
          </select>
          <button class="btn" type="button" data-job-edit="${escapeHtml(job.id)}">Edit</button>
          <button class="btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
        </div>
      `;
      host.appendChild(row);
    }

    $$("[data-job-status]", host).forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-job-status");
        const job = state.jobs.find(j => j.id === id);
        if (!job) return;
        job.status = sel.value;
        job.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-job-edit]", host).forEach((btn) =>
      btn.addEventListener("click", () => openJobModal(btn.getAttribute("data-job-edit")))
    );

    $$("[data-job-del]", host).forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;

        state.jobs = state.jobs.filter(j => j.id !== id);
        state.receipts = state.receipts.map(r =>
          (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r)
        );

        for (const dateISO of Object.keys(state.dispatch || {})) {
          if (state.dispatch[dateISO] && state.dispatch[dateISO][id]) delete state.dispatch[dateISO][id];
        }

        persist();
        renderAll();
      })
    );
  }

  function renderDayReceipts(dateStr) {
    const host = $("#dayReceiptsList");
    if (!host) return;

    const receipts = receiptsByDate(dateStr).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const total = sumExpenses(dateStr);

    host.innerHTML = `
      <div class="day-totals">
        <div><strong>Receipts</strong></div>
        <div>Total Expenses: ${money(total)}</div>
      </div>
    `;

    if (!receipts.length) {
      host.innerHTML += `<div class="muted empty">No receipts for this day yet.</div>`;
      return;
    }

    for (const r of receipts) {
      const drv = (r.driverId ? (state.drivers.find(d => d.id === r.driverId)?.name || "") : "");
      const drvTag = drv ? ` · <span class="muted">${escapeHtml(drv)}</span>` : "";

      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Category")}${drvTag}</div>
          <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
        </div>
        <div class="receipt-actions">
          <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
          <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
        </div>
      `;
      host.appendChild(row);
    }

    $$("[data-rcpt-edit]", host).forEach((btn) =>
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")))
    );

    $$("[data-rcpt-del]", host).forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== id);
        persist();
        renderAll();
      })
    );
  }

  // ---------------------------
  // Export/Import (Sheets)
  // ---------------------------
  function exportJobsCSV() {
    const header = ["id","date","customer","pickup","dropoff","amount","status","notes","createdAt","updatedAt"];
    const rows = [header];
    for (const j of state.jobs) {
      rows.push([
        j.id, j.date, j.customer, j.pickup, j.dropoff,
        String(clampMoney(j.amount)), j.status, j.notes,
        String(j.createdAt || ""), String(j.updatedAt || "")
      ]);
    }
    downloadTextFile(`MoveMasters_Jobs_${ymd(new Date())}.csv`, toCSV(rows), "text/csv");
  }

  function exportReceiptsCSV() {
    const header = ["id","date","vendor","category","amount","linkedJobId","driverId","notes","photoDataUrl","createdAt","updatedAt"];
    const rows = [header];
    for (const r of state.receipts) {
      rows.push([
        r.id, r.date, r.vendor, r.category,
        String(clampMoney(r.amount)),
        r.linkedJobId || "",
        r.driverId || "",
        r.notes || "",
        r.photoDataUrl || "",
        String(r.createdAt || ""), String(r.updatedAt || "")
      ]);
    }
    downloadTextFile(`MoveMasters_Receipts_${ymd(new Date())}.csv`, toCSV(rows), "text/csv");
  }

  function exportDispatchCSV() {
    const header = ["date","jobId","customer","driverId","driverName","truckId","truckName","notes","updatedAt"];
    const rows = [header];

    const drvMap = Object.fromEntries((state.drivers || []).map(d => [d.id, d.name || ""]));
    const trkMap = Object.fromEntries((state.trucks || []).map(t => [t.id, t.name || ""]));
    const jobMap = Object.fromEntries((state.jobs || []).map(j => [j.id, j]));

    for (const dateISO of Object.keys(state.dispatch || {}).sort()) {
      const bucket = state.dispatch[dateISO] || {};
      for (const jobId of Object.keys(bucket)) {
        const a = bucket[jobId] || {};
        const job = jobMap[jobId] || {};
        rows.push([
          dateISO,
          jobId,
          job.customer || "",
          a.driverId || "",
          drvMap[a.driverId] || "",
          a.truckId || "",
          trkMap[a.truckId] || "",
          a.notes || "",
          String(a.updatedAt || "")
        ]);
      }
    }

    downloadTextFile(`MoveMasters_Dispatch_${ymd(new Date())}.csv`, toCSV(rows), "text/csv");
  }

  function exportDriverLedgerCSV(driverId) {
    const driver = (state.drivers || []).find(d => d.id === driverId);
    if (!driver) return alert("Select a driver first.");

    const receipts = state.receipts
      .filter(r => (r.driverId || "") === driverId)
      .slice()
      .sort((a,b) => (a.date || "").localeCompare(b.date || ""));

    const byWeek = groupReceiptsByWeek(receipts);

    const rows = [];
    rows.push(["Driver", driver.name || "Driver"]);
    rows.push([]);
    rows.push(["Weekly Summary"]);
    rows.push(["weekKey","receiptCount","total"]);
    for (const wk of Object.keys(byWeek).sort()) {
      rows.push([wk, String(byWeek[wk].count), String(byWeek[wk].total)]);
    }
    rows.push([]);
    rows.push(["Receipts"]);
    rows.push(["id","date","vendor","category","amount","notes"]);
    for (const r of receipts) {
      rows.push([r.id, r.date, r.vendor, r.category, String(r.amount), r.notes || ""]);
    }

    downloadTextFile(`MoveMasters_DriverLedger_${(driver.name || driverId).replaceAll(" ", "_")}_${ymd(new Date())}.csv`, toCSV(rows), "text/csv");
  }

  function importJobsCSVFromFile(file) {
    return file.text().then((text) => {
      const parsed = parseCSV(text);
      if (!parsed.length) return alert("CSV looks empty.");

      const header = parsed[0].map(h => String(h || "").trim());
      const idx = (name) => header.indexOf(name);

      if (idx("date") === -1 || idx("customer") === -1) {
        return alert("Jobs CSV needs at least columns: date, customer");
      }

      const next = [];
      for (let i = 1; i < parsed.length; i++) {
        const row = parsed[i];
        const j = normalizeJob({
          id: row[idx("id")] || makeId("job"),
          date: row[idx("date")] || ymd(new Date()),
          customer: row[idx("customer")] || "",
          pickup: row[idx("pickup")] || "",
          dropoff: row[idx("dropoff")] || "",
          amount: clampMoney(row[idx("amount")] || 0),
          status: row[idx("status")] || "scheduled",
          notes: row[idx("notes")] || "",
          createdAt: Number(row[idx("createdAt")] || Date.now()),
          updatedAt: Number(row[idx("updatedAt")] || Date.now()),
        });
        next.push(j);
      }

      state.jobs = next;
      persist();
      renderAll();
      alert("Jobs imported.");
    });
  }

  function importReceiptsCSVFromFile(file) {
    return file.text().then((text) => {
      const parsed = parseCSV(text);
      if (!parsed.length) return alert("CSV looks empty.");

      const header = parsed[0].map(h => String(h || "").trim());
      const idx = (name) => header.indexOf(name);

      if (idx("date") === -1 || idx("vendor") === -1 || idx("amount") === -1) {
        return alert("Receipts CSV needs at least columns: date, vendor, amount");
      }

      const next = [];
      for (let i = 1; i < parsed.length; i++) {
        const row = parsed[i];
        const r = normalizeReceipt({
          id: row[idx("id")] || makeId("rcpt"),
          date: row[idx("date")] || ymd(new Date()),
          vendor: row[idx("vendor")] || "",
          category: row[idx("category")] || "",
          amount: clampMoney(row[idx("amount")] || 0),
          linkedJobId: row[idx("linkedJobId")] || "",
          driverId: row[idx("driverId")] || "",
          notes: row[idx("notes")] || "",
          photoDataUrl: row[idx("photoDataUrl")] || "",
          createdAt: Number(row[idx("createdAt")] || Date.now()),
          updatedAt: Number(row[idx("updatedAt")] || Date.now()),
        });
        next.push(r);
      }

      state.receipts = next;
      persist();
      renderAll();
      alert("Receipts imported.");
    });
  }

  // ---------------------------
  // Drivers
  // ---------------------------
  function renderDrivers() {
    const host = $("#view-drivers");
    if (!host) return;

    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const driverOptions = [`<option value="">(select driver)</option>`]
      .concat(drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`))
      .join("");

    const selected = state.selectedDriverId || "";
    const selectedDriver = drivers.find(d => d.id === selected) || null;

    let ledgerHtml = `<div class="muted">Select a driver to see ledger.</div>`;
    if (selectedDriver) {
      const receipts = state.receipts
        .filter(r => (r.driverId || "") === selectedDriver.id)
        .slice()
        .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

      const monthKey = `${state.monthCursor.getFullYear()}-${pad2(state.monthCursor.getMonth()+1)}`;
      const monthReceipts = receipts.filter(r => String(r.date || "").startsWith(monthKey));
      const monthTotal = clampMoney(monthReceipts.reduce((acc, r) => acc + clampMoney(r.amount), 0));
      const weekTotals = groupReceiptsByWeek(receipts);

      ledgerHtml = `
        <div class="day-totals">
          <div><strong>Driver Ledger:</strong> ${escapeHtml(selectedDriver.name || "Driver")}</div>
          <div class="muted" style="margin-top:6px;">
            This month (${monthKey}): <strong>${money(monthTotal)}</strong> · Receipts: <strong>${monthReceipts.length}</strong>
          </div>
          <div class="muted" style="margin-top:6px;">
            Weekly rollups (latest 6):
            ${
              Object.keys(weekTotals).sort().slice(-6).map(k =>
                `<div>${escapeHtml(k)}: ${money(weekTotals[k].total)} (${weekTotals[k].count})</div>`
              ).join("") || "<div>(none)</div>"
            }
          </div>
          <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" type="button" id="exportDriverLedger">Export Driver Ledger CSV</button>
          </div>
        </div>

        <div class="muted" style="font-weight:800; margin:10px 0 6px;">Driver Receipts (latest)</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            receipts.slice(0, 20).map(r => `
              <div class="receipt-row">
                <div class="receipt-main">
                  <div class="receipt-title">${escapeHtml(r.date)} · ${escapeHtml(r.vendor)} · ${money(r.amount)}</div>
                  <div class="receipt-sub">${escapeHtml(r.category)} · ${escapeHtml(r.notes || "")}</div>
                </div>
                <div class="receipt-actions">
                  <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
                </div>
              </div>
            `).join("") || `<div class="muted empty">No receipts yet for this driver.</div>`
          }
        </div>
      `;
    }

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Roster + driver ledger (week/month).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Driver Name</span>
            <input id="driversName" type="text" placeholder="Name" />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="driversNotes" type="text" placeholder="Phone, availability, etc." />
          </label>
          <button class="btn primary" type="button" id="driversAdd">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:320px;">
            <span>Ledger Driver</span>
            <select id="driverLedgerSelect">${driverOptions}</select>
          </label>
        </div>

        <div style="margin-top:12px;">
          ${ledgerHtml}
        </div>

        <div class="muted" style="font-weight:800; margin:14px 0 8px;">Driver Roster</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            drivers.length
              ? drivers.map(d => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(d.name || "Driver")}</div>
                    <div class="job-sub">${escapeHtml(d.notes || "")}</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-edit="${escapeHtml(d.id)}">Edit</button>
                    <button class="btn danger" type="button" data-del="${escapeHtml(d.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No drivers yet.</div>`
          }
        </div>
      </div>
    `;

    $("#driversAdd")?.addEventListener("click", () => {
      const name = ($("#driversName")?.value || "").trim();
      const notes = ($("#driversNotes")?.value || "").trim();
      if (!name) return alert("Driver name is required.");
      state.drivers.push(normalizeNamedRow({ name, notes, createdAt:Date.now(), updatedAt:Date.now() }, "drv"));
      persist();
      renderAll();
    });

    $("#driverLedgerSelect")?.addEventListener("change", (e) => {
      state.selectedDriverId = e.target.value || "";
      renderAll();
    });
    if ($("#driverLedgerSelect")) $("#driverLedgerSelect").value = selected;

    $("#exportDriverLedger")?.addEventListener("click", () => exportDriverLedgerCSV(state.selectedDriverId));

    $$("[data-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      if (!confirm("Delete this driver?")) return;

      state.drivers = state.drivers.filter(x => x.id !== id);

      for (const r of state.receipts) if (r.driverId === id) r.driverId = "";
      for (const dateISO of Object.keys(state.dispatch || {})) {
        const bucket = state.dispatch[dateISO];
        if (!bucket) continue;
        for (const jobId of Object.keys(bucket)) {
          if (bucket[jobId]?.driverId === id) bucket[jobId].driverId = "";
        }
      }

      if (state.selectedDriverId === id) state.selectedDriverId = "";
      persist();
      renderAll();
    }));

    $$("[data-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const row = state.drivers.find(x => x.id === id);
      if (!row) return;
      const name = prompt("Driver name:", row.name || "");
      if (name === null) return;
      const notes = prompt("Notes:", row.notes || "");
      if (notes === null) return;
      row.name = name.trim();
      row.notes = notes.trim();
      row.updatedAt = Date.now();
      persist();
      renderAll();
    }));

    $$("[data-rcpt-edit]", host).forEach(btn =>
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")))
    );
  }

  // ---------------------------
  // Trucks
  // ---------------------------
  function renderTrucks() {
    const host = $("#view-trucks");
    if (!host) return;

    const trucks = (state.trucks || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Editable roster (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Truck Name</span>
            <input id="trucksName" type="text" placeholder="Truck 1 / Sprinter / 26ft..." />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="trucksNotes" type="text" placeholder="Plate, capacity, etc." />
          </label>
          <button class="btn primary" type="button" id="trucksAdd">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            trucks.length
              ? trucks.map(t => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(t.name || "Truck")}</div>
                    <div class="job-sub">${escapeHtml(t.notes || "")}</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-edit="${escapeHtml(t.id)}">Edit</button>
                    <button class="btn danger" type="button" data-del="${escapeHtml(t.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No trucks yet.</div>`
          }
        </div>
      </div>
    `;

    $("#trucksAdd")?.addEventListener("click", () => {
      const name = ($("#trucksName")?.value || "").trim();
      const notes = ($("#trucksNotes")?.value || "").trim();
      if (!name) return alert("Truck name is required.");
      state.trucks.push(normalizeNamedRow({ name, notes, createdAt:Date.now(), updatedAt:Date.now() }, "trk"));
      persist();
      renderAll();
    });

    $$("[data-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      if (!confirm("Delete this truck?")) return;

      state.trucks = state.trucks.filter(x => x.id !== id);

      for (const dateISO of Object.keys(state.dispatch || {})) {
        const bucket = state.dispatch[dateISO];
        if (!bucket) continue;
        for (const jobId of Object.keys(bucket)) {
          if (bucket[jobId]?.truckId === id) bucket[jobId].truckId = "";
        }
      }

      persist();
      renderAll();
    }));

    $$("[data-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const row = state.trucks.find(x => x.id === id);
      if (!row) return;
      const name = prompt("Truck name:", row.name || "");
      if (name === null) return;
      const notes = prompt("Notes:", row.notes || "");
      if (notes === null) return;
      row.name = name.trim();
      row.notes = notes.trim();
      row.updatedAt = Date.now();
      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // Dispatch
  // ---------------------------
  function ensureDispatchBucket(dateISO) {
    if (!state.dispatch[dateISO]) state.dispatch[dateISO] = {};
    return state.dispatch[dateISO];
  }

  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const dateISO = ymd(state.currentDate);
    const jobs = jobsByDate(dateISO).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const trucks  = (state.trucks  || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));

    const bucket = ensureDispatchBucket(dateISO);

    const driverOptions = [`<option value="">— Driver —</option>`]
      .concat(drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`))
      .join("");

    const truckOptions = [`<option value="">— Truck —</option>`]
      .concat(trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || "Truck")}</option>`))
      .join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assign Driver + Truck per Job for <strong>${escapeHtml(dateISO)}</strong>.</div>
        </div>

        <div class="muted" style="margin-bottom:10px;">
          If Jobs are empty, go to <strong>Day Workspace</strong> and add jobs for this date first.
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
          <button class="btn primary" type="button" id="dispatchSaveAll">Save Assignments</button>
          <button class="btn danger" type="button" id="dispatchClear">Clear This Day</button>
          <button class="btn" type="button" id="dispatchExport">Export Dispatch CSV</button>
          <div class="muted" id="dispatchHint"></div>
        </div>

        <div id="dispatchTableWrap"></div>
        <div id="dispatchEmpty" class="muted empty" style="display:none;">No jobs for ${escapeHtml(dateISO)} yet.</div>
      </div>
    `;

    const wrap = $("#dispatchTableWrap", host);
    const empty = $("#dispatchEmpty", host);
    const hint = $("#dispatchHint", host);

    if (!jobs.length) {
      if (wrap) wrap.innerHTML = "";
      if (empty) empty.style.display = "block";
      if (hint) hint.textContent = "";
      return;
    }

    if (empty) empty.style.display = "none";
    if (hint) hint.textContent = `Drivers: ${drivers.length} · Trucks: ${trucks.length}`;

    const rows = jobs.map(job => {
      const assigned = bucket[job.id] || {};
      const notes = assigned.notes || "";

      return `
        <tr data-job-id="${escapeHtml(job.id)}">
          <td style="min-width:240px;">
            <div style="font-weight:600;">${escapeHtml(job.customer || "Customer")}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(job.pickup || "")} → ${escapeHtml(job.dropoff || "")}</div>
          </td>
          <td style="min-width:110px;">${money(job.amount || 0)}</td>
          <td style="min-width:180px;">
            <select class="dispatchDriver">${driverOptions}</select>
          </td>
          <td style="min-width:180px;">
            <select class="dispatchTruck">${truckOptions}</select>
          </td>
          <td style="min-width:220px;">
            <input class="dispatchNotes" type="text" placeholder="Notes (gate code, time, etc.)" value="${escapeHtml(notes)}" />
          </td>
          <td style="min-width:120px;">
            <button class="btn dispatchRowSave" type="button">Save</button>
          </td>
        </tr>
      `;
    }).join("");

    wrap.innerHTML = `
      <table class="table" style="width:100%; border-collapse:separate; border-spacing:0 10px;">
        <thead>
          <tr class="muted" style="text-align:left;">
            <th>Job</th>
            <th>Amount</th>
            <th>Driver</th>
            <th>Truck</th>
            <th>Notes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    wrap.querySelectorAll("tr[data-job-id]").forEach(tr => {
      const jobId = tr.getAttribute("data-job-id");
      const assigned = bucket[jobId] || {};
      tr.querySelector(".dispatchDriver").value = assigned.driverId || "";
      tr.querySelector(".dispatchTruck").value = assigned.truckId || "";
      tr.querySelector(".dispatchNotes").value = assigned.notes || "";
    });

    wrap.onclick = (e) => {
      const btn = e.target.closest(".dispatchRowSave");
      if (!btn) return;

      const tr = e.target.closest("tr[data-job-id]");
      if (!tr) return;

      const jobId = tr.getAttribute("data-job-id");
      const driverId = tr.querySelector(".dispatchDriver")?.value || "";
      const truckId  = tr.querySelector(".dispatchTruck")?.value || "";
      const notes    = (tr.querySelector(".dispatchNotes")?.value || "").trim();

      bucket[jobId] = { driverId, truckId, notes, updatedAt: Date.now() };
      persist();

      btn.textContent = "Saved ✓";
      setTimeout(() => (btn.textContent = "Save"), 900);
    };

    $("#dispatchSaveAll", host)?.addEventListener("click", () => {
      wrap.querySelectorAll("tr[data-job-id]").forEach(tr => {
        const jobId = tr.getAttribute("data-job-id");
        const driverId = tr.querySelector(".dispatchDriver")?.value || "";
        const truckId  = tr.querySelector(".dispatchTruck")?.value || "";
        const notes    = (tr.querySelector(".dispatchNotes")?.value || "").trim();
        bucket[jobId] = { driverId, truckId, notes, updatedAt: Date.now() };
      });
      persist();
      const b = $("#dispatchSaveAll", host);
      if (b) {
        b.textContent = "Saved ✓";
        setTimeout(() => (b.textContent = "Save Assignments"), 900);
      }
    });

    $("#dispatchClear", host)?.addEventListener("click", () => {
      if (!confirm(`Clear all assignments for ${dateISO}?`)) return;
      state.dispatch[dateISO] = {};
      persist();
      renderDispatch();
    });

    $("#dispatchExport", host)?.addEventListener("click", exportDispatchCSV);
  }

  // ---------------------------
  // Finance
  // ---------------------------
  function renderFinance() {
    const host = $("#view-finance");
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const t = monthTotals(y, m);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Finance</div>
          <div class="panel-sub">Month snapshot driven by Jobs + Receipts.</div>
        </div>

        <div class="day-totals">
          <div><strong>${MONTHS[m]} ${y}</strong></div>
          <div>Revenue: ${money(t.revenue)} · Expenses: ${money(t.expenses)} · Net: ${money(t.net)}</div>
        </div>

        <div class="muted" style="margin-top:10px;">
          Tip: For exports/imports, use the <strong>Sheets</strong> tab.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Inventory (minimal; your CSS supports it)
  // ---------------------------
  function renderInventory() {
    const host = $("#view-inventory");
    if (!host) return;

    const rows = state.inventory || [];
    const totalCuft = Math.round(rows.reduce((acc, r) => acc + (Number(r.cuft) || 0), 0) * 10) / 10;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">Track items and estimated cubic feet.</div>
        </div>

        <div class="day-totals">
          <div><strong>Total Estimated Cubic Feet:</strong> ${totalCuft.toFixed(1)} cu ft</div>
          <div class="muted">This becomes the backbone for estimates.</div>
        </div>

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>Item</span>
            <input id="invName" type="text" placeholder="Sofa, dresser, 20 boxes..." />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Category</span>
            <select id="invCat">
              <option value="Furniture">Furniture</option>
              <option value="Boxes">Boxes</option>
              <option value="Appliance">Appliance</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label class="field" style="min-width:160px;">
            <span>Est. cu ft</span>
            <input id="invCuft" type="number" step="0.1" value="0" />
          </label>

          <button class="btn primary" type="button" id="invAdd">Add Item</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.name || "Item")} <span class="muted">(${escapeHtml(r.category || "Other")})</span></div>
                    <div class="job-sub">${Number(r.cuft || 0).toFixed(1)} cu ft</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-inv-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-inv-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No inventory items yet.</div>`
          }
        </div>
      </div>
    `;

    $("#invAdd")?.addEventListener("click", () => {
      const name = ($("#invName")?.value || "").trim();
      const category = ($("#invCat")?.value || "Other").trim();
      const cuft = Number($("#invCuft")?.value ?? 0);

      if (!name) return alert("Item name is required.");
      if (!Number.isFinite(cuft) || cuft < 0) return alert("Cubic feet must be valid.");

      state.inventory.push(normalizeInventoryItem({
        name, category, cuft,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      persist();
      renderAll();
    });

    $$("[data-inv-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inv-del");
      if (!id) return;
      if (!confirm("Delete this inventory item?")) return;
      state.inventory = state.inventory.filter(x => x.id !== id);
      persist();
      renderAll();
    }));

    $$("[data-inv-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inv-edit");
      const row = state.inventory.find(x => x.id === id);
      if (!row) return;

      const name = prompt("Item:", row.name || "");
      if (name === null) return;
      const category = prompt("Category (Furniture/Boxes/Appliance/Other):", row.category || "Other");
      if (category === null) return;
      const cuft = prompt("Estimated cu ft:", String(row.cuft ?? 0));
      if (cuft === null) return;

      const cuftNum = Number(cuft);
      if (!Number.isFinite(cuftNum) || cuftNum < 0) return alert("Invalid cu ft.");

      row.name = name.trim();
      row.category = category.trim() || "Other";
      row.cuft = Math.round(cuftNum * 10) / 10;
      row.updatedAt = Date.now();

      persist();
      renderAll();
    }));
  }

  // ---------------------------
  // Scanner (simple placeholder)
  // ---------------------------
  function classifyText(text) {
    const t = (text || "").toLowerCase();
    const receiptHints = ["total", "subtotal", "tax", "visa", "mastercard", "receipt", "thank you", "balance", "change"];
    const receiptScore = receiptHints.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
    if (receiptScore >= 2) return "receipt";
    return "unknown";
  }

  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Starter: paste text. Next: OCR.</div>
        </div>

        <div class="muted">
          Scanner view is a foundation stub in this build. Next step is camera OCR + auto-fill receipt modal.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Sheets view (your nav expects this)
  // ---------------------------
  function renderSheets() {
    const host = $("#view-sheets");
    if (!host) return;

    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const driverOptions = [`<option value="">(select driver)</option>`]
      .concat(drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`))
      .join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Sheets</div>
          <div class="panel-sub">CSV export/import for Google Sheets.</div>
        </div>

        <div class="muted" style="font-weight:800; margin-bottom:8px;">Export</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="exportJobsCSV">Export Jobs CSV</button>
          <button class="btn primary" type="button" id="exportReceiptsCSV">Export Receipts CSV</button>
          <button class="btn" type="button" id="exportDispatchCSV">Export Dispatch CSV</button>
        </div>

        <div class="muted" style="font-weight:800; margin-top:16px;">Driver Ledger Export</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-top:8px;">
          <label class="field" style="min-width:320px;">
            <span>Pick Driver</span>
            <select id="sheetsDriver">${driverOptions}</select>
          </label>
          <button class="btn primary" type="button" id="exportDriverLedger">Export Driver Ledger CSV</button>
        </div>

        <div class="muted" style="font-weight:800; margin-top:16px;">Import</div>
        <div class="muted">Upload a CSV you previously exported (Jobs or Receipts).</div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-top:10px;">
          <label class="field" style="min-width:320px;">
            <span>Import Jobs CSV</span>
            <input id="importJobsFile" type="file" accept=".csv,text/csv" />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Import Receipts CSV</span>
            <input id="importReceiptsFile" type="file" accept=".csv,text/csv" />
          </label>
        </div>
      </div>
    `;

    $("#exportJobsCSV", host)?.addEventListener("click", exportJobsCSV);
    $("#exportReceiptsCSV", host)?.addEventListener("click", exportReceiptsCSV);
    $("#exportDispatchCSV", host)?.addEventListener("click", exportDispatchCSV);

    $("#exportDriverLedger", host)?.addEventListener("click", () => {
      const id = $("#sheetsDriver", host)?.value || "";
      exportDriverLedgerCSV(id);
    });

    $("#importJobsFile", host)?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importJobsCSVFromFile(file).finally(() => { e.target.value = ""; });
    });

    $("#importReceiptsFile", host)?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      importReceiptsCSVFromFile(file).finally(() => { e.target.value = ""; });
    });
  }

  // ---------------------------
  // Modals
  // ---------------------------
  function openModal(modalId) {
    const overlay = $("#modalOverlay");
    const modal = $(modalId);
    if (!overlay || !modal) return;
    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modalId) {
    const overlay = $("#modalOverlay");
    const modal = $(modalId);
    if (!overlay || !modal) return;
    overlay.hidden = true;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function openJobModal(jobId = null) {
    state.editingJobId = jobId;

    const title = $("#jobModalTitle");
    const delBtn = $("#jobDelete");
    const err = $("#jobError");
    if (err) { err.hidden = true; err.textContent = ""; }

    const job = jobId ? state.jobs.find(j => j.id === jobId) : null;

    if (title) title.textContent = job ? "Edit Job" : "Add Job";
    if (delBtn) delBtn.hidden = !job;

    $("#jobDate").value = job ? job.date : ymd(state.currentDate);
    $("#jobCustomer").value = job ? job.customer : "";
    $("#jobPickup").value = job ? job.pickup : "";
    $("#jobDropoff").value = job ? job.dropoff : "";
    $("#jobAmount").value = String(job ? job.amount : 0);
    $("#jobStatus").value = job ? job.status : STATUS.scheduled;
    $("#jobNotes").value = job ? job.notes : "";

    openModal("#jobModal");
  }

  function saveJobFromModal() {
    const err = $("#jobError");
    const fail = (msg) => {
      if (err) { err.textContent = msg; err.hidden = false; }
      else alert(msg);
    };

    const date = ($("#jobDate").value || "").trim();
    const customer = ($("#jobCustomer").value || "").trim();
    const pickup = ($("#jobPickup").value || "").trim();
    const dropoff = ($("#jobDropoff").value || "").trim();
    const amount = clampMoney($("#jobAmount").value ?? 0);
    const status = ($("#jobStatus").value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes").value || "").trim();

    if (!date) return fail("Date is required.");
    if (!customer) return fail("Customer is required.");
    if (!STATUS[status]) return fail("Invalid status.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingJobId) {
      const job = state.jobs.find(j => j.id === state.editingJobId);
      if (!job) return fail("Job not found.");
      job.date = date;
      job.customer = customer;
      job.pickup = pickup;
      job.dropoff = dropoff;
      job.amount = amount;
      job.status = status;
      job.notes = notes;
      job.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        id: makeId("job"),
        date, customer, pickup, dropoff,
        amount, status, notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeModal("#jobModal");
    renderAll();
  }

  function deleteJobFromModal() {
    const id = state.editingJobId;
    if (!id) return;
    if (!confirm("Delete this job?")) return;

    state.jobs = state.jobs.filter(j => j.id !== id);
    state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));
    for (const dateISO of Object.keys(state.dispatch || {})) {
      if (state.dispatch[dateISO] && state.dispatch[dateISO][id]) delete state.dispatch[dateISO][id];
    }
    persist();

    closeModal("#jobModal");
    renderAll();
  }

  function hydrateReceiptDriverSelect(selectedId) {
    const sel = $("#receiptDriverId");
    if (!sel) return;

    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    sel.innerHTML = `<option value="">(no driver)</option>` +
      drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`).join("");
    sel.value = selectedId || "";
  }

  function setReceiptPhotoHint(dataUrl) {
    const hint = $("#receiptPhotoHint");
    if (!hint) return;
    hint.textContent = dataUrl ? "Photo attached ✅" : "No photo";
  }

  function openReceiptModal(receiptId = null) {
    state.editingReceiptId = receiptId;

    const title = $("#receiptModalTitle");
    const delBtn = $("#receiptDelete");
    const err = $("#receiptError");
    if (err) { err.hidden = true; err.textContent = ""; }

    const r = receiptId ? state.receipts.find(x => x.id === receiptId) : null;

    if (title) title.textContent = r ? "Edit Receipt" : "Add Receipt";
    if (delBtn) delBtn.hidden = !r;

    $("#receiptDate").value = r ? r.date : ymd(state.currentDate);
    $("#receiptVendor").value = r ? r.vendor : "";
    $("#receiptCategory").value = r ? r.category : "";
    $("#receiptAmount").value = String(r ? r.amount : 0);
    $("#receiptLinkedJobId").value = r ? r.linkedJobId : "";
    $("#receiptNotes").value = r ? r.notes : "";

    hydrateReceiptDriverSelect(r ? r.driverId : "");
    setReceiptPhotoHint(r ? r.photoDataUrl : "");
    const photo = $("#receiptPhoto");
    if (photo) photo.value = "";

    openModal("#receiptModal");
  }

  async function saveReceiptFromModal() {
    const err = $("#receiptError");
    const fail = (msg) => {
      if (err) { err.textContent = msg; err.hidden = false; }
      else alert(msg);
    };

    const date = ($("#receiptDate").value || "").trim();
    const vendor = ($("#receiptVendor").value || "").trim();
    const category = ($("#receiptCategory").value || "").trim();
    const amount = clampMoney($("#receiptAmount").value ?? 0);
    const linkedJobId = ($("#receiptLinkedJobId").value || "").trim();
    const notes = ($("#receiptNotes").value || "").trim();
    const driverId = ($("#receiptDriverId")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    let photoDataUrl = "";
    const photoInput = $("#receiptPhoto");
    if (photoInput && photoInput.files && photoInput.files[0]) {
      try { photoDataUrl = await fileToDataURL(photoInput.files[0]); }
      catch { /* ignore */ }
    }

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Receipt not found.");
      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.linkedJobId = linkedJobId;
      r.notes = notes;
      r.driverId = driverId;
      if (photoDataUrl) r.photoDataUrl = photoDataUrl;
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, linkedJobId, notes,
        driverId,
        photoDataUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeModal("#receiptModal");
    renderAll();
  }

  function deleteReceiptFromModal() {
    const id = state.editingReceiptId;
    if (!id) return;
    if (!confirm("Delete this receipt?")) return;

    state.receipts = state.receipts.filter(r => r.id !== id);
    persist();

    closeModal("#receiptModal");
    renderAll();
  }

  // ---------------------------
  // Render all
  // ---------------------------
  function renderAll() {
    const ctx = $("#contextLine");
    if (ctx) {
      const dateStr = ymd(state.currentDate);
      ctx.textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view === "drivers" ? "Drivers" :
        state.view === "trucks" ? "Trucks" :
        state.view === "dispatch" ? `Dispatch: ${dateStr}` :
        state.view === "finance" ? "Finance" :
        state.view === "inventory" ? "Inventory" :
        state.view === "scanner" ? "AI Scanner" :
        state.view === "sheets" ? "Sheets" :
        "Move-Master.OS";
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderDrivers();
    if (state.view === "trucks") renderTrucks();
    if (state.view === "dispatch") renderDispatch();
    if (state.view === "finance") renderFinance();
    if (state.view === "inventory") renderInventory();
    if (state.view === "scanner") renderScanner();
    if (state.view === "sheets") renderSheets();
  }

  // ---------------------------
  // Bind nav once
  // ---------------------------
  function bindNavOnce() {
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.dataset.view;
        if (v) setView(v);
      });
    });

    $("#btnToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.currentDate = now;
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        const d = state.currentDate;
        state.currentDate = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        const d = state.currentDate;
        state.currentDate = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    $("#calPrev")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      renderAll();
    });
    $("#calNext")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      renderAll();
    });
    $("#calToday")?.addEventListener("click", () => {
      const now = startOfDay(new Date());
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = now;
      renderAll();
    });

    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    $("#modalOverlay")?.addEventListener("click", () => {
      closeModal("#jobModal");
      closeModal("#receiptModal");
    });

    $("#jobModalClose")?.addEventListener("click", () => closeModal("#jobModal"));
    $("#jobCancel")?.addEventListener("click", () => closeModal("#jobModal"));
    $("#jobSave")?.addEventListener("click", () => saveJobFromModal());
    $("#jobDelete")?.addEventListener("click", () => deleteJobFromModal());

    $("#receiptModalClose")?.addEventListener("click", () => closeModal("#receiptModal"));
    $("#receiptCancel")?.addEventListener("click", () => closeModal("#receiptModal"));
    $("#receiptSave")?.addEventListener("click", () => saveReceiptFromModal());
    $("#receiptDelete")?.addEventListener("click", () => deleteReceiptFromModal());
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.drivers = (state.drivers || []).map(x => normalizeNamedRow(x, "drv"));
    state.trucks = (state.trucks || []).map(x => normalizeNamedRow(x, "trk"));
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    state.scans = (state.scans || []).map(normalizeScan);
    state.dispatch = normalizeDispatchState(state.dispatch);

    persist();
    bindNavOnce();

    setView("dashboard");
    setPill("JS: ready ✅", true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
