/* =========================================================
   Move-Master.OS — mm_app_002.js (FULL)
   Adds: Drivers + Trucks + Dispatch (assignment + scheduling)
   ---------------------------------------------------------
   Works with your posted HTML as-is:
   - Sidebar nav buttons: .nav-item[data-view]
   - Views: #view-dashboard, #view-calendar, #view-day,
            #view-drivers, #view-trucks, #view-dispatch, etc.
   - Modals: #jobModal, #receiptModal, #modalOverlay
   - Pill: #jsPill

   New:
   - Drivers module (add/edit/delete + active toggle)
   - Trucks module (add/edit/delete + active toggle)
   - Dispatch module:
       - Shows jobs for selected date
       - Assign driver + truck (dropdowns)
       - Quick status update
       - Links back to Day Workspace
   - Adds driverId/truckId fields onto jobs (persisted)

   Storage:
   - localStorage: mm_jobs_v6, mm_receipts_v6, mm_drivers_v1, mm_trucks_v1
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
  const LS_JOBS     = "mm_jobs_v6";
  const LS_RECEIPTS = "mm_receipts_v6";
  const LS_DRIVERS  = "mm_drivers_v1";
  const LS_TRUCKS   = "mm_trucks_v1";

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

    // NEW (Dispatch assignment)
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
    dr.role = (dr.role || "Driver").trim(); // Driver / Helper / Lead, etc.
    dr.active = typeof dr.active === "boolean" ? dr.active : true;
    if (!dr.createdAt) dr.createdAt = Date.now();
    dr.updatedAt = dr.updatedAt || dr.createdAt;
    return dr;
  }

  function normalizeTruck(t) {
    const tr = { ...(t || {}) };
    if (!tr.id) tr.id = makeId("trk");
    tr.label = (tr.label || "").trim();      // "Truck 1", "26ft Box", etc.
    tr.plate = (tr.plate || "").trim();
    tr.capacity = (tr.capacity || "").trim(); // optional string for now
    tr.active = typeof tr.active === "boolean" ? tr.active : true;
    if (!tr.createdAt) tr.createdAt = Date.now();
    tr.updatedAt = tr.updatedAt || tr.createdAt;
    return tr;
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

    editingJobId: null,
    editingReceiptId: null,

    // Dispatch UI state
    dispatchDate: ymd(startOfDay(new Date())),
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_DRIVERS, state.drivers);
    saveArray(LS_TRUCKS, state.trucks);
  }

  // ---------- Seed (so you can demo immediately) ----------
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
        notes: "Seed job to prove dispatch assignment works",
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

  // ---------- Router ----------
  function setView(name) {
    if (!VIEWS.includes(name)) name = "dashboard";
    state.view = name;

    $$(".view").forEach(v => v.classList.remove("active"));
    $(`#view-${name}`)?.classList.add("active");

    $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
  }

  // ---------- Render: Dashboard ----------
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

  // ---------- Render: Full Calendar ----------
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

      if (dayJobs.some(j => j.status === STATUS.completed)) cell.classList.add("has-completed");
      if (dayJobs.some(j => j.status === STATUS.scheduled)) cell.classList.add("has-scheduled");
      if (dayJobs.some(j => j.status === STATUS.cancelled)) cell.classList.add("has-cancelled");
      if (rc) cell.classList.add("has-receipts");

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

  // ---------- Render: Day Workspace ----------
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
      if (job.status === STATUS.completed) row.classList.add("is-completed");
      if (job.status === STATUS.cancelled) row.classList.add("is-cancelled");

      const driverName = job.driverId ? (state.drivers.find(d => d.id === job.driverId)?.name || "Unknown") : "Unassigned";
      const truckName  = job.truckId ? (state.trucks.find(t => t.id === job.truckId)?.label || "Unknown") : "Unassigned";

      row.innerHTML = `
        <div class="job-main">
          <div class="job-title">${escapeHtml(job.customer || "Customer")}</div>
          <div class="job-sub">${escapeHtml(job.pickup || "Pickup")} → ${escapeHtml(job.dropoff || "Dropoff")} · ${money(job.amount)}</div>
          <div class="job-sub">Driver: ${escapeHtml(driverName)} · Truck: ${escapeHtml(truckName)}</div>
        </div>
        <div class="job-actions">
          <select class="job-status" data-job-status="${escapeHtml(job.id)}">
            <option value="scheduled" ${job.status===STATUS.scheduled?"selected":""}>Scheduled</option>
            <option value="completed" ${job.status===STATUS.completed?"selected":""}>Completed</option>
            <option value="cancelled" ${job.status===STATUS.cancelled?"selected":""}>Cancelled</option>
          </select>
          <button class="btn" type="button" data-job-edit="${escapeHtml(job.id)}">Edit</button>
          <button class="btn danger" type="button" data-job-del="${escapeHtml(job.id)}">Delete</button>
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

    $$("[data-job-edit]", list).forEach(btn => {
      btn.addEventListener("click", () => openJobModal(btn.getAttribute("data-job-edit")));
    });

    $$("[data-job-del]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-job-del");
        if (!id) return;
        if (!confirm("Delete this job?")) return;
        state.jobs = state.jobs.filter(j => j.id !== id);
        state.receipts = state.receipts.map(r => (r.jobId===id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r));
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
        <div class="receipt-actions">
          <button class="btn" type="button" data-rcpt-edit="${escapeHtml(r.id)}">Edit</button>
          <button class="btn danger" type="button" data-rcpt-del="${escapeHtml(r.id)}">Delete</button>
        </div>
      `;
      list.appendChild(row);
    }

    $$("[data-rcpt-edit]", list).forEach(btn => {
      btn.addEventListener("click", () => openReceiptModal(btn.getAttribute("data-rcpt-edit")));
    });

    $$("[data-rcpt-del]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-rcpt-del");
        if (!id) return;
        if (!confirm("Delete this receipt?")) return;
        state.receipts = state.receipts.filter(r => r.id !== id);
        persist();
        renderAll();
      });
    });
  }

  // ---------- Render: Drivers ----------
  function renderDrivers() {
    const host = $("#view-drivers");
    if (!host) return;

    const drivers = state.drivers.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||""));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Add and manage your driver roster. Used by Dispatch assignments.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Name</span>
            <input id="drvName" type="text" placeholder="Driver name" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Phone</span>
            <input id="drvPhone" type="text" placeholder="(optional)" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Role</span>
            <input id="drvRole" type="text" placeholder="Driver / Lead / Helper" />
          </label>
          <button id="drvAddBtn" class="btn primary" type="button">Add Driver</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            drivers.length ? drivers.map(d => `
              <div class="job-row">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(d.name || "Unnamed Driver")}</div>
                  <div class="job-sub">${escapeHtml(d.role || "Driver")} · ${escapeHtml(d.phone || "")}</div>
                </div>
                <div class="job-actions">
                  <label style="display:flex; align-items:center; gap:8px; font-size:12px; opacity:.9;">
                    <input type="checkbox" data-drv-active="${escapeHtml(d.id)}" ${d.active ? "checked" : ""}/>
                    Active
                  </label>
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
      if (!name) return alert("Driver name is required.");

      state.drivers.push(normalizeDriver({ id: makeId("drv"), name, phone, role, active: true }));
      persist();
      renderAll();
    });

    $$("[data-drv-active]", host).forEach(chk => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-drv-active");
        const d = state.drivers.find(x => x.id === id);
        if (!d) return;
        d.active = chk.checked;
        d.updatedAt = Date.now();
        persist();
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
        const role = prompt("Role:", d.role || "Driver");
        if (role === null) return;

        d.name = name.trim();
        d.phone = phone.trim();
        d.role = (role.trim() || "Driver");
        d.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-drv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-del");
        if (!id) return;
        if (!confirm("Delete this driver? Jobs assigned to them will become unassigned.")) return;

        state.drivers = state.drivers.filter(d => d.id !== id);
        state.jobs = state.jobs.map(j => j.driverId === id ? normalizeJob({ ...j, driverId:"", updatedAt:Date.now() }) : j);
        persist();
        renderAll();
      });
    });
  }

  // ---------- Render: Trucks ----------
  function renderTrucks() {
    const host = $("#view-trucks");
    if (!host) return;

    const trucks = state.trucks.slice().sort((a,b)=> (a.label||"").localeCompare(b.label||""));

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Add and manage fleet vehicles. Used by Dispatch assignments.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Label</span>
            <input id="trkLabel" type="text" placeholder="Truck 1 (26ft)" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Plate</span>
            <input id="trkPlate" type="text" placeholder="(optional)" />
          </label>
          <label class="field" style="min-width:160px;">
            <span>Capacity</span>
            <input id="trkCap" type="text" placeholder="26ft / 16ft / etc." />
          </label>
          <button id="trkAddBtn" class="btn primary" type="button">Add Truck</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            trucks.length ? trucks.map(t => `
              <div class="job-row">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(t.label || "Unnamed Truck")}</div>
                  <div class="job-sub">${escapeHtml(t.capacity || "")} · ${escapeHtml(t.plate || "")}</div>
                </div>
                <div class="job-actions">
                  <label style="display:flex; align-items:center; gap:8px; font-size:12px; opacity:.9;">
                    <input type="checkbox" data-trk-active="${escapeHtml(t.id)}" ${t.active ? "checked" : ""}/>
                    Active
                  </label>
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
      if (!label) return alert("Truck label is required.");

      state.trucks.push(normalizeTruck({ id: makeId("trk"), label, plate, capacity, active: true }));
      persist();
      renderAll();
    });

    $$("[data-trk-active]", host).forEach(chk => {
      chk.addEventListener("change", () => {
        const id = chk.getAttribute("data-trk-active");
        const t = state.trucks.find(x => x.id === id);
        if (!t) return;
        t.active = chk.checked;
        t.updatedAt = Date.now();
        persist();
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

        t.label = label.trim();
        t.plate = plate.trim();
        t.capacity = cap.trim();
        t.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-trk-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-del");
        if (!id) return;
        if (!confirm("Delete this truck? Jobs assigned to it will become unassigned.")) return;

        state.trucks = state.trucks.filter(t => t.id !== id);
        state.jobs = state.jobs.map(j => j.truckId === id ? normalizeJob({ ...j, truckId:"", updatedAt:Date.now() }) : j);
        persist();
        renderAll();
      });
    });
  }

  // ---------- Render: Dispatch ----------
  function renderDispatch() {
    const host = $("#view-dispatch");
    if (!host) return;

    const ds = (state.dispatchDate || ymd(state.currentDate));
    const jobs = jobsByDate(ds).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));

    const activeDrivers = state.drivers.filter(d => d.active);
    const activeTrucks = state.trucks.filter(t => t.active);

    const driverOptions = [
      `<option value="">(Unassigned)</option>`,
      ...activeDrivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
    ].join("");

    const truckOptions = [
      `<option value="">(Unassigned)</option>`,
      ...activeTrucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
    ].join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Assign drivers + trucks to jobs by date.</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:220px;">
            <span>Date</span>
            <input id="dispatchDate" type="date" value="${escapeHtml(ds)}" />
          </label>
          <button id="dispatchOpenDay" class="btn" type="button">Open Day Workspace</button>
        </div>

        <div class="panel-spacer"></div>

        <div class="day-totals">
          <div><b>${escapeHtml(ds)}</b></div>
          <div>Jobs: ${jobs.length} · Revenue: ${money(sumRevenue(ds))} · Expenses: ${money(sumExpenses(ds))}</div>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
          ${
            jobs.length ? jobs.map(j => {
              const driverName = j.driverId ? (state.drivers.find(d => d.id === j.driverId)?.name || "Unknown") : "";
              const truckName  = j.truckId ? (state.trucks.find(t => t.id === j.truckId)?.label || "Unknown") : "";
              return `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(j.customer || "Customer")}</div>
                    <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")} · ${money(j.amount)}</div>
                    <div class="job-sub muted">Driver: ${escapeHtml(driverName || "Unassigned")} · Truck: ${escapeHtml(truckName || "Unassigned")}</div>
                  </div>

                  <div class="job-actions" style="flex-wrap:wrap; justify-content:flex-end;">
                    <select data-dispatch-driver="${escapeHtml(j.id)}" class="job-status" style="min-width:160px;">
                      ${driverOptions}
                    </select>

                    <select data-dispatch-truck="${escapeHtml(j.id)}" class="job-status" style="min-width:170px;">
                      ${truckOptions}
                    </select>

                    <select data-dispatch-status="${escapeHtml(j.id)}" class="job-status">
                      <option value="scheduled" ${j.status===STATUS.scheduled?"selected":""}>Scheduled</option>
                      <option value="completed" ${j.status===STATUS.completed?"selected":""}>Completed</option>
                      <option value="cancelled" ${j.status===STATUS.cancelled?"selected":""}>Cancelled</option>
                    </select>
                  </div>
                </div>
              `;
            }).join("") : `<div class="muted">No jobs on this date. Add one from “Add Job”.</div>`
          }
        </div>
      </div>
    `;

    // Preselect current assignments
    $$("[data-dispatch-driver]", host).forEach(sel => {
      const jobId = sel.getAttribute("data-dispatch-driver");
      const j = state.jobs.find(x => x.id === jobId);
      if (!j) return;
      sel.value = j.driverId || "";
      sel.addEventListener("change", () => {
        j.driverId = sel.value || "";
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-dispatch-truck]", host).forEach(sel => {
      const jobId = sel.getAttribute("data-dispatch-truck");
      const j = state.jobs.find(x => x.id === jobId);
      if (!j) return;
      sel.value = j.truckId || "";
      sel.addEventListener("change", () => {
        j.truckId = sel.value || "";
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $$("[data-dispatch-status]", host).forEach(sel => {
      const jobId = sel.getAttribute("data-dispatch-status");
      const j = state.jobs.find(x => x.id === jobId);
      if (!j) return;
      sel.value = j.status || STATUS.scheduled;
      sel.addEventListener("change", () => {
        const val = sel.value;
        j.status = STATUS_LABEL[val] ? val : STATUS.scheduled;
        j.updatedAt = Date.now();
        persist();
        renderAll();
      });
    });

    $("#dispatchDate")?.addEventListener("change", (e) => {
      state.dispatchDate = (e.target.value || ymd(state.currentDate));
      renderAll();
    });

    $("#dispatchOpenDay")?.addEventListener("click", () => {
      const d = fromYmd(state.dispatchDate);
      state.currentDate = d;
      state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
      setView("day");
    });
  }

  // ---------- Modal helpers ----------
  function showOverlay(show) {
    const ov = $("#modalOverlay");
    if (ov) ov.hidden = !show;
  }

  function closeJobModal() {
    showOverlay(false);
    const m = $("#jobModal");
    if (m) { m.hidden = true; m.setAttribute("aria-hidden","true"); }
    state.editingJobId = null;
  }

  function closeReceiptModal() {
    showOverlay(false);
    const m = $("#receiptModal");
    if (m) { m.hidden = true; m.setAttribute("aria-hidden","true"); }
    state.editingReceiptId = null;
  }

  // ---------- Inject Driver/Truck selects into Job modal (NO HTML edits required) ----------
  function ensureJobAssignFields() {
    const body = $("#jobModal .modal-body");
    if (!body) return;

    // If already injected, don’t duplicate
    if ($("#jobDriverId") && $("#jobTruckId")) return;

    const wrap = document.createElement("div");
    wrap.id = "__jobAssignFields";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "1fr 1fr";
    wrap.style.gap = "10px";

    wrap.innerHTML = `
      <label class="field">
        <span>Driver (optional)</span>
        <select id="jobDriverId"></select>
      </label>

      <label class="field">
        <span>Truck (optional)</span>
        <select id="jobTruckId"></select>
      </label>
    `;

    // Insert before Notes if possible
    const notes = $("#jobNotes")?.closest?.(".field");
    if (notes && notes.parentElement === body) {
      body.insertBefore(wrap, notes);
    } else {
      body.appendChild(wrap);
    }
  }

  function fillJobAssignOptions(selectedDriverId, selectedTruckId) {
    const dSel = $("#jobDriverId");
    const tSel = $("#jobTruckId");
    if (!dSel || !tSel) return;

    const drivers = state.drivers.filter(d => d.active);
    const trucks = state.trucks.filter(t => t.active);

    dSel.innerHTML = [
      `<option value="">(Unassigned)</option>`,
      ...drivers.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
    ].join("");

    tSel.innerHTML = [
      `<option value="">(Unassigned)</option>`,
      ...trucks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
    ].join("");

    dSel.value = selectedDriverId || "";
    tSel.value = selectedTruckId || "";
  }

  // ---------- Job modal ----------
  function openJobModal(jobId = null) {
    const modal = $("#jobModal");
    if (!modal) return;

    ensureJobAssignFields();

    const isEdit = Boolean(jobId);
    state.editingJobId = jobId;

    $("#jobModalTitle") && ($("#jobModalTitle").textContent = isEdit ? "Edit Job" : "Add Job");

    const job = isEdit ? state.jobs.find(j => j.id === jobId) : null;

    $("#jobDate").value = (job?.date || ymd(state.currentDate));
    $("#jobCustomer").value = (job?.customer || "");
    $("#jobPickup").value = (job?.pickup || "");
    $("#jobDropoff").value = (job?.dropoff || "");
    $("#jobAmount").value = String(job?.amount ?? 0);
    $("#jobNotes").value = (job?.notes || "");
    $("#jobStatus").value = (job?.status || STATUS.scheduled);

    fillJobAssignOptions(job?.driverId || "", job?.truckId || "");

    const del = $("#jobDelete");
    if (del) del.hidden = !isEdit;

    const err = $("#jobError");
    if (err) { err.hidden = true; err.textContent = ""; }

    showOverlay(true);
    modal.hidden = false;
    modal.setAttribute("aria-hidden","false");
  }

  function saveJobFromModal() {
    const err = $("#jobError");
    const fail = (msg) => { if (err) { err.textContent = msg; err.hidden = false; } };

    const date = ($("#jobDate")?.value || "").trim();
    const customer = ($("#jobCustomer")?.value || "").trim();
    const pickup = ($("#jobPickup")?.value || "").trim();
    const dropoff = ($("#jobDropoff")?.value || "").trim();
    const amount = clampMoney($("#jobAmount")?.value ?? 0);
    const status = ($("#jobStatus")?.value || STATUS.scheduled).trim();
    const notes = ($("#jobNotes")?.value || "").trim();

    const driverId = ($("#jobDriverId")?.value || "").trim();
    const truckId  = ($("#jobTruckId")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!customer) return fail("Customer is required.");
    if (amount < 0) return fail("Amount cannot be negative.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingJobId) {
      const j = state.jobs.find(x => x.id === state.editingJobId);
      if (!j) return fail("Could not find that job.");
      j.date = date; j.customer = customer; j.pickup = pickup; j.dropoff = dropoff;
      j.amount = amount; j.status = STATUS_LABEL[status] ? status : STATUS.scheduled;
      j.notes = notes;
      j.driverId = driverId;
      j.truckId = truckId;
      j.updatedAt = Date.now();
    } else {
      state.jobs.push(normalizeJob({
        id: makeId("job"),
        date, customer, pickup, dropoff, amount,
        status: STATUS_LABEL[status] ? status : STATUS.scheduled,
        notes,
        driverId,
        truckId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    }

    persist();
    closeJobModal();
    const d = fromYmd(date);
    state.currentDate = d;
    state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
    setView("day");
  }

  function deleteJobFromModal() {
    const id = state.editingJobId;
    if (!id) return;
    if (!confirm("Delete this job?")) return;

    state.jobs = state.jobs.filter(j => j.id !== id);
    state.receipts = state.receipts.map(r => (r.jobId===id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r));

    persist();
    closeJobModal();
    renderAll();
  }

  // ---------- Receipt modal ----------
  function openReceiptModal(receiptId = null) {
    const modal = $("#receiptModal");
    if (!modal) return;

    const isEdit = Boolean(receiptId);
    state.editingReceiptId = receiptId;

    $("#receiptModalTitle") && ($("#receiptModalTitle").textContent = isEdit ? "Edit Receipt" : "Add Receipt");

    const rec = isEdit ? state.receipts.find(r => r.id === receiptId) : null;

    $("#receiptDate").value = (rec?.date || ymd(state.currentDate));
    $("#receiptVendor").value = (rec?.vendor || "");
    $("#receiptCategory").value = (rec?.category || "");
    $("#receiptAmount").value = String(rec?.amount ?? 0);
    $("#receiptLinkedJobId").value = (rec?.jobId || "");
    $("#receiptNotes").value = (rec?.notes || "");

    const del = $("#receiptDelete");
    if (del) del.hidden = !isEdit;

    const err = $("#receiptError");
    if (err) { err.hidden = true; err.textContent = ""; }

    showOverlay(true);
    modal.hidden = false;
    modal.setAttribute("aria-hidden","false");
  }

  function saveReceiptFromModal() {
    const err = $("#receiptError");
    const fail = (msg) => { if (err) { err.textContent = msg; err.hidden = false; } };

    const date = ($("#receiptDate")?.value || "").trim();
    const vendor = ($("#receiptVendor")?.value || "").trim();
    const category = ($("#receiptCategory")?.value || "").trim();
    const amount = clampMoney($("#receiptAmount")?.value ?? 0);
    const jobId = ($("#receiptLinkedJobId")?.value || "").trim();
    const notes = ($("#receiptNotes")?.value || "").trim();

    if (!date) return fail("Date is required.");
    if (!vendor) return fail("Vendor is required.");
    if (amount <= 0) return fail("Amount must be greater than 0.");

    if (err) { err.hidden = true; err.textContent = ""; }

    if (state.editingReceiptId) {
      const r = state.receipts.find(x => x.id === state.editingReceiptId);
      if (!r) return fail("Could not find that receipt.");
      r.date = date; r.vendor = vendor; r.category = category; r.amount = amount;
      r.jobId = jobId; r.notes = notes; r.updatedAt = Date.now();
    } else {
      state.receipts.push(normalizeReceipt({
        id: makeId("rcpt"),
        date, vendor, category, amount, jobId, notes,
        createdAt: Date.now(), updatedAt: Date.now(),
      }));
    }

    persist();
    closeReceiptModal();
    const d = fromYmd(date);
    state.currentDate = d;
    state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
    setView("day");
  }

  function deleteReceiptFromModal() {
    const id = state.editingReceiptId;
    if (!id) return;
    if (!confirm("Delete this receipt?")) return;
    state.receipts = state.receipts.filter(r => r.id !== id);
    persist();
    closeReceiptModal();
    renderAll();
  }

  // ---------- Render all ----------
  function renderAll() {
    const dateStr = ymd(state.currentDate);

    if ($("#contextLine")) {
      $("#contextLine").textContent =
        state.view === "dashboard" ? "Dashboard" :
        state.view === "calendar" ? "Calendar" :
        state.view === "day" ? `Day Workspace: ${dateStr}` :
        state.view === "drivers" ? "Drivers" :
        state.view === "trucks" ? "Trucks" :
        state.view === "dispatch" ? "Dispatch" :
        state.view.charAt(0).toUpperCase() + state.view.slice(1);
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderDrivers();
    if (state.view === "trucks") renderTrucks();
    if (state.view === "dispatch") renderDispatch();
  }

  // ---------- Bindings ----------
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
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
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
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = startOfDay(now);
      renderAll();
    });

    $("#btnAddJob")?.addEventListener("click", () => openJobModal(null));
    $("#btnAddReceipt")?.addEventListener("click", () => openReceiptModal(null));

    $("#jobCancel")?.addEventListener("click", closeJobModal);
    $("#jobModalClose")?.addEventListener("click", closeJobModal);
    $("#jobSave")?.addEventListener("click", saveJobFromModal);
    $("#jobDelete")?.addEventListener("click", deleteJobFromModal);

    $("#receiptCancel")?.addEventListener("click", closeReceiptModal);
    $("#receiptModalClose")?.addEventListener("click", closeReceiptModal);
    $("#receiptSave")?.addEventListener("click", saveReceiptFromModal);
    $("#receiptDelete")?.addEventListener("click", deleteReceiptFromModal);

    $("#modalOverlay")?.addEventListener("click", () => {
      closeJobModal();
      closeReceiptModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeJobModal();
        closeReceiptModal();
      }
    });
  }

  // ---------- Boot ----------
  function init() {
    try {
      seedIfEmpty();
      state.jobs = state.jobs.map(normalizeJob);
      state.receipts = state.receipts.map(normalizeReceipt);
      state.drivers = state.drivers.map(normalizeDriver);
      state.trucks = state.trucks.map(normalizeTruck);
      persist();

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
