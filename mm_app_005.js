/* =========================================================
   Move-Master.OS — mm_app_005.js (FULL)
   Adds: Inventory + AI Scanner pages (active + persistent)
   Keeps: Dashboard + Calendar + Day Workspace + Drivers + Trucks + Dispatch + Finance

   Storage:
   - mm_jobs_v6
   - mm_receipts_v6
   - mm_drivers_v1
   - mm_trucks_v1
   - mm_inventory_v1
   - mm_scans_v1

   Notes:
   - AI Scanner is a front-end "scan session" system (uploads + tags + export).
     True AI vision requires backend/API, which we’ll wire later.
   ========================================================= */

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const pad2 = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  const fromYmd = (s) => {
    const [yy, mm, dd] = String(s || "").split("-").map(Number);
    if (!yy || !mm || !dd) return startOfDay(new Date());
    return startOfDay(new Date(yy, mm - 1, dd));
  };

  const monthName = (m) =>
    ["January","February","March","April","May","June","July","August","September","October","November","December"][m];

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

  // ---------- Storage ----------
  const LS_JOBS      = "mm_jobs_v6";
  const LS_RECEIPTS  = "mm_receipts_v6";
  const LS_DRIVERS   = "mm_drivers_v1";
  const LS_TRUCKS    = "mm_trucks_v1";
  const LS_INVENTORY = "mm_inventory_v1";
  const LS_SCANS     = "mm_scans_v1";

  const STATUS = {
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
  };

  const STATUS_LABEL = {
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  const VIEWS = [
    "dashboard","calendar","day","drivers","trucks","dispatch","finance","inventory","scanner"
  ];

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

  // ---------- Normalizers ----------
  function normalizeJob(j) {
    const job = { ...(j || {}) };
    if (!job.id) job.id = makeId("job");
    if (!job.date) job.date = ymd(startOfDay(new Date()));
    if (!job.status || !STATUS_LABEL[job.status]) job.status = STATUS.scheduled;

    job.customer = (job.customer || "").trim();
    job.pickup = (job.pickup || "").trim();
    job.dropoff = (job.dropoff || "").trim();
    job.amount = clampMoney(job.amount ?? 0);
    job.notes = (job.notes || "").trim();

    job.driverId = (job.driverId || "").trim();
    job.truckId = (job.truckId || "").trim();

    if (!job.createdAt) job.createdAt = Date.now();
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

    if (!rec.createdAt) rec.createdAt = Date.now();
    rec.updatedAt = rec.updatedAt || rec.createdAt;
    return rec;
  }

  function normalizeDriver(d) {
    const dr = { ...(d || {}) };
    if (!dr.id) dr.id = makeId("drv");
    dr.name = (dr.name || "").trim();
    dr.phone = (dr.phone || "").trim();
    dr.role = (dr.role || "Driver").trim();
    dr.active = typeof dr.active === "boolean" ? dr.active : true;
    if (!dr.createdAt) dr.createdAt = Date.now();
    dr.updatedAt = dr.updatedAt || dr.createdAt;
    return dr;
  }

  function normalizeTruck(t) {
    const tr = { ...(t || {}) };
    if (!tr.id) tr.id = makeId("trk");
    tr.label = (tr.label || "").trim();
    tr.plate = (tr.plate || "").trim();
    tr.capacity = (tr.capacity || "").trim();
    tr.active = typeof tr.active === "boolean" ? tr.active : true;
    if (!tr.createdAt) tr.createdAt = Date.now();
    tr.updatedAt = tr.updatedAt || tr.createdAt;
    return tr;
  }

  // Inventory item
  function normalizeInvItem(x) {
    const it = { ...(x || {}) };
    if (!it.id) it.id = makeId("inv");
    it.name = (it.name || "").trim();
    it.category = (it.category || "General").trim() || "General";
    it.qty = Number.isFinite(Number(it.qty)) ? Number(it.qty) : 0;
    it.unit = (it.unit || "pcs").trim() || "pcs";
    it.location = (it.location || "").trim();
    it.condition = (it.condition || "Good").trim() || "Good";
    it.lowStockAt = Number.isFinite(Number(it.lowStockAt)) ? Number(it.lowStockAt) : 0;
    it.notes = (it.notes || "").trim();

    // optional link to a move date (or job date)
    it.date = (it.date || "").trim(); // "YYYY-MM-DD" or empty

    it.active = typeof it.active === "boolean" ? it.active : true;

    if (!it.createdAt) it.createdAt = Date.now();
    it.updatedAt = it.updatedAt || it.createdAt;
    return it;
  }

  // Scan session
  function normalizeScan(s) {
    const sc = { ...(s || {}) };
    if (!sc.id) sc.id = makeId("scan");
    sc.date = (sc.date || ymd(startOfDay(new Date()))).trim();
    sc.customer = (sc.customer || "").trim(); // optional
    sc.jobId = (sc.jobId || "").trim(); // optional
    sc.notes = (sc.notes || "").trim();

    // files: metadata only (no base64 storage here to avoid blowing up localStorage)
    // [{ name, type, size, addedAt }]
    sc.files = Array.isArray(sc.files) ? sc.files : [];

    // tags: [{ label, qty }]
    sc.tags = Array.isArray(sc.tags) ? sc.tags : [];

    if (!sc.createdAt) sc.createdAt = Date.now();
    sc.updatedAt = sc.updatedAt || sc.createdAt;
    return sc;
  }

  // ---------- State ----------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
    drivers: loadArray(LS_DRIVERS).map(normalizeDriver),
    trucks: loadArray(LS_TRUCKS).map(normalizeTruck),

    inventory: loadArray(LS_INVENTORY).map(normalizeInvItem),
    scans: loadArray(LS_SCANS).map(normalizeScan),

    dispatchDate: ymd(startOfDay(new Date())),
    activeScanId: null,
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_DRIVERS, state.drivers);
    saveArray(LS_TRUCKS, state.trucks);
    saveArray(LS_INVENTORY, state.inventory);
    saveArray(LS_SCANS, state.scans);
  }

  // ---------- Seed defaults if empty ----------
  function seedIfEmpty() {
    const today = ymd(state.currentDate);

    if (!state.drivers.length) {
      state.drivers.push(normalizeDriver({ name: "Alex Driver", phone: "555-0101", role: "Driver", active: true }));
      state.drivers.push(normalizeDriver({ name: "Sam Lead", phone: "555-0102", role: "Lead", active: true }));
    }
    if (!state.trucks.length) {
      state.trucks.push(normalizeTruck({ label: "Truck 1 (26ft)", plate: "ABC-123", capacity: "26ft", active: true }));
      state.trucks.push(normalizeTruck({ label: "Truck 2 (16ft)", plate: "XYZ-789", capacity: "16ft", active: true }));
    }
    if (!state.jobs.length) {
      const jobId = makeId("job");
      state.jobs.push(normalizeJob({
        id: jobId,
        date: today,
        customer: "Sample Customer",
        pickup: "Pickup Address",
        dropoff: "Dropoff Address",
        amount: 1250,
        status: STATUS.scheduled,
        notes: "Seed job to prove dispatch + finance works",
        driverId: state.drivers[0]?.id || "",
        truckId: state.trucks[0]?.id || "",
      }));
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date: today,
        vendor: "Shell",
        category: "Fuel",
        amount: 64.25,
        notes: "Seed receipt",
        jobId,
      }));
    }

    if (!state.inventory.length) {
      state.inventory.push(normalizeInvItem({
        name: "Stretch wrap",
        category: "Supplies",
        qty: 12,
        unit: "rolls",
        location: "Warehouse",
        condition: "New",
        lowStockAt: 5,
        notes: "For packing",
        date: "",
        active: true,
      }));
      state.inventory.push(normalizeInvItem({
        name: "Dolly straps",
        category: "Equipment",
        qty: 4,
        unit: "sets",
        location: "Truck 1",
        condition: "Good",
        lowStockAt: 2,
        notes: "Check wear monthly",
        date: "",
        active: true,
      }));
    }

    if (!state.scans.length) {
      state.scans.push(normalizeScan({
        date: today,
        customer: "Sample Customer",
        jobId: state.jobs[0]?.id || "",
        notes: "Seed scan session. Upload photos/videos here later.",
        files: [],
        tags: [{ label: "Couch", qty: 1 }, { label: "Boxes", qty: 12 }],
      }));
      state.activeScanId = state.scans[0].id;
    }

    persist();
  }

  // ---------- Aggregations ----------
  const jobsByDate = (ds) => state.jobs.filter(j => j.date === ds);
  const receiptsByDate = (ds) => state.receipts.filter(r => r.date === ds);

  function sumRevenue(ds) {
    let total = 0;
    for (const j of jobsByDate(ds)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.amount);
    }
    return clampMoney(total);
  }

  function sumExpenses(ds) {
    let total = 0;
    for (const r of receiptsByDate(ds)) total += clampMoney(r.amount);
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
    return { revenue: clampMoney(revenue), expenses: clampMoney(expenses), net: clampMoney(revenue - expenses) };
  }

  // ---------- JS Pill ----------
  function setPill(ok, text) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.classList.remove("ok","bad");
    pill.classList.add(ok ? "ok" : "bad");
    pill.textContent = text;
  }

  // ---------- Sidebar label cleanup ----------
  function cleanSidebarLabels() {
    $$(".nav-item[data-view]").forEach(btn => {
      const view = btn.dataset.view;
      if (!view) return;
      const viewEl = $(`#view-${view}`);
      if (!viewEl) return;

      btn.textContent = btn.textContent
        .replace(/\s*\(coming soon\)\s*/ig, "")
        .replace(/\s*coming soon\s*/ig, "")
        .trim();
    });
  }

  // ---------- Router ----------
  function setView(name) {
    if (!VIEWS.includes(name)) name = "dashboard";
    state.view = name;

    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${name}`)?.classList.add("active");

    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);
    $("#todayLine") && ($("#todayLine").textContent = todayStr);

    const revToday = sumRevenue(todayStr);
    const expToday = sumExpenses(todayStr);
    const netToday = clampMoney(revToday - expToday);

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const mt = monthTotals(y, m);

    $("#todayStats") && ($("#todayStats").innerHTML = `
      <div><b>Jobs:</b> ${jobsByDate(todayStr).length}</div>
      <div><b>Receipts:</b> ${receiptsByDate(todayStr).length}</div>
      <div><b>Revenue:</b> ${money(revToday)}</div>
      <div><b>Expenses:</b> ${money(expToday)}</div>
      <div><b>Net:</b> ${money(netToday)}</div>
    `);

    $("#monthSnapshot") && ($("#monthSnapshot").innerHTML = `
      <div><b>${escapeHtml(monthName(m))} ${y}</b></div>
      <div>Revenue: <b>${money(mt.revenue)}</b></div>
      <div>Expenses: <b>${money(mt.expenses)}</b></div>
      <div>Net: <b>${money(mt.net)}</b></div>
      <div class="muted" style="margin-top:6px;">Finance + Inventory + Scanner now active.</div>
    `);

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
      const ds = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (ds === ymd(state.currentDate)) btn.classList.add("active");
      if (jobsByDate(ds).some(j => j.status !== STATUS.cancelled)) btn.classList.add("has-jobs");
      if (receiptsByDate(ds).length) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      container.appendChild(btn);
    }
  }

  // ---------- Full Calendar ----------
  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel");
    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    label.textContent = `${monthName(m)} ${y}`;
    grid.innerHTML = "";

    const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    for (const d of dow) {
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

    const todayStr = ymd(startOfDay(new Date()));

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const ds = ymd(d);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      if (ds === todayStr) cell.classList.add("today");
      if (ds === ymd(state.currentDate)) cell.classList.add("selected");

      const dayJobs = jobsByDate(ds);
      const jc = dayJobs.filter(j => j.status !== STATUS.cancelled).length;
      const rc = receiptsByDate(ds).length;

      cell.innerHTML = `
        <div class="num">${day}</div>
        <div class="markerbar">
          ${jc ? `<span class="chip chip-jobs">${jc} job${jc === 1 ? "" : "s"}</span>` : ""}
          ${rc ? `<span class="chip chip-receipts">🧾 ${rc}</span>` : ""}
        </div>
      `;

      cell.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(cell);
    }
  }

  // ---------- Day Workspace ----------
  function renderDay() {
    const ds = ymd(state.currentDate);
    $("#dayTitle") && ($("#dayTitle").textContent = `Day Workspace — ${ds}`);
    renderDayJobs(ds);
    renderDayReceipts(ds);
  }

  function renderDayJobs(ds) {
    const list = $("#dayJobsList");
    if (!list) return;

    const jobs = jobsByDate(ds).slice().sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
    const rev = sumRevenue(ds);
    const exp = sumExpenses(ds);
    const net = clampMoney(rev - exp);

    list.innerHTML = `
      <div class="day-totals">
        <div><b>Totals</b></div>
        <div>Revenue: ${money(rev)} · Expenses: ${money(exp)} · Net: ${money(net)}</div>
      </div>
    `;

    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No jobs for this day yet.";
      list.appendChild(empty);
      return;
    }

    for (const job of jobs) {
      const row = document.createElement("div");
      row.className = "job-row";

      const driverName = job.driverId ? (state.drivers.find(d => d.id === job.driverId)?.name || "Unknown") : "Unassigned";
      const truckName  = job.truckId ? (state.trucks.find(t => t.id === job.truckId)?.label || "Unknown") : "Unassigned";

      row.innerHTML = `
        <div class="job-main">
          <div class="job-title">${escapeHtml(job.customer || "Customer")} · ${money(job.amount)}</div>
          <div class="job-sub">${escapeHtml(job.pickup || "Pickup")} → ${escapeHtml(job.dropoff || "Dropoff")}</div>
          <div class="job-sub">Driver: ${escapeHtml(driverName)} · Truck: ${escapeHtml(truckName)}</div>
        </div>
        <div class="job-actions">
          <select class="job-status" data-job-status="${escapeHtml(job.id)}">
            <option value="scheduled" ${job.status===STATUS.scheduled?"selected":""}>Scheduled</option>
            <option value="completed" ${job.status===STATUS.completed?"selected":""}>Completed</option>
            <option value="cancelled" ${job.status===STATUS.cancelled?"selected":""}>Cancelled</option>
          </select>
        </div>
      `;
      list.appendChild(row);
    }

    $$("[data-job-status]", list).forEach(sel => {
      sel.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-job-status");
        const j = state.jobs.find(x => x.id === id);
        if (!j) return;
        const val = e.target.value;
        j.status = STATUS_LABEL[val] ? val : STATUS.scheduled;
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });
  }

  function renderDayReceipts(ds) {
    const list = $("#dayReceiptsList");
    if (!list) return;

    const receipts = receiptsByDate(ds).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const total = sumExpenses(ds);

    list.innerHTML = `
      <div class="day-totals">
        <div><b>Receipts</b></div>
        <div>Total Expenses: ${money(total)}</div>
      </div>
    `;

    if (!receipts.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No receipts for this day yet.";
      list.appendChild(empty);
      return;
    }

    for (const r of receipts) {
      const row = document.createElement("div");
      row.className = "receipt-row";
      row.innerHTML = `
        <div class="receipt-main">
          <div class="receipt-title">${escapeHtml(r.vendor || "Vendor")} · ${escapeHtml(r.category || "Uncategorized")}</div>
          <div class="receipt-sub">${money(r.amount)} · ${escapeHtml(r.notes || "")}</div>
        </div>
      `;
      list.appendChild(row);
    }
  }

  // ---------- Drivers ----------
  function renderDrivers() {
    const host = $("#view-drivers");
    if (!host) return;

    const rows = state.drivers.slice().sort((a,b) => (a.createdAt||0)-(b.createdAt||0));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Editable roster (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Name</span>
            <input id="drvName" type="text" placeholder="Driver name" />
          </label>
          <label class="field" style="min-width:180px;">
            <span>Phone</span>
            <input id="drvPhone" type="text" placeholder="(optional)" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Role</span>
            <input id="drvRole" type="text" placeholder="Driver / Lead" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Active</span>
            <select id="drvActive">
              <option value="true" selected>Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <button id="drvAddBtn" class="btn primary" type="button">Add Driver</button>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length ? rows.map(d => `
              <div class="job-row">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(d.name || "Unnamed Driver")}</div>
                  <div class="job-sub">Phone: ${escapeHtml(d.phone || "—")} · Role: ${escapeHtml(d.role || "Driver")} · Active: ${d.active ? "Yes" : "No"}</div>
                  <div class="job-sub muted">ID: ${escapeHtml(d.id)}</div>
                </div>
                <div class="job-actions">
                  <button class="btn" type="button" data-drv-edit="${escapeHtml(d.id)}">Edit</button>
                  <button class="btn danger" type="button" data-drv-del="${escapeHtml(d.id)}">Delete</button>
                </div>
              </div>
            `).join("") : `<div class="muted">No drivers yet.</div>`
          }
        </div>
      </div>
    `;

    $("#drvAddBtn")?.addEventListener("click", () => {
      const name = ($("#drvName")?.value || "").trim();
      const phone = ($("#drvPhone")?.value || "").trim();
      const role = ($("#drvRole")?.value || "Driver").trim() || "Driver";
      const active = ($("#drvActive")?.value || "true") === "true";

      if (!name) return alert("Driver name is required.");

      state.drivers.push(normalizeDriver({ name, phone, role, active, createdAt: Date.now(), updatedAt: Date.now() }));
      persist();
      renderAll();
    });

    $$("[data-drv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-del");
        if (!id) return;
        if (!confirm("Delete this driver?")) return;

        state.jobs = state.jobs.map(j => j.driverId === id ? normalizeJob({ ...j, driverId: "", updatedAt: Date.now() }) : j);
        state.drivers = state.drivers.filter(d => d.id !== id);

        persist();
        renderAll();
      });
    });

    $$("[data-drv-edit]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-edit");
        const d = state.drivers.find(x => x.id === id);
        if (!d) return;

        const name = prompt("Driver name:", d.name || "");
        if (name === null) return;
        const phone = prompt("Phone:", d.phone || "");
        if (phone === null) return;
        const role = prompt("Role (Driver/Lead):", d.role || "Driver");
        if (role === null) return;
        const active = confirm("Active? OK = Yes, Cancel = No");

        d.name = name.trim();
        d.phone = phone.trim();
        d.role = (role.trim() || "Driver");
        d.active = active;
        d.updatedAt = Date.now();

        persist();
        renderAll();
      });
    });
  }

  // ---------- Trucks ----------
  function renderTrucks() {
    const host = $("#view-trucks");
    if (!host) return;

    const rows = state.trucks.slice().sort((a,b) => (a.createdAt||0)-(b.createdAt||0));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Editable fleet list (local for now).</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:240px;">
            <span>Label</span>
            <input id="trkLabel" type="text" placeholder="Truck 1 (26ft)" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Plate</span>
            <input id="trkPlate" type="text" placeholder="ABC-123" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Capacity</span>
            <input id="trkCap" type="text" placeholder="26ft" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Active</span>
            <select id="trkActive">
              <option value="true" selected>Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <button id="trkAddBtn" class="btn primary" type="button">Add Truck</button>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            rows.length ? rows.map(t => `
              <div class="job-row">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(t.label || "Unnamed Truck")}</div>
                  <div class="job-sub">Plate: ${escapeHtml(t.plate || "—")} · Capacity: ${escapeHtml(t.capacity || "—")} · Active: ${t.active ? "Yes" : "No"}</div>
                  <div class="job-sub muted">ID: ${escapeHtml(t.id)}</div>
                </div>
                <div class="job-actions">
                  <button class="btn" type="button" data-trk-edit="${escapeHtml(t.id)}">Edit</button>
                  <button class="btn danger" type="button" data-trk-del="${escapeHtml(t.id)}">Delete</button>
                </div>
              </div>
            `).join("") : `<div class="muted">No trucks yet.</div>`
          }
        </div>
      </div>
    `;

    $("#trkAddBtn")?.addEventListener("click", () => {
      const label = ($("#trkLabel")?.value || "").trim();
      const plate = ($("#trkPlate")?.value || "").trim();
      const capacity = ($("#trkCap")?.value || "").trim();
      const active = ($("#trkActive")?.value || "true") === "true";

      if (!label) return alert("Truck label is required.");

      state.trucks.push(normalizeTruck({ label, plate, capacity, active, createdAt: Date.now(), updatedAt: Date.now() }));
      persist();
      renderAll();
    });

    $$("[data-trk-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-del");
        if (!id) return;
        if (!confirm("Delete this truck?")) return;

        state.jobs = state.jobs.map(j => j.truckId === id ? normalizeJob({ ...j, truckId: "", updatedAt: Date.now() }) : j);
        state.trucks = state.trucks.filter(t => t.id !== id);

        persist();
        renderAll();
      });
    });

    $$("[data-trk-edit]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-edit");
        const t = state.trucks.find(x => x.id === id);
        if (!t) return;

        const label = prompt("Truck label:", t.label || "");
        if (label === null) return;
        const plate = prompt("Plate:", t.plate || "");
        if (plate === null) return;
        const cap = prompt("Capacity:", t.capacity || "");
        if (cap === null) return;
        const active = confirm("Active? OK = Yes, Cancel = No");

        t.label = label.trim();
        t.plate = plate.trim();
        t.capacity = cap.trim();
        t.active = active;
        t.updatedAt = Date.now();

        persist();
        renderAll();
      });
    });
  }

  // ---------- Dispatch ----------
  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const ds = state.dispatchDate || ymd(state.currentDate);
    const jobs = jobsByDate(ds).slice().sort((a,b) => (a.createdAt||0)-(b.createdAt||0));

    const driverOptions = [
      `<option value="">(Unassigned)</option>`,
      ...state.drivers.filter(d => d.active).map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`)
    ].join("");

    const truckOptions = [
      `<option value="">(Unassigned)</option>`,
      ...state.trucks.filter(t => t.active).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label || "Truck")}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assign drivers + trucks to jobs for a specific day.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Date</span>
            <input id="dispatchDate" type="date" value="${escapeHtml(ds)}" />
          </label>
          <button id="dispatchOpenDay" class="btn">Open Day Workspace</button>
          <button id="dispatchOpenCalendar" class="btn">Open Calendar</button>
        </div>

        <div class="panel-spacer"></div>

        ${
          jobs.length
            ? `<div style="display:flex; flex-direction:column; gap:10px;">
                ${jobs.map(j => `
                  <div class="job-row">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
                      <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
                    </div>
                    <div class="job-actions" style="flex-wrap:wrap;">
                      <label class="field" style="min-width:190px;">
                        <span>Driver</span>
                        <select data-set-driver="${escapeHtml(j.id)}">${driverOptions}</select>
                      </label>
                      <label class="field" style="min-width:190px;">
                        <span>Truck</span>
                        <select data-set-truck="${escapeHtml(j.id)}">${truckOptions}</select>
                      </label>
                    </div>
                  </div>
                `).join("")}
              </div>`
            : `<div class="muted">No jobs on ${escapeHtml(ds)} yet.</div>`
        }
      </div>
    `;

    $("#dispatchDate")?.addEventListener("change", (e) => {
      state.dispatchDate = e.target.value || ds;
      renderAll();
    });

    $("#dispatchOpenDay")?.addEventListener("click", () => {
      const d = fromYmd(state.dispatchDate);
      state.currentDate = d;
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      setView("day");
    });

    $("#dispatchOpenCalendar")?.addEventListener("click", () => setView("calendar"));

    $$("[data-set-driver]", host).forEach(sel => {
      const jobId = sel.getAttribute("data-set-driver");
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      sel.value = job.driverId || "";
      sel.addEventListener("change", () => {
        job.driverId = sel.value || "";
        job.updatedAt = Date.now();
        persist();
      });
    });

    $$("[data-set-truck]", host).forEach(sel => {
      const jobId = sel.getAttribute("data-set-truck");
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      sel.value = job.truckId || "";
      sel.addEventListener("change", () => {
        job.truckId = sel.value || "";
        job.updatedAt = Date.now();
        persist();
      });
    });
  }

  // ---------- Finance ----------
  function renderFinance() {
    const host = $("#view-finance");
    if (!host) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    const label = `${monthName(m)} ${y}`;

    const mJobs = state.jobs.filter(j => {
      const d = new Date(j.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
    });

    const mReceipts = state.receipts.filter(r => {
      const d = new Date(r.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
    });

    const totals = monthTotals(y, m);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Finance</div>
          <div class="panel-sub">Month-to-date snapshot.</div>
        </div>

        <div class="cards">
          <div class="card"><div class="card-title">${escapeHtml(label)} Revenue</div><div class="card-body"><b>${money(totals.revenue)}</b></div></div>
          <div class="card"><div class="card-title">${escapeHtml(label)} Expenses</div><div class="card-body"><b>${money(totals.expenses)}</b></div></div>
          <div class="card"><div class="card-title">${escapeHtml(label)} Net</div><div class="card-body"><b>${money(totals.net)}</b></div></div>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="finExportJobs" class="btn">Export Jobs CSV</button>
          <button id="finExportReceipts" class="btn">Export Receipts CSV</button>
        </div>
      </div>
    `;

    $("#finExportJobs")?.addEventListener("click", () => {
      downloadCsv(`jobs_${y}_${pad2(m+1)}.csv`, mJobs.map(j => ({
        id: j.id, date: j.date, customer: j.customer, pickup: j.pickup, dropoff: j.dropoff,
        status: j.status, amount: clampMoney(j.amount), driverId: j.driverId || "", truckId: j.truckId || "", notes: j.notes || ""
      })));
    });

    $("#finExportReceipts")?.addEventListener("click", () => {
      downloadCsv(`receipts_${y}_${pad2(m+1)}.csv`, mReceipts.map(r => ({
        id: r.id, date: r.date, vendor: r.vendor, category: r.category, amount: clampMoney(r.amount),
        jobId: r.jobId || "", notes: r.notes || ""
      })));
    });
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return alert("Nothing to export yet.");
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      const s = String(v ?? "");
      const needs = /[",\n]/.test(s);
      const safe = s.replaceAll('"', '""');
      return needs ? `"${safe}"` : safe;
    };
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // =========================================================
  // INVENTORY (NEW)
  // =========================================================
  function renderInventory() {
    const host = $("#view-inventory");
    if (!host) return;

    const items = state.inventory
      .slice()
      .sort((a,b) => (a.category||"").localeCompare(b.category||"") || (a.name||"").localeCompare(b.name||""));

    // totals
    const activeItems = items.filter(i => i.active);
    const low = activeItems.filter(i => i.lowStockAt > 0 && i.qty <= i.lowStockAt);
    const byCat = new Map();
    for (const i of activeItems) {
      const k = i.category || "General";
      byCat.set(k, (byCat.get(k) || 0) + 1);
    }
    const cats = Array.from(byCat.entries()).sort((a,b)=>b[1]-a[1]);

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Inventory</div>
          <div class="panel-sub">Supplies + equipment tracking (local). Low-stock alerts included.</div>
        </div>

        <div class="day-totals">
          <div><b>Active items:</b> ${activeItems.length} · <b>Low stock:</b> ${low.length}</div>
          <div>${cats.length ? cats.slice(0,6).map(([k,v]) => `${escapeHtml(k)} ${v}`).join(" · ") : "No categories yet."}</div>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Item name</span>
            <input id="invName" type="text" placeholder="Stretch wrap, Tape, Dollies..." />
          </label>

          <label class="field" style="min-width:160px;">
            <span>Category</span>
            <input id="invCat" type="text" placeholder="Supplies / Equipment" />
          </label>

          <label class="field" style="min-width:120px;">
            <span>Qty</span>
            <input id="invQty" type="number" step="1" value="0" />
          </label>

          <label class="field" style="min-width:120px;">
            <span>Unit</span>
            <input id="invUnit" type="text" placeholder="pcs / rolls" value="pcs" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Location</span>
            <input id="invLoc" type="text" placeholder="Warehouse / Truck 1" />
          </label>

          <label class="field" style="min-width:160px;">
            <span>Condition</span>
            <input id="invCond" type="text" placeholder="New / Good / Needs repair" value="Good" />
          </label>

          <label class="field" style="min-width:140px;">
            <span>Low at</span>
            <input id="invLow" type="number" step="1" value="0" />
          </label>

          <label class="field" style="min-width:200px;">
            <span>Move date (optional)</span>
            <input id="invDate" type="date" />
          </label>

          <label class="field" style="min-width:260px;">
            <span>Notes</span>
            <input id="invNotes" type="text" placeholder="optional" />
          </label>

          <button id="invAddBtn" class="btn primary" type="button">Add Item</button>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${
            items.length ? items.map(it => {
              const isLow = it.active && it.lowStockAt > 0 && it.qty <= it.lowStockAt;
              const badge = isLow ? `<span class="chip chip-receipts" style="margin-left:8px;">LOW</span>` : "";
              const dateLine = it.date ? ` · Date: ${escapeHtml(it.date)}` : "";
              return `
                <div class="job-row" style="${isLow ? "outline:1px solid rgba(255,120,120,.35);" : ""}">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(it.name || "Unnamed Item")}${badge}</div>
                    <div class="job-sub">
                      ${escapeHtml(it.category || "General")} · ${escapeHtml(String(it.qty))} ${escapeHtml(it.unit || "pcs")}
                      · ${escapeHtml(it.location || "—")} · ${escapeHtml(it.condition || "—")}${dateLine}
                    </div>
                    <div class="job-sub muted">${escapeHtml(it.notes || "")}</div>
                    <div class="job-sub muted">ID: ${escapeHtml(it.id)}</div>
                  </div>
                  <div class="job-actions" style="flex-wrap:wrap;">
                    <button class="btn" type="button" data-inv-inc="${escapeHtml(it.id)}">+1</button>
                    <button class="btn" type="button" data-inv-dec="${escapeHtml(it.id)}">-1</button>
                    <button class="btn" type="button" data-inv-edit="${escapeHtml(it.id)}">Edit</button>
                    <button class="btn danger" type="button" data-inv-del="${escapeHtml(it.id)}">Delete</button>
                  </div>
                </div>
              `;
            }).join("") : `<div class="muted">No inventory items yet.</div>`
          }
        </div>
      </div>
    `;

    $("#invAddBtn")?.addEventListener("click", () => {
      const name = ($("#invName")?.value || "").trim();
      const category = ($("#invCat")?.value || "General").trim() || "General";
      const qty = Number($("#invQty")?.value ?? 0);
      const unit = ($("#invUnit")?.value || "pcs").trim() || "pcs";
      const location = ($("#invLoc")?.value || "").trim();
      const condition = ($("#invCond")?.value || "Good").trim() || "Good";
      const lowStockAt = Number($("#invLow")?.value ?? 0);
      const date = ($("#invDate")?.value || "").trim();
      const notes = ($("#invNotes")?.value || "").trim();

      if (!name) return alert("Item name is required.");

      state.inventory.push(normalizeInvItem({
        name, category,
        qty: Number.isFinite(qty) ? qty : 0,
        unit, location, condition,
        lowStockAt: Number.isFinite(lowStockAt) ? lowStockAt : 0,
        date, notes,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      persist();
      renderAll();
    });

    $$("[data-inv-inc]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-inc");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;
        it.qty = Number(it.qty || 0) + 1;
        it.updatedAt = Date.now();
        persist();
        renderInventory();
      });
    });

    $$("[data-inv-dec]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-dec");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;
        it.qty = Math.max(0, Number(it.qty || 0) - 1);
        it.updatedAt = Date.now();
        persist();
        renderInventory();
      });
    });

    $$("[data-inv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-del");
        if (!id) return;
        if (!confirm("Delete this inventory item?")) return;
        state.inventory = state.inventory.filter(x => x.id !== id);
        persist();
        renderAll();
      });
    });

    $$("[data-inv-edit]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-inv-edit");
        const it = state.inventory.find(x => x.id === id);
        if (!it) return;

        const name = prompt("Item name:", it.name || "");
        if (name === null) return;
        const category = prompt("Category:", it.category || "General");
        if (category === null) return;
        const qty = prompt("Qty:", String(it.qty ?? 0));
        if (qty === null) return;
        const unit = prompt("Unit:", it.unit || "pcs");
        if (unit === null) return;
        const location = prompt("Location:", it.location || "");
        if (location === null) return;
        const condition = prompt("Condition:", it.condition || "Good");
        if (condition === null) return;
        const lowAt = prompt("Low stock at:", String(it.lowStockAt ?? 0));
        if (lowAt === null) return;
        const date = prompt("Move date (YYYY-MM-DD) or empty:", it.date || "");
        if (date === null) return;
        const notes = prompt("Notes:", it.notes || "");
        if (notes === null) return;

        it.name = name.trim();
        it.category = (category.trim() || "General");
        it.qty = Number.isFinite(Number(qty)) ? Number(qty) : 0;
        it.unit = (unit.trim() || "pcs");
        it.location = location.trim();
        it.condition = (condition.trim() || "Good");
        it.lowStockAt = Number.isFinite(Number(lowAt)) ? Number(lowAt) : 0;
        it.date = date.trim();
        it.notes = notes.trim();
        it.updatedAt = Date.now();

        persist();
        renderAll();
      });
    });
  }

  // =========================================================
  // AI SCANNER (NEW)
  // =========================================================
  function renderScanner() {
    const host = $("#view-scanner");
    if (!host) return;

    // choose active scan
    if (!state.activeScanId && state.scans.length) state.activeScanId = state.scans[0].id;
    const active = state.scans.find(s => s.id === state.activeScanId) || null;

    const jobOptions = [
      `<option value="">(Not linked)</option>`,
      ...state.jobs
        .slice()
        .sort((a,b) => (a.date||"").localeCompare(b.date||""))
        .map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.date)} · ${escapeHtml(j.customer || "Customer")}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">AI Scanner</div>
          <div class="panel-sub">Upload photos/videos per job. Tag items now, wire real AI later.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:200px;">
            <span>Date</span>
            <input id="scanDate" type="date" value="${escapeHtml(active?.date || ymd(startOfDay(new Date())))}" />
          </label>

          <label class="field" style="min-width:260px;">
            <span>Customer (optional)</span>
            <input id="scanCustomer" type="text" value="${escapeHtml(active?.customer || "")}" placeholder="Customer name" />
          </label>

          <label class="field" style="min-width:260px;">
            <span>Link to Job (optional)</span>
            <select id="scanJobId">${jobOptions}</select>
          </label>

          <label class="field" style="min-width:320px;">
            <span>Notes</span>
            <input id="scanNotes" type="text" value="${escapeHtml(active?.notes || "")}" placeholder="Anything important..." />
          </label>

          <button id="scanNewBtn" class="btn primary" type="button">New Scan Session</button>
          <button id="scanExportBtn" class="btn" type="button">Export Session CSV</button>
        </div>

        <div class="panel-spacer"></div>

        <div class="day-totals">
          <div><b>Sessions:</b> ${state.scans.length} · <b>Active:</b> ${escapeHtml(active?.id || "none")}</div>
          <div class="muted">Tip: Use this to collect media now. AI estimation will plug into this exact structure later.</div>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:start;">
          <div style="flex:1; min-width:280px;">
            <div class="muted" style="margin-bottom:8px; font-weight:800;">Sessions</div>
            <div id="scanList" style="display:flex; flex-direction:column; gap:10px;"></div>
          </div>

          <div style="flex:2; min-width:320px;">
            <div class="muted" style="margin-bottom:8px; font-weight:800;">Uploads</div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
              <label class="field" style="min-width:260px;">
                <span>Upload photos/videos</span>
                <input id="scanFiles" type="file" accept="image/*,video/*" multiple />
              </label>
              <button id="scanClearUploads" class="btn danger" type="button">Clear Upload List</button>
            </div>

            <div id="scanUploads" style="margin-top:10px; display:flex; flex-direction:column; gap:10px;"></div>

            <div class="panel-spacer"></div>

            <div class="muted" style="margin-bottom:8px; font-weight:800;">Item Tags (manual now, AI later)</div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
              <label class="field" style="min-width:220px;">
                <span>Item label</span>
                <input id="tagLabel" type="text" placeholder="Couch, Bed, Boxes..." />
              </label>
              <label class="field" style="min-width:120px;">
                <span>Qty</span>
                <input id="tagQty" type="number" step="1" value="1" />
              </label>
              <button id="tagAddBtn" class="btn primary" type="button">Add Tag</button>
            </div>

            <div id="tagList" style="margin-top:10px; display:flex; flex-direction:column; gap:10px;"></div>
          </div>
        </div>
      </div>
    `;

    // set job select
    if ($("#scanJobId")) $("#scanJobId").value = active?.jobId || "";

    // render session list
    const list = $("#scanList");
    if (list) {
      list.innerHTML = state.scans
        .slice()
        .sort((a,b)=> (b.updatedAt||0)-(a.updatedAt||0))
        .map(s => {
          const isActive = s.id === state.activeScanId;
          const tagCount = (s.tags || []).reduce((sum,t)=>sum + Number(t.qty||0), 0);
          const fileCount = (s.files || []).length;
          return `
            <div class="job-row" style="${isActive ? "outline:2px solid rgba(120,160,255,.45);" : ""}">
              <div class="job-main">
                <div class="job-title">${escapeHtml(s.date)} ${s.customer ? `· ${escapeHtml(s.customer)}` : ""}</div>
                <div class="job-sub">Files: ${fileCount} · Tagged items: ${tagCount}</div>
                <div class="job-sub muted">ID: ${escapeHtml(s.id)}</div>
              </div>
              <div class="job-actions">
                <button class="btn" type="button" data-scan-open="${escapeHtml(s.id)}">Open</button>
                <button class="btn danger" type="button" data-scan-del="${escapeHtml(s.id)}">Delete</button>
              </div>
            </div>
          `;
        }).join("");
    }

    // render uploads metadata
    renderScanUploads(active);

    // render tags
    renderScanTags(active);

    // --- Bind: open session ---
    $$("[data-scan-open]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-scan-open");
        state.activeScanId = id;
        persist();
        renderAll();
      });
    });

    // --- Bind: delete session ---
    $$("[data-scan-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-scan-del");
        if (!id) return;
        if (!confirm("Delete this scan session?")) return;
        state.scans = state.scans.filter(s => s.id !== id);
        if (state.activeScanId === id) state.activeScanId = state.scans[0]?.id || null;
        persist();
        renderAll();
      });
    });

    // --- Bind: create new session ---
    $("#scanNewBtn")?.addEventListener("click", () => {
      const s = normalizeScan({
        date: ymd(startOfDay(new Date())),
        customer: "",
        jobId: "",
        notes: "",
        files: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      state.scans.unshift(s);
      state.activeScanId = s.id;
      persist();
      renderAll();
    });

    // --- Bind: update header fields ---
    const updateActive = () => {
      const a = state.scans.find(s => s.id === state.activeScanId);
      if (!a) return;

      a.date = ($("#scanDate")?.value || a.date).trim() || a.date;
      a.customer = ($("#scanCustomer")?.value || "").trim();
      a.jobId = ($("#scanJobId")?.value || "").trim();
      a.notes = ($("#scanNotes")?.value || "").trim();
      a.updatedAt = Date.now();
      persist();
    };

    $("#scanDate")?.addEventListener("change", () => { updateActive(); renderAll(); });
    $("#scanCustomer")?.addEventListener("input", () => updateActive());
    $("#scanJobId")?.addEventListener("change", () => { updateActive(); renderAll(); });
    $("#scanNotes")?.addEventListener("input", () => updateActive());

    // --- Bind: uploads ---
    $("#scanFiles")?.addEventListener("change", (e) => {
      const a = state.scans.find(s => s.id === state.activeScanId);
      if (!a) return;

      const files = Array.from(e.target.files || []);
      for (const f of files) {
        a.files.push({
          name: f.name,
          type: f.type,
          size: f.size,
          addedAt: Date.now(),
        });
      }
      a.updatedAt = Date.now();
      persist();

      // session previews for current page (not stored)
      renderScanUploads(a, files);

      // reset input
      e.target.value = "";
    });

    $("#scanClearUploads")?.addEventListener("click", () => {
      const a = state.scans.find(s => s.id === state.activeScanId);
      if (!a) return;
      if (!confirm("Clear ALL upload entries for this session?")) return;
      a.files = [];
      a.updatedAt = Date.now();
      persist();
      renderAll();
    });

    // --- Bind: tags ---
    $("#tagAddBtn")?.addEventListener("click", () => {
      const a = state.scans.find(s => s.id === state.activeScanId);
      if (!a) return;

      const label = ($("#tagLabel")?.value || "").trim();
      const qty = Number($("#tagQty")?.value ?? 1);

      if (!label) return alert("Tag label is required.");
      const q = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;

      // merge same label
      const existing = a.tags.find(t => (t.label || "").toLowerCase() === label.toLowerCase());
      if (existing) {
        existing.qty = Number(existing.qty || 0) + q;
      } else {
        a.tags.push({ label, qty: q });
      }

      a.updatedAt = Date.now();
      persist();
      renderAll();
    });

    // --- Export session CSV ---
    $("#scanExportBtn")?.addEventListener("click", () => {
      const a = state.scans.find(s => s.id === state.activeScanId);
      if (!a) return alert("No active scan session.");

      const rows = [
        { section: "session", key: "id", value: a.id },
        { section: "session", key: "date", value: a.date },
        { section: "session", key: "customer", value: a.customer || "" },
        { section: "session", key: "jobId", value: a.jobId || "" },
        { section: "session", key: "notes", value: a.notes || "" },
        { section: "counts", key: "files", value: (a.files || []).length },
        { section: "counts", key: "tags_total_qty", value: (a.tags || []).reduce((s,t)=>s+Number(t.qty||0), 0) },
        ...((a.files || []).map((f, idx) => ({
          section: "file",
          key: `file_${idx+1}`,
          value: `${f.name} | ${f.type} | ${f.size} bytes`
        }))),
        ...((a.tags || []).map((t, idx) => ({
          section: "tag",
          key: `tag_${idx+1}`,
          value: `${t.label} x${t.qty}`
        }))),
      ];

      downloadCsv(`scan_session_${a.date}_${a.id}.csv`, rows);
    });
  }

  function renderScanUploads(active, sessionFilesJustSelected = []) {
    const box = $("#scanUploads");
    if (!box) return;

    if (!active) {
      box.innerHTML = `<div class="muted">No active scan session.</div>`;
      return;
    }

    // We can preview ONLY files selected this time (browser security).
    // Persistent files are stored as metadata only.
    const previews = sessionFilesJustSelected || [];

    box.innerHTML = `
      <div class="day-totals">
        <div><b>Stored file entries:</b> ${(active.files || []).length}</div>
        <div class="muted">Note: previews only appear for files you just selected (browser limitation).</div>
      </div>

      ${
        previews.length
          ? `<div style="display:flex; flex-direction:column; gap:10px;">
              ${previews.map(f => {
                const url = URL.createObjectURL(f);
                const isVideo = (f.type || "").startsWith("video/");
                const preview = isVideo
                  ? `<video controls style="width:100%; border-radius:14px; border:1px solid rgba(255,255,255,.10);"><source src="${url}" type="${escapeHtml(f.type)}"></video>`
                  : `<img src="${url}" alt="${escapeHtml(f.name)}" style="width:100%; border-radius:14px; border:1px solid rgba(255,255,255,.10);" />`;
                return `
                  <div class="panel" style="margin-bottom:0;">
                    <div class="panel-header">
                      <div class="panel-title" style="font-size:14px;">Preview: ${escapeHtml(f.name)}</div>
                      <div class="panel-sub">${escapeHtml(f.type)} · ${escapeHtml(String(f.size))} bytes</div>
                    </div>
                    ${preview}
                  </div>
                `;
              }).join("")}
            </div>`
          : `<div class="muted">Upload images/videos to preview them here.</div>`
      }
    `;
  }

  function renderScanTags(active) {
    const box = $("#tagList");
    if (!box) return;

    if (!active) {
      box.innerHTML = `<div class="muted">No active scan session.</div>`;
      return;
    }

    const tags = (active.tags || []).slice().sort((a,b)=>(a.label||"").localeCompare(b.label||""));

    const totalQty = tags.reduce((s,t)=>s+Number(t.qty||0), 0);

    box.innerHTML = `
      <div class="day-totals">
        <div><b>Tagged items:</b> ${tags.length} · <b>Total qty:</b> ${totalQty}</div>
        <div class="muted">These tags are what we’ll later feed into AI estimates.</div>
      </div>

      ${
        tags.length
          ? `<div style="display:flex; flex-direction:column; gap:10px;">
              ${tags.map(t => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(t.label)}</div>
                    <div class="job-sub">Qty: ${escapeHtml(String(t.qty))}</div>
                  </div>
                  <div class="job-actions">
                    <button class="btn" type="button" data-tag-inc="${escapeHtml(t.label)}">+1</button>
                    <button class="btn" type="button" data-tag-dec="${escapeHtml(t.label)}">-1</button>
                    <button class="btn danger" type="button" data-tag-del="${escapeHtml(t.label)}">Delete</button>
                  </div>
                </div>
              `).join("")}
            </div>`
          : `<div class="muted">No tags yet. Add “Couch x1”, “Boxes x20”, etc.</div>`
      }
    `;

    $$("[data-tag-inc]").forEach(btn => {
      btn.addEventListener("click", () => {
        const label = btn.getAttribute("data-tag-inc") || "";
        const a = state.scans.find(s => s.id === state.activeScanId);
        if (!a) return;
        const t = a.tags.find(x => (x.label||"") === label);
        if (!t) return;
        t.qty = Number(t.qty || 0) + 1;
        a.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-tag-dec]").forEach(btn => {
      btn.addEventListener("click", () => {
        const label = btn.getAttribute("data-tag-dec") || "";
        const a = state.scans.find(s => s.id === state.activeScanId);
        if (!a) return;
        const t = a.tags.find(x => (x.label||"") === label);
        if (!t) return;
        t.qty = Math.max(1, Number(t.qty || 0) - 1);
        a.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-tag-del]").forEach(btn => {
      btn.addEventListener("click", () => {
        const label = btn.getAttribute("data-tag-del") || "";
        const a = state.scans.find(s => s.id === state.activeScanId);
        if (!a) return;
        if (!confirm(`Delete tag "${label}"?`)) return;
        a.tags = a.tags.filter(x => (x.label||"") !== label);
        a.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });
  }

  // ---------- Render All ----------
  function renderAll() {
    const ds = ymd(state.currentDate);
    if ($("#contextLine")) {
      $("#contextLine").textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${ds}` :
        state.view.charAt(0).toUpperCase() + state.view.slice(1);
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
  }

  // ---------- Navigation ----------
  function bindNav() {
    $$(".nav-item[data-view]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        setView(btn.dataset.view);
      });
    });

    $("#btnToday")?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      state.dispatchDate = ymd(state.currentDate);
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar" || state.view === "finance") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        state.dispatchDate = ymd(state.currentDate);
      }
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar" || state.view === "finance") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        state.dispatchDate = ymd(state.currentDate);
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
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = startOfDay(now);
      state.dispatchDate = ymd(state.currentDate);
      renderAll();
    });

    // Your buttons exist, but modal wiring is next milestone (not required for Inventory/Scanner)
    $("#btnAddJob")?.addEventListener("click", () => alert("Add Job modal wiring can be added next."));
    $("#btnAddReceipt")?.addEventListener("click", () => alert("Add Receipt modal wiring can be added next."));
  }

  // ---------- Boot ----------
  function init() {
    try {
      seedIfEmpty();

      // normalize saved data
      state.jobs = state.jobs.map(normalizeJob);
      state.receipts = state.receipts.map(normalizeReceipt);
      state.drivers = state.drivers.map(normalizeDriver);
      state.trucks = state.trucks.map(normalizeTruck);
      state.inventory = state.inventory.map(normalizeInvItem);
      state.scans = state.scans.map(normalizeScan);

      persist();
      cleanSidebarLabels();
      bindNav();

      setPill(true, "JS: ready ✅");
      setView("dashboard");
    } catch (e) {
      console.error(e);
      setPill(false, "JS: error ❌");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
