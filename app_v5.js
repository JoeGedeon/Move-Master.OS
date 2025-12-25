/* ============================================================
   Fleet CRM — apps_v5.js (FULL)
   Focus Update: DRIVERS + TRUCKS pages now REAL (not "coming soon")
   - No required HTML changes
   - Auto-creates missing view containers safely
   - Keeps Day Workspace + Calendar + Dashboard stable
   ============================================================ */

(() => {
  "use strict";
  console.log("✅ apps_v5.js loaded");

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

  const clampMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  };
  const money = (n) => `$${clampMoney(n).toFixed(2)}`;

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function makeId(prefix = "id") {
    try { return crypto.randomUUID(); }
    catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
  }

  // ---------------------------
  // Storage keys
  // ---------------------------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";
  const LS_DRIVERS = "fleet_drivers_v5";
  const LS_TRUCKS = "fleet_trucks_v5";

  // ---------------------------
  // Domain constants
  // ---------------------------
  const STATUS = { scheduled: "scheduled", completed: "completed", cancelled: "cancelled" };
  const STATUS_LABEL = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" };

  // ---------------------------
  // Storage helpers
  // ---------------------------
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

  // ---------------------------
  // Normalizers
  // ---------------------------
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
    const drv = { ...(d || {}) };
    if (!drv.id) drv.id = makeId("drv");
    drv.name = (drv.name || "").trim();
    drv.phone = (drv.phone || "").trim();
    drv.email = (drv.email || "").trim();
    drv.active = drv.active !== false;
    drv.notes = (drv.notes || "").trim();
    if (!drv.createdAt) drv.createdAt = Date.now();
    drv.updatedAt = drv.updatedAt || drv.createdAt;
    return drv;
  }

  function normalizeTruck(t) {
    const trk = { ...(t || {}) };
    if (!trk.id) trk.id = makeId("trk");
    trk.label = (trk.label || "").trim();
    trk.plate = (trk.plate || "").trim();
    trk.type = (trk.type || "").trim();     // box truck / sprinter / pickup
    trk.capacity = (trk.capacity || "").trim(); // optional: "26ft", "16ft"
    trk.active = trk.active !== false;
    trk.notes = (trk.notes || "").trim();
    if (!trk.createdAt) trk.createdAt = Date.now();
    trk.updatedAt = trk.updatedAt || trk.createdAt;
    return trk;
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
    drivers: loadArray(LS_DRIVERS).map(normalizeDriver),
    trucks: loadArray(LS_TRUCKS).map(normalizeTruck),

    // little UI state
    driverSearch: "",
    truckSearch: "",
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_DRIVERS, state.drivers);
    saveArray(LS_TRUCKS, state.trucks);
  }

  // Seed so the screens don’t look empty on first run
  function seedFleetIfEmpty() {
    if (state.drivers.length === 0) {
      state.drivers = [
        normalizeDriver({ name: "Driver 1", phone: "", active: true }),
        normalizeDriver({ name: "Driver 2", phone: "", active: true }),
      ];
    }
    if (state.trucks.length === 0) {
      state.trucks = [
        normalizeTruck({ label: "Truck 1", plate: "", type: "Box Truck", capacity: "26ft", active: true }),
        normalizeTruck({ label: "Truck 2", plate: "", type: "Sprinter", capacity: "", active: true }),
      ];
    }
    persist();
  }

  // ---------------------------
  // View container finder/creator (NO HTML edits required)
  // ---------------------------
  function getMainHost() {
    // Try to find your main content area
    return (
      $("#mainContent") ||
      $(".main") ||
      $(".content") ||
      $("#content") ||
      $("main") ||
      document.body
    );
  }

  function ensureViewContainer(viewName) {
    // Prefer existing #view-xyz
    let v = $(`#view-${viewName}`);
    if (v) return v;

    // Otherwise create it inside main host
    const host = getMainHost();
    v = document.createElement("section");
    v.id = `view-${viewName}`;
    v.className = "view";
    v.style.display = "none";
    host.appendChild(v);
    return v;
  }

  function hideAllViews() {
    $$('[id^="view-"]').forEach((el) => {
      el.style.display = "none";
      el.classList.remove("active");
    });
  }

  function setView(viewName) {
    state.view = viewName;
    hideAllViews();

    const panel = ensureViewContainer(viewName);
    panel.style.display = "block";
    panel.classList.add("active");

    // Highlight nav buttons if you have them
    $$("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    renderAll();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) {
    return state.jobs.filter((j) => j.date === dateStr);
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
    for (const r of state.receipts) if (r.date === dateStr) total += clampMoney(r.amount);
    return clampMoney(total);
  }

  function driverName(id) {
    const d = state.drivers.find((x) => x.id === id);
    return d ? d.name : "";
  }

  function truckLabel(id) {
    const t = state.trucks.find((x) => x.id === id);
    return t ? t.label : "";
  }

  // ---------------------------
  // Dashboard
  // ---------------------------
  function renderDashboard() {
    const panel = ensureViewContainer("dashboard");

    const todayStr = ymd(state.currentDate);
    const rev = sumJobRevenue(todayStr);
    const exp = sumReceiptExpense(todayStr);
    const net = clampMoney(rev - exp);

    // Use your existing widgets if present
    const stats = $("#dashboardStats") || $("#monthSnapshot");
    if (stats) {
      stats.innerHTML = `
        <div><strong>Today:</strong> ${escapeHtml(todayStr)}</div>
        <div>Revenue: <strong>${money(rev)}</strong> · Expenses: <strong>${money(exp)}</strong> · Net: <strong>${money(net)}</strong></div>
      `;
    }

    // If your dashboard panel is empty, inject a minimal summary without breaking your layout
    if (!panel.dataset.built) {
      panel.dataset.built = "1";
      if (!panel.innerHTML.trim()) {
        panel.innerHTML = `
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">Dashboard</div>
              <div class="panel-sub">Today overview and shortcuts.</div>
            </div>
            <div class="day-totals">
              <div><strong>Date:</strong> ${escapeHtml(todayStr)}</div>
              <div><strong>Revenue:</strong> ${money(rev)} · <strong>Expenses:</strong> ${money(exp)} · <strong>Net:</strong> ${money(net)}</div>
            </div>
            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn primary" type="button" id="dashOpenDay">Open Day Workspace</button>
              <button class="btn" type="button" id="dashOpenDrivers">Drivers</button>
              <button class="btn" type="button" id="dashOpenTrucks">Trucks</button>
            </div>
          </div>
        `;
        $("#dashOpenDay")?.addEventListener("click", () => setView("day"));
        $("#dashOpenDrivers")?.addEventListener("click", () => setView("drivers"));
        $("#dashOpenTrucks")?.addEventListener("click", () => setView("trucks"));
      }
    }
  }

  // ---------------------------
  // Calendar (simple month grid; uses your #calendarGrid if present, else injects)
  // ---------------------------
  function renderCalendar() {
    const panel = ensureViewContainer("calendar");

    let grid = $("#calendarGrid");
    let label = $("#calendarLabel") || $("#monthLabel");

    if (!grid) {
      // Inject a calendar if your HTML doesn't have it
      panel.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title">Calendar</div>
            <div class="panel-sub">Click a day to open Day Workspace.</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
            <button class="btn" id="calPrev">Prev</button>
            <div id="calendarLabel" style="font-weight:700;"></div>
            <button class="btn" id="calNext">Next</button>
            <button class="btn" id="calToday">Today</button>
          </div>
          <div id="calendarGrid" class="calendar-grid"></div>
        </div>
      `;
      grid = $("#calendarGrid");
      label = $("#calendarLabel");

      $("#calPrev")?.addEventListener("click", () => {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
        renderAll();
      });
      $("#calNext")?.addEventListener("click", () => {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
        renderAll();
      });
      $("#calToday")?.addEventListener("click", () => {
        state.currentDate = startOfDay(new Date());
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
        renderAll();
      });
    }

    if (!grid || !label) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    label.textContent = `${state.monthCursor.toLocaleString("default", { month: "long" })} ${y}`;

    grid.innerHTML = "";

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "calendar-day pad";
      grid.appendChild(pad);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";
      btn.innerHTML = `<strong>${day}</strong>`;

      if (sameDay(d, new Date())) btn.classList.add("today");

      const jobs = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled).length;
      const rcpts = state.receipts.filter(r => r.date === dateStr).length;
      if (jobs) btn.classList.add("has-jobs");
      if (rcpts) btn.classList.add("has-receipts");

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        setView("day");
      });

      grid.appendChild(btn);
    }
  }

  // ---------------------------
  // Day Workspace (keeps your working flow)
  // ---------------------------
  function renderDay() {
    const panel = ensureViewContainer("day");

    // If your HTML already contains #dayTitle and #dayJobs, we’ll use those.
    // Otherwise we inject a safe version.
    if (!$("#dayTitle") || !$("#dayJobs")) {
      panel.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <div class="panel-title" id="dayTitle"></div>
            <div class="panel-sub">Jobs and receipts for the day.</div>
          </div>
          <div id="dayJobs"></div>
        </div>
      `;
    }

    const dateStr = ymd(state.currentDate);
    const title = $("#dayTitle");
    const list = $("#dayJobs");
    if (title) title.textContent = `Day Workspace – ${dateStr}`;
    if (!list) return;

    const jobs = jobsByDate(dateStr).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const rev = sumJobRevenue(dateStr);
    const exp = sumReceiptExpense(dateStr);
    const net = clampMoney(rev - exp);

    list.innerHTML = `
      <div class="day-totals">
        <div><strong>Revenue:</strong> ${money(rev)} · <strong>Expenses:</strong> ${money(exp)} · <strong>Net:</strong> ${money(net)}</div>
      </div>
      <div class="muted" style="margin-top:10px;">(Jobs list lives here. Your next iteration can add job add/edit UI again.)</div>
      <div style="margin-top:12px;">
        ${jobs.length ? jobs.map(j => `
          <div class="job-row">
            <div class="job-main">
              <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
              <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
              <div class="job-sub">Driver: <strong>${escapeHtml(driverName(j.driverId) || "Unassigned")}</strong> · Truck: <strong>${escapeHtml(truckLabel(j.truckId) || "Unassigned")}</strong> · Status: <strong>${escapeHtml(STATUS_LABEL[j.status] || "Scheduled")}</strong></div>
            </div>
          </div>
        `).join("") : `<div class="empty muted">No jobs for this day.</div>`}
      </div>
    `;
  }

  // ---------------------------
  // Drivers (THIS is the missing “real page”)
  // ---------------------------
  function renderDrivers() {
    const panel = ensureViewContainer("drivers");

    const activeCount = state.drivers.filter(d => d.active).length;
    const totalCount = state.drivers.length;

    const q = state.driverSearch.trim().toLowerCase();
    const filtered = state.drivers
      .slice()
      .sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name) : (a.active ? -1 : 1)))
      .filter(d => {
        if (!q) return true;
        return (
          (d.name || "").toLowerCase().includes(q) ||
          (d.phone || "").toLowerCase().includes(q) ||
          (d.email || "").toLowerCase().includes(q)
        );
      });

    panel.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Manage drivers. Assign drivers to jobs later. (${activeCount} active / ${totalCount} total)</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:240px;">
            <span>Search</span>
            <input id="drvSearch" type="text" placeholder="Search name/phone/email" value="${escapeHtml(state.driverSearch)}" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Name</span>
            <input id="drvName" type="text" placeholder="e.g., Jose, Mike, Sarah" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Phone</span>
            <input id="drvPhone" type="text" placeholder="(555) 555-5555" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Email</span>
            <input id="drvEmail" type="text" placeholder="optional@email.com" />
          </label>

          <button class="btn primary" id="drvAdd" type="button">Add Driver</button>
        </div>

        <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
          ${
            filtered.length
              ? filtered.map(d => `
                  <div class="job-row ${d.active ? "" : "is-cancelled"}">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(d.name || "Unnamed Driver")}</div>
                      <div class="job-sub">${escapeHtml(d.phone || "")}${d.email ? ` · ${escapeHtml(d.email)}` : ""} · ${d.active ? "Active" : "Inactive"}</div>
                      ${d.notes ? `<div class="job-sub">${escapeHtml(d.notes)}</div>` : ""}
                    </div>
                    <div class="job-actions">
                      <button class="btn" data-drv-edit="${escapeHtml(d.id)}" type="button">Edit</button>
                      <button class="btn" data-drv-toggle="${escapeHtml(d.id)}" type="button">${d.active ? "Deactivate" : "Activate"}</button>
                      <button class="btn danger" data-drv-del="${escapeHtml(d.id)}" type="button">Delete</button>
                    </div>
                  </div>
                `).join("")
              : `<div class="empty muted">No drivers match your search.</div>`
          }
        </div>
      </div>
    `;

    $("#drvSearch")?.addEventListener("input", (e) => {
      state.driverSearch = e.target.value || "";
      renderDrivers();
    });

    $("#drvAdd")?.addEventListener("click", () => {
      const name = ($("#drvName")?.value || "").trim();
      const phone = ($("#drvPhone")?.value || "").trim();
      const email = ($("#drvEmail")?.value || "").trim();
      if (!name) return;

      state.drivers.push(normalizeDriver({ name, phone, email, active: true }));
      persist();
      renderDrivers();
    });

    $$("[data-drv-toggle]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-toggle");
        const d = state.drivers.find(x => x.id === id);
        if (!d) return;
        d.active = !d.active;
        d.updatedAt = Date.now();
        persist();
        renderDrivers();
      });
    });

    $$("[data-drv-del]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-del");
        if (!id) return;
        if (!confirm("Delete this driver? Any jobs assigned will become unassigned.")) return;

        // unassign from jobs
        state.jobs = state.jobs.map(j => (j.driverId === id ? normalizeJob({ ...j, driverId: "", updatedAt: Date.now() }) : j));
        state.drivers = state.drivers.filter(x => x.id !== id);

        persist();
        renderDrivers();
      });
    });

    $$("[data-drv-edit]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-edit");
        const d = state.drivers.find(x => x.id === id);
        if (!d) return;

        const name = prompt("Driver name:", d.name || "");
        if (name === null) return;
        const phone = prompt("Phone:", d.phone || "");
        if (phone === null) return;
        const email = prompt("Email:", d.email || "");
        if (email === null) return;
        const notes = prompt("Notes:", d.notes || "");
        if (notes === null) return;

        d.name = name.trim();
        d.phone = phone.trim();
        d.email = email.trim();
        d.notes = notes.trim();
        d.updatedAt = Date.now();

        persist();
        renderDrivers();
      });
    });
  }

  // ---------------------------
  // Trucks (THIS is the other missing “real page”)
  // ---------------------------
  function renderTrucks() {
    const panel = ensureViewContainer("trucks");

    const activeCount = state.trucks.filter(t => t.active).length;
    const totalCount = state.trucks.length;

    const q = state.truckSearch.trim().toLowerCase();
    const filtered = state.trucks
      .slice()
      .sort((a, b) => (a.active === b.active ? a.label.localeCompare(b.label) : (a.active ? -1 : 1)))
      .filter(t => {
        if (!q) return true;
        return (
          (t.label || "").toLowerCase().includes(q) ||
          (t.plate || "").toLowerCase().includes(q) ||
          (t.type || "").toLowerCase().includes(q) ||
          (t.capacity || "").toLowerCase().includes(q)
        );
      });

    panel.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Manage trucks. Assign trucks to jobs later. (${activeCount} active / ${totalCount} total)</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:240px;">
            <span>Search</span>
            <input id="trkSearch" type="text" placeholder="Search label/plate/type" value="${escapeHtml(state.truckSearch)}" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Label</span>
            <input id="trkLabel" type="text" placeholder="e.g., 26ft Box, Sprinter 1" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Plate</span>
            <input id="trkPlate" type="text" placeholder="ABC-1234" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Type</span>
            <input id="trkType" type="text" placeholder="Box truck, Sprinter, Pickup" />
          </label>

          <label class="field" style="min-width:140px;">
            <span>Capacity</span>
            <input id="trkCap" type="text" placeholder="26ft" />
          </label>

          <button class="btn primary" id="trkAdd" type="button">Add Truck</button>
        </div>

        <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
          ${
            filtered.length
              ? filtered.map(t => `
                  <div class="job-row ${t.active ? "" : "is-cancelled"}">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(t.label || "Unnamed Truck")}</div>
                      <div class="job-sub">
                        ${escapeHtml(t.type || "")}${t.capacity ? ` · ${escapeHtml(t.capacity)}` : ""}${t.plate ? ` · Plate: ${escapeHtml(t.plate)}` : ""}
                        · ${t.active ? "Active" : "Inactive"}
                      </div>
                      ${t.notes ? `<div class="job-sub">${escapeHtml(t.notes)}</div>` : ""}
                    </div>
                    <div class="job-actions">
                      <button class="btn" data-trk-edit="${escapeHtml(t.id)}" type="button">Edit</button>
                      <button class="btn" data-trk-toggle="${escapeHtml(t.id)}" type="button">${t.active ? "Deactivate" : "Activate"}</button>
                      <button class="btn danger" data-trk-del="${escapeHtml(t.id)}" type="button">Delete</button>
                    </div>
                  </div>
                `).join("")
              : `<div class="empty muted">No trucks match your search.</div>`
          }
        </div>
      </div>
    `;

    $("#trkSearch")?.addEventListener("input", (e) => {
      state.truckSearch = e.target.value || "";
      renderTrucks();
    });

    $("#trkAdd")?.addEventListener("click", () => {
      const label = ($("#trkLabel")?.value || "").trim();
      const plate = ($("#trkPlate")?.value || "").trim();
      const type = ($("#trkType")?.value || "").trim();
      const capacity = ($("#trkCap")?.value || "").trim();
      if (!label) return;

      state.trucks.push(normalizeTruck({ label, plate, type, capacity, active: true }));
      persist();
      renderTrucks();
    });

    $$("[data-trk-toggle]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-toggle");
        const t = state.trucks.find(x => x.id === id);
        if (!t) return;
        t.active = !t.active;
        t.updatedAt = Date.now();
        persist();
        renderTrucks();
      });
    });

    $$("[data-trk-del]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-del");
        if (!id) return;
        if (!confirm("Delete this truck? Any jobs assigned will become unassigned.")) return;

        // unassign from jobs
        state.jobs = state.jobs.map(j => (j.truckId === id ? normalizeJob({ ...j, truckId: "", updatedAt: Date.now() }) : j));
        state.trucks = state.trucks.filter(x => x.id !== id);

        persist();
        renderTrucks();
      });
    });

    $$("[data-trk-edit]", panel).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-edit");
        const t = state.trucks.find(x => x.id === id);
        if (!t) return;

        const label = prompt("Truck label:", t.label || "");
        if (label === null) return;
        const plate = prompt("Plate:", t.plate || "");
        if (plate === null) return;
        const type = prompt("Type:", t.type || "");
        if (type === null) return;
        const capacity = prompt("Capacity:", t.capacity || "");
        if (capacity === null) return;
        const notes = prompt("Notes:", t.notes || "");
        if (notes === null) return;

        t.label = label.trim();
        t.plate = plate.trim();
        t.type = type.trim();
        t.capacity = capacity.trim();
        t.notes = notes.trim();
        t.updatedAt = Date.now();

        persist();
        renderTrucks();
      });
    });
  }

  // ---------------------------
  // Render router
  // ---------------------------
  function renderAll() {
    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderDrivers();
    if (state.view === "trucks") renderTrucks();

    // If you still have placeholder views, we don't break them:
    // dispatch, finances, inventory, ai scanner etc can be layered later.
  }

  // ---------------------------
  // Navigation bindings
  // ---------------------------
  function bindNav() {
    // Sidebar/topbar nav buttons using data-view
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.getAttribute("data-view");
        if (v) setView(v);
      });
    });

    // Optional toolbar buttons
    $("#btnToday")?.addEventListener("click", () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", () => {
      // If calendar view, page months; otherwise page days
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
  }

  // ---------------------------
  // Boot
  // ---------------------------
  function init() {
    seedFleetIfEmpty();
    bindNav();

    // Default view preference: your app likely starts at dashboard
    if ($("#view-dashboard")) setView("dashboard");
    else setView("day");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
