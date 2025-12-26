/* =========================================================
   Move-Master.OS — mm_app_004.js (FULL)
   Restores/Builds: Drivers + Trucks + Dispatch pages
   Keeps: Dashboard + Quick Calendar + Full Calendar + Day Workspace
   Adds: Finance MTD snapshot + exports
   ---------------------------------------------------------
   Works with your provided HTML structure.

   Storage:
   - mm_jobs_v6
   - mm_receipts_v6
   - mm_drivers_v1
   - mm_trucks_v1
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

    // dispatch fields
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

  // ---------- State ----------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

    jobs: loadArray(LS_JOBS).map(normalizeJob),
    receipts: loadArray(LS_RECEIPTS).map(normalizeReceipt),
    drivers: loadArray(LS_DRIVERS).map(normalizeDriver),
    trucks: loadArray(LS_TRUCKS).map(normalizeTruck),

    // dispatch date selection
    dispatchDate: ymd(startOfDay(new Date())),
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_DRIVERS, state.drivers);
    saveArray(LS_TRUCKS, state.trucks);
  }

  // ---------- Seed small defaults (only if empty) ----------
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

  function monthJobs(year, monthIndex) {
    return state.jobs.filter(j => {
      const d = new Date(j.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }

  function monthReceipts(year, monthIndex) {
    return state.receipts.filter(r => {
      const d = new Date(r.date);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === monthIndex;
    });
  }

  // ---------- JS Pill ----------
  function setPill(ok, text) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.classList.remove("ok","bad");
    pill.classList.add(ok ? "ok" : "bad");
    pill.textContent = text;
  }

  // ---------- Clean “(coming soon)” labels if view exists ----------
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
      <div class="muted" style="margin-top:6px;">Open Finance for breakdowns.</div>
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
          <button class="btn" type="button" data-open-dispatch="${escapeHtml(job.id)}">Dispatch</button>
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

    $$("[data-open-dispatch]", list).forEach(btn => {
      btn.addEventListener("click", () => {
        // jump to dispatch, keep same date
        state.dispatchDate = ds;
        setView("dispatch");
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
          <div class="panel-sub">Editable roster. Stored locally for now.</div>
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

      if (!name) {
        alert("Driver name is required.");
        return;
      }

      state.drivers.push(normalizeDriver({ name, phone, role, active, createdAt: Date.now(), updatedAt: Date.now() }));
      persist();
      renderAll();
    });

    $$("[data-drv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-del");
        if (!id) return;
        if (!confirm("Delete this driver?")) return;

        // unassign jobs that reference this driver
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
          <div class="panel-sub">Editable fleet list. Stored locally for now.</div>
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

      if (!label) {
        alert("Truck label is required.");
        return;
      }

      state.trucks.push(normalizeTruck({ label, plate, capacity, active, createdAt: Date.now(), updatedAt: Date.now() }));
      persist();
      renderAll();
    });

    $$("[data-trk-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-del");
        if (!id) return;
        if (!confirm("Delete this truck?")) return;

        // unassign jobs that reference this truck
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
      ...state.drivers
        .filter(d => d.active)
        .map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || "Driver")}</option>`)
    ].join("");

    const truckOptions = [
      `<option value="">(Unassigned)</option>`,
      ...state.trucks
        .filter(t => t.active)
        .map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label || "Truck")}</option>`)
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
                ${jobs.map(j => {
                  const dName = j.driverId ? (state.drivers.find(d => d.id === j.driverId)?.name || "Unknown") : "";
                  const tName = j.truckId ? (state.trucks.find(t => t.id === j.truckId)?.label || "Unknown") : "";
                  return `
                    <div class="job-row">
                      <div class="job-main">
                        <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
                        <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
                        <div class="job-sub">Current: Driver ${escapeHtml(dName || "Unassigned")} · Truck ${escapeHtml(tName || "Unassigned")}</div>
                      </div>
                      <div class="job-actions" style="flex-wrap:wrap;">
                        <label class="field" style="min-width:190px;">
                          <span>Driver</span>
                          <select data-set-driver="${escapeHtml(j.id)}">
                            ${driverOptions}
                          </select>
                        </label>
                        <label class="field" style="min-width:190px;">
                          <span>Truck</span>
                          <select data-set-truck="${escapeHtml(j.id)}">
                            ${truckOptions}
                          </select>
                        </label>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>`
            : `<div class="muted">No jobs on ${escapeHtml(ds)} yet. Add jobs first, then dispatch.</div>`
        }
      </div>
    `;

    // date change
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

    // pre-select values and bind changes
    $$("[data-set-driver]").forEach(sel => {
      const jobId = sel.getAttribute("data-set-driver");
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      sel.value = job.driverId || "";
      sel.addEventListener("change", () => {
        job.driverId = sel.value || "";
        job.updatedAt = Date.now();
        persist();
        // do not jump views, just refresh dispatch
        renderDispatch();
      });
    });

    $$("[data-set-truck]").forEach(sel => {
      const jobId = sel.getAttribute("data-set-truck");
      const job = state.jobs.find(j => j.id === jobId);
      if (!job) return;
      sel.value = job.truckId || "";
      sel.addEventListener("change", () => {
        job.truckId = sel.value || "";
        job.updatedAt = Date.now();
        persist();
        renderDispatch();
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

    const mJobs = monthJobs(y, m);
    const mReceipts = monthReceipts(y, m);
    const totals = monthTotals(y, m);

    // job status totals
    const statusCount = { scheduled: 0, completed: 0, cancelled: 0 };
    const statusRevenue = { scheduled: 0, completed: 0, cancelled: 0 };

    for (const j of mJobs) {
      statusCount[j.status] = (statusCount[j.status] || 0) + 1;
      if (j.status !== STATUS.cancelled) {
        statusRevenue[j.status] = clampMoney((statusRevenue[j.status] || 0) + clampMoney(j.amount));
      }
    }

    // expenses by category
    const catMap = new Map();
    for (const r of mReceipts) {
      const k = (r.category || "Uncategorized").trim() || "Uncategorized";
      catMap.set(k, clampMoney((catMap.get(k) || 0) + clampMoney(r.amount)));
    }
    const cats = Array.from(catMap.entries()).sort((a,b)=>b[1]-a[1]);

    // daily cashflow (only days with activity)
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daily = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = ymd(new Date(y, m, day));
      const rev = sumRevenue(ds);
      const exp = sumExpenses(ds);
      if (rev !== 0 || exp !== 0) daily.push({ ds, rev, exp, net: clampMoney(rev - exp) });
    }

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Finance</div>
          <div class="panel-sub">Month-to-date accounting snapshot (local data).</div>
        </div>

        <div class="cards">
          <div class="card">
            <div class="card-title">${escapeHtml(label)} Revenue</div>
            <div class="card-body"><b>${money(totals.revenue)}</b></div>
          </div>
          <div class="card">
            <div class="card-title">${escapeHtml(label)} Expenses</div>
            <div class="card-body"><b>${money(totals.expenses)}</b></div>
          </div>
          <div class="card">
            <div class="card-title">${escapeHtml(label)} Net</div>
            <div class="card-body"><b>${money(totals.net)}</b></div>
          </div>
        </div>

        <div class="panel-spacer"></div>

        <div class="day-totals">
          <div><b>Jobs (MTD)</b></div>
          <div>
            Scheduled: ${statusCount.scheduled} (${money(statusRevenue.scheduled)}) ·
            Completed: ${statusCount.completed} (${money(statusRevenue.completed)}) ·
            Cancelled: ${statusCount.cancelled} (${money(statusRevenue.cancelled)})
          </div>
        </div>

        <div class="panel-spacer"></div>

        <div class="day-totals">
          <div><b>Expenses by Category (MTD)</b></div>
          <div>${cats.length ? cats.slice(0, 8).map(([k,v]) => `${escapeHtml(k)} ${money(v)}`).join(" · ") : "No receipts yet."}</div>
        </div>

        <div class="panel-spacer"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="finExportJobs" class="btn">Export Jobs CSV</button>
          <button id="finExportReceipts" class="btn">Export Receipts CSV</button>
          <button id="finOpenCalendar" class="btn">Open Calendar</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Daily Cashflow</div>
          <div class="panel-sub">Only days with activity shown.</div>
        </div>

        ${
          daily.length
            ? `<div style="display:flex; flex-direction:column; gap:10px;">
                ${daily.map(d => `
                  <div class="job-row">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(d.ds)}</div>
                      <div class="job-sub">Revenue ${money(d.rev)} · Expenses ${money(d.exp)} · Net ${money(d.net)}</div>
                    </div>
                    <div class="job-actions">
                      <button class="btn" type="button" data-open-day="${escapeHtml(d.ds)}">Open Day</button>
                    </div>
                  </div>
                `).join("")}
              </div>`
            : `<div class="muted">No activity recorded this month yet.</div>`
        }
      </div>
    `;

    $("#finOpenCalendar")?.addEventListener("click", () => setView("calendar"));

    $$("[data-open-day]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const ds = btn.getAttribute("data-open-day");
        const d = fromYmd(ds);
        state.currentDate = d;
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });
    });

    $("#finExportJobs")?.addEventListener("click", () => {
      const rows = mJobs.map(j => ({
        id: j.id,
        date: j.date,
        customer: j.customer,
        pickup: j.pickup,
        dropoff: j.dropoff,
        status: j.status,
        amount: clampMoney(j.amount),
        driverId: j.driverId || "",
        truckId: j.truckId || "",
        notes: j.notes || "",
      }));
      downloadCsv(`jobs_${y}_${pad2(m+1)}.csv`, rows);
    });

    $("#finExportReceipts")?.addEventListener("click", () => {
      const rows = mReceipts.map(r => ({
        id: r.id,
        date: r.date,
        vendor: r.vendor,
        category: r.category,
        amount: clampMoney(r.amount),
        jobId: r.jobId || "",
        notes: r.notes || "",
      }));
      downloadCsv(`receipts_${y}_${pad2(m+1)}.csv`, rows);
    });
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) {
      alert("Nothing to export yet.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      const s = String(v ?? "");
      const needs = /[",\n]/.test(s);
      const safe = s.replaceAll('"', '""');
      return needs ? `"${safe}"` : safe;
    };
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => esc(r[h])).join(","))
    ].join("\n");

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

    // Keep buttons safe (won't break anything)
    $("#btnAddJob")?.addEventListener("click", () => {
      alert("Add Job modal wiring can be added next. For now, jobs are seeded or managed via your existing job module.");
    });
    $("#btnAddReceipt")?.addEventListener("click", () => {
      alert("Add Receipt modal wiring can be added next. For now, receipts are seeded or managed via your receipts module.");
    });
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
