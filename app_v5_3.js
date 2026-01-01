/* =========================================================
   Move-Master.OS — app_v5_3.js (FULL + DISPATCH INTELLIGENCE)
   - Single file. No “half code”. No duplicate functions.
   - LocalStorage persistence
   - Dispatch assigns Driver + Truck per Job per date
   - Adds: Dispatch Reference Panel + warnings + Auto-Assign
   - AI Scanner: camera capture + optional Tesseract OCR
   - Sheets: store Apps Script endpoint + push JSON
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
    sheets: "mm_sheets_v5_3",
    dispatchRef: "mm_dispatch_ref_v5_3",
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

  function loadObj(key, fallback = {}) {
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : fallback;
      return obj && typeof obj === "object" ? obj : fallback;
    } catch {
      return fallback;
    }
  }
  function saveObj(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
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
    o.driverId = (o.driverId || "").trim();
    o.linkedJobId = (o.linkedJobId || "").trim();
    o.notes = (o.notes || "").trim();
    o.photo = o.photo || ""; // dataURL (optional)
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
    o.image = o.image || ""; // dataURL (optional)
    o.result = o.result || {};
    o.createdAt = o.createdAt || Date.now();
    return o;
  }

  // Dispatch state: { "YYYY-MM-DD": { "jobId": { driverId, truckId, notes, updatedAt } } }
  function normalizeDispatchState(x) {
    const obj = (x && typeof x === "object") ? x : {};
    return obj;
  }

  // Dispatch reference panel state: { collapsed:boolean, url:string, dataUrl:string }
  function normalizeDispatchRef(x) {
    const o = (x && typeof x === "object") ? x : {};
    return {
      collapsed: !!o.collapsed,
      url: (o.url || "").trim(),
      dataUrl: (o.dataUrl || "").trim(),
    };
  }

  // Sheets config: { endpoint:string, token:string }
  function normalizeSheets(x) {
    const o = (x && typeof x === "object") ? x : {};
    return {
      endpoint: (o.endpoint || "").trim(),
      token: (o.token || "").trim(),
      lastPushAt: o.lastPushAt || 0,
    };
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS.jobs).map(normalizeJob),
    receipts: loadArray(LS.receipts).map(normalizeReceipt),

    drivers: loadArray(LS.drivers).map((x) => normalizeNamedRow(x, "drv")),
    trucks: loadArray(LS.trucks).map((x) => normalizeNamedRow(x, "trk")),

    dispatch: normalizeDispatchState(loadObj(LS.dispatch, {})),
    finance: loadArray(LS.finance),
    inventory: loadArray(LS.inventory).map(normalizeInventoryItem),
    scans: loadArray(LS.scans).map(normalizeScan),

    sheets: normalizeSheets(loadObj(LS.sheets, {})),
    dispatchRef: normalizeDispatchRef(loadObj(LS.dispatchRef, {})),

    editingJobId: null,
    editingReceiptId: null,

    // scanner runtime
    camStream: null,
    camLastImage: "",
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
    saveObj(LS.sheets, state.sheets);
    saveObj(LS.dispatchRef, state.dispatchRef);
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
      const unassigned = countDispatchUnassigned(todayStr);

      todayStats.innerHTML = `
        <div>Jobs: <strong>${jobsByDate(todayStr).length}</strong></div>
        <div>Receipts: <strong>${receiptsByDate(todayStr).length}</strong></div>
        <div style="margin-top:6px;">Revenue: <strong>${money(rev)}</strong></div>
        <div>Expenses: <strong>${money(exp)}</strong></div>
        <div>Net: <strong>${money(net)}</strong></div>
        <div style="margin-top:6px;">Dispatch unassigned: <strong>${unassigned}</strong></div>
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
  // Full calendar
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
    if (title) title.textContent = `Day Workspace – ${dateStr}`;
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
        state.receipts = state.receipts.map(r => (r.linkedJobId === id ? normalizeReceipt({ ...r, linkedJobId:"", updatedAt:Date.now() }) : r));
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
      const driverName = r.driverId ? (state.drivers.find(d => d.id === r.driverId)?.name || "Driver") : "";
      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Category")}</div>
          <div class="receipt-sub">${money(r.amount)}${driverName ? ` · ${escapeHtml(driverName)}` : ""} · ${escapeHtml(r.notes || "")}</div>
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
  // Drivers & Trucks rosters
  // ---------------------------
  function renderRoster(viewName, arrKey, singularLabel) {
    const host = $(`#view-${viewName}`);
    if (!host) return;

    const rows = state[arrKey] || [];

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">${escapeHtml(singularLabel)}s</div>
          <div class="panel-sub">Editable roster (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:260px;">
            <span>${escapeHtml(singularLabel)} Name</span>
            <input id="${viewName}Name" type="text" placeholder="Name" />
          </label>
          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="${viewName}Notes" type="text" placeholder="Phone, plate, availability, etc." />
          </label>
          <button class="btn primary" type="button" id="${viewName}Add">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(r.name || singularLabel)}</div>
                    <div class="job-sub">${escapeHtml(r.notes || "")}</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-edit="${escapeHtml(r.id)}">Edit</button>
                    <button class="btn danger" type="button" data-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No ${escapeHtml(singularLabel.toLowerCase())}s yet.</div>`
          }
        </div>
      </div>
    `;

    $(`#${viewName}Add`)?.addEventListener("click", () => {
      const name = ($(`#${viewName}Name`)?.value || "").trim();
      const notes = ($(`#${viewName}Notes`)?.value || "").trim();
      if (!name) return alert(`${singularLabel} name is required.`);
      state[arrKey].push(normalizeNamedRow({ name, notes, createdAt:Date.now(), updatedAt:Date.now() }, arrKey));
      persist();
      renderAll();
    });

    $$("[data-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      if (!confirm(`Delete this ${singularLabel.toLowerCase()}?`)) return;

      state[arrKey] = state[arrKey].filter(x => x.id !== id);

      // remove from dispatch assignments
      const isDriver = arrKey === "drivers";
      const isTruck = arrKey === "trucks";
      if (isDriver || isTruck) {
        for (const dateISO of Object.keys(state.dispatch || {})) {
          const bucket = state.dispatch[dateISO];
          if (!bucket) continue;
          for (const jobId of Object.keys(bucket)) {
            if (isDriver && bucket[jobId]?.driverId === id) bucket[jobId].driverId = "";
            if (isTruck && bucket[jobId]?.truckId === id) bucket[jobId].truckId = "";
          }
        }
      }

      persist();
      renderAll();
    }));

    $$("[data-edit]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const row = state[arrKey].find(x => x.id === id);
      if (!row) return;
      const name = prompt(`${singularLabel} name:`, row.name || "");
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
  // Dispatch helpers (intelligence)
  // ---------------------------
  function ensureDispatchBucket(dateISO) {
    if (!state.dispatch[dateISO]) state.dispatch[dateISO] = {};
    return state.dispatch[dateISO];
  }

  function countDispatchUnassigned(dateISO) {
    const bucket = ensureDispatchBucket(dateISO);
    const jobs = jobsByDate(dateISO).filter(j => j.status !== STATUS.cancelled);
    let unassigned = 0;
    for (const j of jobs) {
      const a = bucket[j.id] || {};
      if (!a.driverId || !a.truckId) unassigned++;
    }
    return unassigned;
  }

  function computeDispatchWarnings(dateISO) {
    const bucket = ensureDispatchBucket(dateISO);
    const jobs = jobsByDate(dateISO);
    const driverCount = new Map(); // driverId -> count
    const truckCount = new Map();  // truckId -> count

    for (const j of jobs) {
      if (j.status === STATUS.cancelled) continue;
      const a = bucket[j.id] || {};
      if (a.driverId) driverCount.set(a.driverId, (driverCount.get(a.driverId) || 0) + 1);
      if (a.truckId)  truckCount.set(a.truckId,  (truckCount.get(a.truckId)  || 0) + 1);
    }

    const perJob = {}; // jobId -> { missingDriver, missingTruck, dupDriver, dupTruck, cancelled }
    for (const j of jobs) {
      const a = bucket[j.id] || {};
      perJob[j.id] = {
        cancelled: j.status === STATUS.cancelled,
        missingDriver: j.status !== STATUS.cancelled && !a.driverId,
        missingTruck:  j.status !== STATUS.cancelled && !a.truckId,
        dupDriver: j.status !== STATUS.cancelled && !!a.driverId && (driverCount.get(a.driverId) || 0) > 1,
        dupTruck:  j.status !== STATUS.cancelled && !!a.truckId  && (truckCount.get(a.truckId)  || 0) > 1,
      };
    }

    return { perJob, driverCount, truckCount };
  }

  function autoAssignDispatch(dateISO) {
    const bucket = ensureDispatchBucket(dateISO);
    const jobs = jobsByDate(dateISO)
      .slice()
      .sort((a,b) => (a.createdAt||0) - (b.createdAt||0))
      .filter(j => j.status !== STATUS.cancelled);

    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const trucks  = (state.trucks  || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));

    if (!jobs.length) return { assigned: 0, reason: "no-jobs" };

    let dIdx = 0;
    let tIdx = 0;
    let assigned = 0;

    for (const job of jobs) {
      const current = bucket[job.id] || {};
      // Keep notes; only fill/replace driver+truck
      const nextDriverId = drivers.length ? drivers[dIdx % drivers.length].id : "";
      const nextTruckId  = trucks.length  ? trucks[tIdx % trucks.length].id  : "";

      bucket[job.id] = {
        driverId: nextDriverId,
        truckId: nextTruckId,
        notes: (current.notes || "").trim(),
        updatedAt: Date.now(),
      };

      dIdx++;
      tIdx++;
      assigned++;
    }

    return { assigned, reason: "ok" };
  }

  // ---------------------------
  // Dispatch (table + reference panel)
  // ---------------------------
  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const dateISO = ymd(state.currentDate);
    const jobs = jobsByDate(dateISO).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const drivers = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const trucks  = (state.trucks  || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));

    const bucket = ensureDispatchBucket(dateISO);
    const warn = computeDispatchWarnings(dateISO);

    const driverOptions = [`<option value="">— Driver —</option>`]
      .concat(drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`))
      .join("");

    const truckOptions = [`<option value="">— Truck —</option>`]
      .concat(trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name || "Truck")}</option>`))
      .join("");

    const unassigned = countDispatchUnassigned(dateISO);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assign Driver + Truck per Job for <strong>${escapeHtml(dateISO)}</strong>.</div>
        </div>

        <div class="muted" style="margin-bottom:10px;">
          If Jobs are empty, go to <strong>Day Workspace</strong> and add jobs for this date first.
        </div>

        <div class="dispatch-summary" id="dispatchSummary"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
          <button class="btn primary" type="button" id="dispatchSaveAll">Save Assignments</button>
          <button class="btn" type="button" id="dispatchAutoAssign">Auto-Assign</button>
          <button class="btn danger" type="button" id="dispatchClear">Clear This Day</button>
          <div class="muted" id="dispatchHint"></div>
        </div>

        <div class="dispatch-layout">
          <div>
            <div id="dispatchTableWrap"></div>
            <div id="dispatchEmpty" class="muted empty" style="display:none;">No jobs for ${escapeHtml(dateISO)} yet.</div>
          </div>

          <aside class="ref-panel" id="dispatchRefPanel"></aside>
        </div>
      </div>
    `;

    const wrap = $("#dispatchTableWrap", host);
    const empty = $("#dispatchEmpty", host);
    const hint = $("#dispatchHint", host);
    const summary = $("#dispatchSummary", host);

    if (hint) hint.textContent = `Drivers: ${drivers.length} · Trucks: ${trucks.length} · Unassigned: ${unassigned}`;

    renderDispatchSummary(summary, dateISO, warn);
    renderDispatchReferencePanel($("#dispatchRefPanel", host));

    if (!jobs.length) {
      if (wrap) wrap.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    const rows = jobs.map(job => {
      const assigned = bucket[job.id] || {};
      const notes = assigned.notes || "";
      const w = warn.perJob[job.id] || {};
      const trClass =
        w.cancelled ? "tr-cancelled" :
        (w.missingDriver || w.missingTruck) ? "tr-bad" :
        (w.dupDriver || w.dupTruck) ? "tr-warn" : "";

      const flags = [];
      if (w.cancelled) flags.push(`<span class="badge badge-warn">Cancelled</span>`);
      if (w.missingDriver) flags.push(`<span class="badge badge-bad">Driver missing</span>`);
      if (w.missingTruck)  flags.push(`<span class="badge badge-bad">Truck missing</span>`);
      if (w.dupDriver) flags.push(`<span class="badge badge-warn">Driver reused</span>`);
      if (w.dupTruck)  flags.push(`<span class="badge badge-warn">Truck reused</span>`);

      return `
        <tr class="${trClass}" data-job-id="${escapeHtml(job.id)}">
          <td style="min-width:260px;">
            <div style="font-weight:600;">${escapeHtml(job.customer || "Customer")} ${flags.join(" ")}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(job.pickup || "")} → ${escapeHtml(job.dropoff || "")}</div>
          </td>
          <td style="min-width:110px;">${money(job.amount || 0)}</td>
          <td style="min-width:180px;">
            <select class="dispatchDriver" ${job.status === STATUS.cancelled ? "disabled" : ""}>${driverOptions}</select>
          </td>
          <td style="min-width:180px;">
            <select class="dispatchTruck" ${job.status === STATUS.cancelled ? "disabled" : ""}>${truckOptions}</select>
          </td>
          <td style="min-width:220px;">
            <input class="dispatchNotes" type="text" placeholder="Notes (gate code, time, etc.)" value="${escapeHtml(notes)}" ${job.status === STATUS.cancelled ? "disabled" : ""} />
          </td>
          <td style="min-width:120px;">
            <button class="btn dispatchRowSave" type="button" ${job.status === STATUS.cancelled ? "disabled" : ""}>Save</button>
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

    // Set selections
    wrap.querySelectorAll("tr[data-job-id]").forEach(tr => {
      const jobId = tr.getAttribute("data-job-id");
      const assigned = bucket[jobId] || {};
      const driverSel = tr.querySelector(".dispatchDriver");
      const truckSel = tr.querySelector(".dispatchTruck");
      const notesInp = tr.querySelector(".dispatchNotes");
      if (driverSel) driverSel.value = assigned.driverId || "";
      if (truckSel) truckSel.value = assigned.truckId || "";
      if (notesInp) notesInp.value = assigned.notes || "";
    });

    // Row save (event delegation)
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

      // re-render to refresh warnings/summary
      renderDispatch();
    };

    // Save all
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
      renderDispatch();
    });

    // Auto-Assign
    $("#dispatchAutoAssign", host)?.addEventListener("click", () => {
      if (!confirm(`Auto-assign Drivers/Trucks for ${dateISO}? (Cancelled jobs ignored)`)) return;
      const res = autoAssignDispatch(dateISO);
      persist();
      alert(`Auto-Assign complete: ${res.assigned} job(s).`);
      renderDispatch();
    });

    // Clear day
    $("#dispatchClear", host)?.addEventListener("click", () => {
      if (!confirm(`Clear all assignments for ${dateISO}?`)) return;
      state.dispatch[dateISO] = {};
      persist();
      renderDispatch();
    });
  }

  function renderDispatchSummary(host, dateISO, warn) {
    if (!host) return;

    const jobs = jobsByDate(dateISO).filter(j => j.status !== STATUS.cancelled);
    const bucket = ensureDispatchBucket(dateISO);

    let unassigned = 0;
    for (const j of jobs) {
      const a = bucket[j.id] || {};
      if (!a.driverId || !a.truckId) unassigned++;
    }

    const driverLines = [];
    for (const [id, count] of warn.driverCount.entries()) {
      const name = state.drivers.find(d => d.id === id)?.name || "Driver";
      driverLines.push(`${name}: ${count}`);
    }
    const truckLines = [];
    for (const [id, count] of warn.truckCount.entries()) {
      const name = state.trucks.find(t => t.id === id)?.name || "Truck";
      truckLines.push(`${name}: ${count}`);
    }

    host.innerHTML = `
      <span class="badge ${unassigned ? "badge-bad" : "badge-ok"}">Unassigned: ${unassigned}</span>
      <span class="badge badge-warn">Driver utilization: ${escapeHtml(driverLines.length ? driverLines.join(" · ") : "—")}</span>
      <span class="badge badge-warn">Truck utilization: ${escapeHtml(truckLines.length ? truckLines.join(" · ") : "—")}</span>
    `;
  }

  function renderDispatchReferencePanel(host) {
    if (!host) return;

    const ref = state.dispatchRef;

    const imgSrc = ref.dataUrl || ref.url || "";
    const hasImg = !!imgSrc;

    host.innerHTML = `
      <div class="ref-header">
        <div class="ref-title">Dispatch Reference</div>
        <button class="btn" type="button" id="refToggle">${ref.collapsed ? "Expand" : "Collapse"}</button>
      </div>

      <div class="muted" style="margin-bottom:10px;">
        Optional: pin a “back-end reference” image (like your job completion screen) without touching anything else.
      </div>

      <div class="ref-body" style="${ref.collapsed ? "display:none;" : ""}">
        <div class="ref-controls">
          <label class="field">
            <span>Image URL (recommended)</span>
            <input id="refUrl" type="text" placeholder="https://..." value="${escapeHtml(ref.url)}" />
          </label>

          <label class="field">
            <span>Or upload an image (stored in LocalStorage)</span>
            <input id="refFile" type="file" accept="image/*" />
            <div class="muted" style="font-size:12px;">
              Note: big images can exceed browser storage limits. URL is safer.
            </div>
          </label>

          <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn" type="button" id="refSave">Save</button>
            <button class="btn danger" type="button" id="refClear">Clear</button>
          </div>
        </div>

        <div class="ref-preview">
          ${hasImg ? `<img alt="Dispatch reference" src="${escapeHtml(imgSrc)}" />` : `<div class="muted">No reference image set.</div>`}
        </div>
      </div>
    `;

    $("#refToggle", host)?.addEventListener("click", () => {
      state.dispatchRef.collapsed = !state.dispatchRef.collapsed;
      persist();
      renderDispatch(); // simple refresh
    });

    $("#refSave", host)?.addEventListener("click", async () => {
      const url = ($("#refUrl", host)?.value || "").trim();
      state.dispatchRef.url = url;

      // If URL is set, prefer URL (and wipe dataUrl unless you want both)
      if (url) state.dispatchRef.dataUrl = "";

      persist();
      renderDispatch();
    });

    $("#refClear", host)?.addEventListener("click", () => {
      if (!confirm("Clear dispatch reference image?")) return;
      state.dispatchRef.url = "";
      state.dispatchRef.dataUrl = "";
      persist();
      renderDispatch();
    });

    $("#refFile", host)?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const dataUrl = await readFileAsDataURL(file);
      state.dispatchRef.dataUrl = dataUrl;
      state.dispatchRef.url = "";

      persist();
      renderDispatch();
    });
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
          Next: payroll rollups, driver expenses, and payout rules.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Inventory
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
  // Scanner (camera + OCR optional)
  // ---------------------------
  function classifyText(text) {
    const t = (text || "").toLowerCase();
    const receiptHints = ["total", "subtotal", "tax", "visa", "mastercard", "receipt", "thank you", "balance", "change"];
    const furnitureHints = ["sofa", "couch", "dresser", "table", "bed", "mattress", "chair", "nightstand", "tv", "mirror", "boxes", "box"];

    const receiptScore = receiptHints.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);
    const furnScore = furnitureHints.reduce((acc, k) => acc + (t.includes(k) ? 1 : 0), 0);

    if (receiptScore >= 2 && receiptScore >= furnScore) return "receipt";
    if (furnScore >= 1 && furnScore > receiptScore) return "furniture";
    return "unknown";
  }

  function stopCamera() {
    if (state.camStream) {
      for (const track of state.camStream.getTracks()) track.stop();
      state.camStream = null;
    }
  }

  async function startCamera(videoEl) {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    state.camStream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
  }

  function captureFrame(videoEl, canvasEl) {
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, w, h);
    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.9);
    return dataUrl;
  }

  async function runOCR(dataUrl) {
    // If Tesseract isn't loaded, return a helpful message
    if (!window.Tesseract) {
      throw new Error("Tesseract.js not loaded. (CDN missing or blocked)");
    }
    const { data } = await window.Tesseract.recognize(dataUrl, "eng");
    return (data && data.text) ? data.text.trim() : "";
  }

  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    const rows = state.scans.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    const tLoaded = !!window.Tesseract;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Camera + OCR (client-side). Works best in good lighting.</div>
        </div>

        <div class="muted" style="margin-bottom:10px;">
          Tesseract: <strong>${tLoaded ? "Loaded ✅" : "Not detected (OCR will fail) ⚠️"}</strong>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
          <button class="btn" type="button" id="camStart">Start Camera</button>
          <button class="btn" type="button" id="camStop">Stop</button>
          <button class="btn primary" type="button" id="camCapture">Capture</button>
          <button class="btn" type="button" id="ocrRun">Run OCR</button>
          <span class="muted" id="scanStatus">—</span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="panel" style="margin:0;">
            <div class="panel-title" style="margin-bottom:10px;">Camera</div>
            <video id="scanVideo" playsinline muted style="width:100%; border-radius:14px; background:rgba(0,0,0,0.2);"></video>
          </div>

          <div class="panel" style="margin:0;">
            <div class="panel-title" style="margin-bottom:10px;">Capture</div>
            <img id="scanPreview" alt="Capture preview" style="width:100%; border-radius:14px; display:block; background:rgba(0,0,0,0.2);" />
            <canvas id="scanCanvas" style="display:none;"></canvas>
          </div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-header">
            <div class="panel-title">Extracted Text</div>
            <div class="panel-sub">You can paste/edit before saving</div>
          </div>

          <label class="field">
            <span>OCR Output</span>
            <textarea id="scanText" rows="6" placeholder="OCR text will appear here..."></textarea>
          </label>

          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px; flex-wrap:wrap;">
            <button class="btn" type="button" id="scanToReceiptNotes">Send to Receipt Notes</button>
            <button class="btn primary" type="button" id="scanSaveLog">Save Scan Log</button>
            <button class="btn danger" type="button" id="scanClear">Clear</button>
          </div>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length
              ? rows.map(r => `
                <div class="receipt-row">
                  <div class="receipt-main">
                    <div class="receipt-title">${escapeHtml(new Date(r.createdAt).toLocaleString())} · <strong>${escapeHtml(r.type)}</strong></div>
                    <div class="receipt-sub">${escapeHtml((r.text || "").slice(0, 160))}${(r.text||"").length > 160 ? "…" : ""}</div>
                  </div>
                  <div class="receipt-actions">
                    <button class="btn" type="button" data-scan-use="${escapeHtml(r.id)}">Open</button>
                    <button class="btn danger" type="button" data-scan-del="${escapeHtml(r.id)}">Delete</button>
                  </div>
                </div>
              `).join("")
              : `<div class="muted empty">No scans yet.</div>`
          }
        </div>
      </div>
    `;

    const videoEl = $("#scanVideo", host);
    const canvasEl = $("#scanCanvas", host);
    const previewEl = $("#scanPreview", host);
    const statusEl = $("#scanStatus", host);
    const textEl = $("#scanText", host);

    const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };

    $("#camStart", host)?.addEventListener("click", async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          alert("Camera not supported in this browser.");
          return;
        }
        setStatus("Starting camera…");
        await startCamera(videoEl);
        setStatus("Camera ✅");
      } catch (e) {
        console.error(e);
        alert("Camera failed to start. Make sure you're on HTTPS (GitHub Pages) and allow permissions.");
        setStatus("Camera error");
      }
    });

    $("#camStop", host)?.addEventListener("click", () => {
      stopCamera();
      setStatus("Camera stopped");
    });

    $("#camCapture", host)?.addEventListener("click", () => {
      if (!videoEl || !canvasEl) return;
      if (!state.camStream) return alert("Start camera first.");
      const dataUrl = captureFrame(videoEl, canvasEl);
      state.camLastImage = dataUrl;
      if (previewEl) previewEl.src = dataUrl;
      setStatus("Captured ✅ Ready for OCR.");
    });

    $("#ocrRun", host)?.addEventListener("click", async () => {
      try {
        if (!state.camLastImage) return alert("Capture an image first.");
        setStatus("OCR running…");
        const out = await runOCR(state.camLastImage);
        if (textEl) textEl.value = out || "";
        setStatus("OCR complete ✅");
      } catch (e) {
        console.error(e);
        alert(String(e?.message || e));
        setStatus("OCR failed");
      }
    });

    $("#scanToReceiptNotes", host)?.addEventListener("click", () => {
      const text = (textEl?.value || "").trim();
      if (!text) return alert("No text to send.");
      // store temp in localStorage so receipt modal can pull it
      localStorage.setItem("mm_temp_scan_text", text);
      alert("Saved to temp. Open Add Receipt and paste from notes if needed.");
    });

    $("#scanSaveLog", host)?.addEventListener("click", () => {
      const text = (textEl?.value || "").trim();
      const type = classifyText(text);
      if (!text) return alert("Nothing to save.");
      state.scans.unshift(normalizeScan({
        type,
        source: "camera",
        text,
        image: state.camLastImage || "",
        createdAt: Date.now(),
      }));
      persist();
      renderAll();
    });

    $("#scanClear", host)?.addEventListener("click", () => {
      if (previewEl) previewEl.src = "";
      if (textEl) textEl.value = "";
      state.camLastImage = "";
      setStatus("Cleared");
    });

    $$("[data-scan-del]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-scan-del");
      if (!id) return;
      if (!confirm("Delete this scan?")) return;
      state.scans = state.scans.filter(x => x.id !== id);
      persist();
      renderAll();
    }));

    $$("[data-scan-use]", host).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-scan-use");
      const r = state.scans.find(x => x.id === id);
      if (!r) return;
      if (previewEl) previewEl.src = r.image || "";
      if (textEl) textEl.value = r.text || "";
      state.camLastImage = r.image || "";
      setStatus("Loaded scan log");
    }));
  }

  // --------------------------------
  // Sheets (Apps Script endpoint push)
   //--------------–-----------------
// ---------------------------

   function renderSheets() {
  const host = $("#view-sheets");
  if (!host) return;

  const cfg = state.sheets;

  host.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">Sheets</div>
        <div class="panel-sub">
          Configure your Google Apps Script endpoint and push JSON.
        </div>
      </div>

      <div class="muted" style="margin-bottom:10px;">
        This is client-side. The endpoint must handle CORS and accept POST JSON.
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
        <label class="field" style="min-width:520px; flex:1;">
          <span>Apps Script Web App URL</span>
          <input
            id="sheetsEndpoint"
            type="text"
            placeholder="https://script.google.com/macros/s/....../exec"
            value="${escapeHtml(cfg.endpoint)}"
          />
        </label>

        <label class="field" style="min-width:260px;">
          <span>Token (optional)</span>
          <input
            id="sheetsToken"
            type="text"
            placeholder="Bearer token or shared secret"
            value="${escapeHtml(cfg.token)}"
          />
        </label>

        <button class="btn primary" type="button" id="sheetsSave">
          Save
        </button>
      </div>

      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" type="button" id="pushJobs">Push Jobs</button>
        <button class="btn" type="button" id="pushReceipts">Push Receipts</button>
        <button class="btn" type="button" id="pushDispatch">Push Dispatch</button>
        <button class="btn primary" type="button" id="pushAll">Push All</button>
        <span class="muted" id="pushStatus">—</span>
      </div>

      <div class="panel" style="margin-top:12px;">
        <div class="panel-header">
          <div class="panel-title">Payload preview</div>
          <button class="btn" type="button" id="togglePayload">
            Show payload preview
          </button>
        </div>

        <div class="muted" style="margin-top:6px;">
          This is what your endpoint receives.
        </div>

        <pre
          id="payloadPreview"
          style="display:none; white-space:pre-wrap; word-break:break-word; font-size:12px; opacity:0.9; margin-top:10px;"
        ></pre>
      </div>
    </div>
  `;

  const statusEl = $("#pushStatus", host);
  const previewEl = $("#payloadPreview", host);
  const toggleBtn = $("#togglePayload", host);

  const setStatus = (t) => {
    if (statusEl) statusEl.textContent = t;
  };

  // --- payload preview toggle (THIS IS THE FIX) ---
  if (toggleBtn && previewEl) {
    toggleBtn.addEventListener("click", () => {
      const open = previewEl.style.display !== "none";
      previewEl.style.display = open ? "none" : "block";
      toggleBtn.textContent = open
        ? "Show payload preview"
        : "Hide payload preview";
    });
  }

  $("#sheetsSave", host)?.addEventListener("click", () => {
    state.sheets.endpoint = ($("#sheetsEndpoint", host)?.value || "").trim();
    state.sheets.token = ($("#sheetsToken", host)?.value || "").trim();
    persist();
    alert("Sheets settings saved.");
    renderSheets();
  });

  const buildPayload = (type) => {
    const dateISO = ymd(state.currentDate);
    const payload = {
      app: "Move-Master.OS",
      version: "v5_3",
      type,
      dateISO,
      timestamp: Date.now(),
    };

    if (type === "jobs") payload.jobs = state.jobs;
    if (type === "receipts") payload.receipts = state.receipts;
    if (type === "dispatch") payload.dispatch = state.dispatch;
    if (type === "all") {
      payload.jobs = state.jobs;
      payload.receipts = state.receipts;
      payload.dispatch = state.dispatch;
      payload.drivers = state.drivers;
      payload.trucks = state.trucks;
      payload.inventory = state.inventory;
    }

    return payload;
  };

  async function postToEndpoint(payload) {
  const endpoint = (state.sheets.endpoint || "").trim();
  if (!endpoint) throw new Error("No endpoint set.");

  // IMPORTANT:
  // - Use text/plain to avoid CORS preflight in Safari/iOS
  // - Do NOT send Authorization header unless you’ve explicitly coded for it
  const headers = { "Content-Type": "text/plain;charset=utf-8" };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

  async function push(type) {
    try {
      setStatus("Building payload…");
      const payload = buildPayload(type);
      if (previewEl) previewEl.textContent = JSON.stringify(payload, null, 2);

      setStatus("Pushing…");
      const out = await postToEndpoint(payload);

      state.sheets.lastPushAt = Date.now();
      persist();

      setStatus(out.ok ? `Pushed ✅ (HTTP ${out.status})` : `Failed ⚠️ (HTTP ${out.status})`);
      if (!out.ok) alert(out.text || `Push failed (HTTP ${out.status})`);
    } catch (e) {
      console.error(e);
      setStatus("Push error");
      alert(String(e?.message || e));
    }
  }

  $("#pushJobs", host)?.addEventListener("click", () => push("jobs"));
  $("#pushReceipts", host)?.addEventListener("click", () => push("receipts"));
  $("#pushDispatch", host)?.addEventListener("click", () => push("dispatch"));
  $("#pushAll", host)?.addEventListener("click", () => push("all"));

  if (previewEl) {
    previewEl.textContent = JSON.stringify(buildPayload("all"), null, 2);
  }
}
  // ---------------------------
  // File helper
  // ---------------------------
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("File read failed."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
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

  function populateReceiptDriverDropdown() {
    const sel = $("#receiptDriverId");
    if (!sel) return;
    const rows = (state.drivers || []).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const keep = sel.value || "";
    sel.innerHTML = `<option value="">(no driver)</option>` + rows.map(d =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`
    ).join("");
    sel.value = keep;
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

    populateReceiptDriverDropdown();

    $("#receiptDate").value = r ? r.date : ymd(state.currentDate);
    $("#receiptVendor").value = r ? r.vendor : "";
    $("#receiptCategory").value = r ? r.category : "";
    $("#receiptAmount").value = String(r ? r.amount : 0);
    $("#receiptDriverId").value = r ? (r.driverId || "") : "";
    $("#receiptLinkedJobId").value = r ? r.linkedJobId : "";

    // If you have temp scan text, preload it into notes when adding
    const tempScan = localStorage.getItem("mm_temp_scan_text") || "";
    $("#receiptNotes").value = r ? r.notes : (tempScan ? tempScan : "");

    const hint = $("#receiptPhotoHint");
    if (hint) hint.textContent = r?.photo ? "Photo attached ✅" : "No photo";

    // clear file input
    const fileEl = $("#receiptPhoto");
    if (fileEl) fileEl.value = "";

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
    const driverId = ($("#receiptDriverId").value || "").trim();
    const linkedJobId = ($("#receiptLinkedJobId").value || "").trim();
    const notes = ($("#receiptNotes").value || "").trim();

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (err) { err.hidden = true; err.textContent = ""; }

    // optional photo
    let photo = "";
    const fileEl = $("#receiptPhoto");
    const file = fileEl?.files?.[0] || null;
    if (file) {
      try {
        photo = await readFileAsDataURL(file);
      } catch {
        // ignore photo failure
      }
    }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Receipt not found.");
      r.date = date;
      r.vendor = vendor;
      r.category = category;
      r.amount = amount;
      r.driverId = driverId;
      r.linkedJobId = linkedJobId;
      r.notes = notes;
      if (photo) r.photo = photo;
      r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, driverId, linkedJobId, notes,
        photo,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    // clear temp scan text once used
    localStorage.removeItem("mm_temp_scan_text");

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
        state.view[0].toUpperCase() + state.view.slice(1);
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderRoster("drivers", "drivers", "Driver");
    if (state.view === "trucks") renderRoster("trucks", "trucks", "Truck");
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
    $("#receiptSave")?.addEventListener("click", () => safe(() => saveReceiptFromModal()));
    $("#receiptDelete")?.addEventListener("click", () => deleteReceiptFromModal());
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    // normalize stored data
    state.jobs = (state.jobs || []).map(normalizeJob);
    state.receipts = (state.receipts || []).map(normalizeReceipt);
    state.drivers = (state.drivers || []).map(x => normalizeNamedRow(x, "drv"));
    state.trucks = (state.trucks || []).map(x => normalizeNamedRow(x, "trk"));
    state.inventory = (state.inventory || []).map(normalizeInventoryItem);
    state.scans = (state.scans || []).map(normalizeScan);
    state.dispatch = normalizeDispatchState(state.dispatch);
    state.sheets = normalizeSheets(state.sheets);
    state.dispatchRef = normalizeDispatchRef(state.dispatchRef);

    persist();
    bindNavOnce();

    if ($("#view-dashboard")) setView("dashboard");
    else if ($("#view-day")) setView("day");
    else if ($("#view-calendar")) setView("calendar");
    else renderAll();

    setPill("JS: ready ✅", true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(init));
  } else {
    safe(init);
  }
})();
