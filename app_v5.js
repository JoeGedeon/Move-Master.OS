/* ============================================================
   Fleet CRM — apps_v5.js (Dispatch Added + "Coming Soon" Fixed)
   ------------------------------------------------------------
   ✅ Drivers page active
   ✅ Trucks page active
   ✅ Dispatch page now active (daily board)
   ✅ Removes "coming soon" text from nav for active pages
   ✅ Non-destructive: renders into existing IDs if present
   ------------------------------------------------------------
   Expects (if you have them):
   - Views: #view-dashboard #view-calendar #view-day #view-drivers #view-trucks #view-dispatch
   - Calendar: #calendarGrid (full) and/or #dashboardCalendar (quick)
   - Day: #dayTitle #dayJobs
   Nav buttons: [data-view="dashboard|calendar|day|drivers|trucks|dispatch"]
   ============================================================ */

(() => {
  "use strict";
  console.log("✅ apps_v5.js loaded (dispatch + coming-soon fix)");

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

  const escapeHtml = (s) =>
    String(s)
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

  // ---------------------------
  // Storage
  // ---------------------------
  const LS_JOBS = "fleet_jobs_v5";
  const LS_RECEIPTS = "fleet_receipts_v5";
  const LS_DRIVERS = "fleet_drivers_v5";
  const LS_TRUCKS = "fleet_trucks_v5";

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
  // Domain
  // ---------------------------
  const STATUS = { scheduled: "scheduled", completed: "completed", cancelled: "cancelled" };
  const STATUS_LABEL = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" };

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
    trk.type = (trk.type || "").trim();
    trk.capacity = (trk.capacity || "").trim();
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

    driverSearch: "",
    truckSearch: "",
  };

  function persist() {
    saveArray(LS_JOBS, state.jobs);
    saveArray(LS_RECEIPTS, state.receipts);
    saveArray(LS_DRIVERS, state.drivers);
    saveArray(LS_TRUCKS, state.trucks);
  }

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

  function driverName(id) {
    const d = state.drivers.find(x => x.id === id);
    return d ? d.name : "";
  }
  function truckLabel(id) {
    const t = state.trucks.find(x => x.id === id);
    return t ? t.label : "";
  }

  // Conflicts = same driver or truck used on multiple non-cancelled jobs same day
  function conflictsForDate(dateStr) {
    const js = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled);
    const dMap = new Map();
    const tMap = new Map();

    for (const j of js) {
      if (j.driverId) dMap.set(j.driverId, (dMap.get(j.driverId) || 0) + 1);
      if (j.truckId) tMap.set(j.truckId, (tMap.get(j.truckId) || 0) + 1);
    }

    const driverConf = [];
    const truckConf = [];

    for (const [id, c] of dMap.entries()) if (c > 1) driverConf.push({ id, c, name: driverName(id) || "Unknown" });
    for (const [id, c] of tMap.entries()) if (c > 1) truckConf.push({ id, c, label: truckLabel(id) || "Unknown" });

    return { driverConf, truckConf };
  }

  // ---------------------------
  // Views
  // ---------------------------
  function setView(viewName) {
    state.view = viewName;

    const viewEls = $$('[id^="view-"]');
    if (viewEls.length) {
      viewEls.forEach(el => {
        el.style.display = "none";
        el.classList.remove("active");
      });
      const panel = $(`#view-${viewName}`);
      if (panel) {
        panel.style.display = "block";
        panel.classList.add("active");
      }
    }

    $$("[data-view]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === viewName);
    });

    renderAll();
  }

  // ---------------------------
  // Coming-soon label fix
  // ---------------------------
  function fixComingSoonLabels() {
    const mapping = [
      { view: "drivers", exists: !!$("#view-drivers"), label: "Active" },
      { view: "trucks", exists: !!$("#view-trucks"), label: "Active" },
      { view: "dispatch", exists: !!$("#view-dispatch"), label: "Active" },
    ];

    for (const m of mapping) {
      if (!m.exists) continue;
      const btn = $(`[data-view="${m.view}"]`);
      if (!btn) continue;

      // Replace any small/secondary text that says coming soon
      const candidates = [
        btn.querySelector(".sub"),
        btn.querySelector(".subtext"),
        btn.querySelector("small"),
        btn.querySelector("span:last-child"),
      ].filter(Boolean);

      for (const el of candidates) {
        const t = (el.textContent || "").toLowerCase();
        if (t.includes("coming") && t.includes("soon")) {
          el.textContent = m.label;
        }
      }

      // Also fallback: replace within button text (rare case)
      if ((btn.textContent || "").toLowerCase().includes("coming soon")) {
        btn.innerHTML = btn.innerHTML.replace(/coming\s*soon/i, m.label);
      }
    }
  }

  // ---------------------------
  // Dashboard placeholders (non-destructive)
  // ---------------------------
  function renderDashboardPlaceholders() {
    const todayStr = ymd(state.currentDate);
    const rev = sumJobRevenue(todayStr);
    const exp = sumReceiptExpense(todayStr);
    const net = clampMoney(rev - exp);

    const stats = $("#monthSnapshot") || $("#dashboardStats");
    if (stats) {
      const txt = (stats.textContent || "").trim();
      if (txt.length < 6) {
        stats.innerHTML = `
          <div><strong>Today:</strong> ${escapeHtml(todayStr)}</div>
          <div>Revenue: <strong>${money(rev)}</strong> · Expenses: <strong>${money(exp)}</strong> · Net: <strong>${money(net)}</strong></div>
        `;
      }
    }

    const pp = $("#pressurePoints");
    if (pp) {
      const t = (pp.textContent || "").trim();
      if (t.length < 6) {
        const jobs = jobsByDate(todayStr).filter(j => j.status !== STATUS.cancelled).length;
        const rcpts = receiptsByDate(todayStr).length;
        pp.innerHTML = `
          <div>• Jobs today: ${jobs}</div>
          <div>• Receipts today: ${rcpts}</div>
          <div>• Net today: ${money(net)}</div>
        `;
      }
    }

    const quick = $("#dashboardCalendar");
    if (quick) renderQuickCalendar(quick);
  }

  function renderQuickCalendar(container) {
    const y = state.currentDate.getFullYear();
    const m = state.currentDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    if (container.dataset.custom === "1") return;

    container.innerHTML = "";
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const dateStr = ymd(d);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill";
      btn.textContent = String(day);

      if (sameDay(d, state.currentDate)) btn.classList.add("active");
      if (jobsByDate(dateStr).some(j => j.status !== STATUS.cancelled)) btn.classList.add("has-jobs");
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
  // FULL Calendar renderer (if #calendarGrid exists anywhere)
  // ---------------------------
  function renderFullCalendarIfPresent() {
    const grid = $("#calendarGrid");
    const label = $("#calendarLabel") || $("#monthLabel");
    if (!grid) return;

    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth();
    if (label) label.textContent = `${state.monthCursor.toLocaleString("default", { month: "long" })} ${y}`;

    grid.innerHTML = "";

    const first = new Date(y, m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // DOW header if your CSS supports it
    const wantsDow = grid.dataset.dow !== "0";
    if (wantsDow) {
      const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      for (const d of dow) {
        const h = document.createElement("div");
        h.className = "dow";
        h.textContent = d;
        grid.appendChild(h);
      }
    }

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
      btn.innerHTML = `<div class="num">${day}</div>`;

      if (sameDay(d, new Date())) btn.classList.add("today");
      if (sameDay(d, state.currentDate)) btn.classList.add("selected");

      const jobs = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled).length;
      const rcpts = receiptsByDate(dateStr).length;
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
  // Day Workspace (renders into #dayTitle/#dayJobs)
  // ---------------------------
  function renderDayWorkspaceIfPresent() {
    const title = $("#dayTitle");
    const list = $("#dayJobs");
    if (!title || !list) return;

    const dateStr = ymd(state.currentDate);
    title.textContent = `Day Workspace – ${dateStr}`;

    const jobs = jobsByDate(dateStr).slice().sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    const rev = sumJobRevenue(dateStr);
    const exp = sumReceiptExpense(dateStr);
    const net = clampMoney(rev - exp);

    list.innerHTML = `
      <div class="day-totals">
        <div><strong>Revenue:</strong> ${money(rev)} · <strong>Expenses:</strong> ${money(exp)} · <strong>Net:</strong> ${money(net)}</div>
      </div>

      <div style="margin-top:10px;">
        ${
          jobs.length
          ? jobs.map(j => `
              <div class="job-row ${j.status === STATUS.completed ? "is-completed" : ""} ${j.status === STATUS.cancelled ? "is-cancelled" : ""}">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
                  <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
                  <div class="job-sub">
                    Driver: <strong>${escapeHtml(driverName(j.driverId) || "Unassigned")}</strong> ·
                    Truck: <strong>${escapeHtml(truckLabel(j.truckId) || "Unassigned")}</strong> ·
                    Status: <strong>${escapeHtml(STATUS_LABEL[j.status] || "Scheduled")}</strong>
                  </div>
                </div>
              </div>
            `).join("")
          : `<div class="empty muted">No jobs for this day.</div>`
        }
      </div>
    `;
  }

  // ---------------------------
  // Drivers view (renders into #view-drivers)
  // ---------------------------
  function renderDriversIfPresent() {
    const host = $("#view-drivers");
    if (!host) return;

    const activeCount = state.drivers.filter(d => d.active).length;
    const totalCount = state.drivers.length;

    const q = state.driverSearch.trim().toLowerCase();
    const filtered = state.drivers
      .slice()
      .sort((a,b) => (a.active === b.active ? a.name.localeCompare(b.name) : (a.active ? -1 : 1)))
      .filter(d => {
        if (!q) return true;
        return (d.name||"").toLowerCase().includes(q) ||
               (d.phone||"").toLowerCase().includes(q) ||
               (d.email||"").toLowerCase().includes(q);
      });

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">${activeCount} active / ${totalCount} total</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:240px;">
            <span>Search</span>
            <input id="drvSearch" type="text" value="${escapeHtml(state.driverSearch)}" placeholder="Search name/phone/email" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Name</span>
            <input id="drvName" type="text" placeholder="Driver name" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Phone</span>
            <input id="drvPhone" type="text" placeholder="(555) 555-5555" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Email</span>
            <input id="drvEmail" type="text" placeholder="optional@email.com" />
          </label>

          <button class="btn primary" id="drvAdd" type="button">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
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
              : `<div class="empty muted">No drivers found.</div>`
          }
        </div>
      </div>
    `;

    $("#drvSearch")?.addEventListener("input", (e) => {
      state.driverSearch = e.target.value || "";
      renderDriversIfPresent();
      fixComingSoonLabels();
    });

    $("#drvAdd")?.addEventListener("click", () => {
      const name = ($("#drvName")?.value || "").trim();
      const phone = ($("#drvPhone")?.value || "").trim();
      const email = ($("#drvEmail")?.value || "").trim();
      if (!name) return;
      state.drivers.push(normalizeDriver({ name, phone, email, active: true }));
      persist();
      renderDriversIfPresent();
      fixComingSoonLabels();
    });

    $$("[data-drv-toggle]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-toggle");
        const d = state.drivers.find(x => x.id === id);
        if (!d) return;
        d.active = !d.active;
        d.updatedAt = Date.now();
        persist();
        renderDriversIfPresent();
        fixComingSoonLabels();
      });
    });

    $$("[data-drv-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-drv-del");
        if (!id) return;
        if (!confirm("Delete this driver?")) return;

        // unassign from jobs
        state.jobs = state.jobs.map(j => (j.driverId === id ? normalizeJob({ ...j, driverId: "", updatedAt: Date.now() }) : j));
        state.drivers = state.drivers.filter(x => x.id !== id);

        persist();
        renderDriversIfPresent();
        fixComingSoonLabels();
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
        renderDriversIfPresent();
        fixComingSoonLabels();
      });
    });
  }

  // ---------------------------
  // Trucks view (renders into #view-trucks)
  // ---------------------------
  function renderTrucksIfPresent() {
    const host = $("#view-trucks");
    if (!host) return;

    const activeCount = state.trucks.filter(t => t.active).length;
    const totalCount = state.trucks.length;

    const q = state.truckSearch.trim().toLowerCase();
    const filtered = state.trucks
      .slice()
      .sort((a,b) => (a.active === b.active ? a.label.localeCompare(b.label) : (a.active ? -1 : 1)))
      .filter(t => {
        if (!q) return true;
        return (t.label||"").toLowerCase().includes(q) ||
               (t.plate||"").toLowerCase().includes(q) ||
               (t.type||"").toLowerCase().includes(q) ||
               (t.capacity||"").toLowerCase().includes(q);
      });

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">${activeCount} active / ${totalCount} total</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end;">
          <label class="field" style="min-width:240px;">
            <span>Search</span>
            <input id="trkSearch" type="text" value="${escapeHtml(state.truckSearch)}" placeholder="Search label/plate/type" />
          </label>

          <label class="field" style="min-width:220px;">
            <span>Label</span>
            <input id="trkLabel" type="text" placeholder="Truck label" />
          </label>

          <label class="field" style="min-width:160px;">
            <span>Plate</span>
            <input id="trkPlate" type="text" placeholder="ABC-1234" />
          </label>

          <label class="field" style="min-width:180px;">
            <span>Type</span>
            <input id="trkType" type="text" placeholder="Box truck / Sprinter / Pickup" />
          </label>

          <label class="field" style="min-width:140px;">
            <span>Capacity</span>
            <input id="trkCap" type="text" placeholder="26ft" />
          </label>

          <button class="btn primary" id="trkAdd" type="button">Add</button>
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
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
              : `<div class="empty muted">No trucks found.</div>`
          }
        </div>
      </div>
    `;

    $("#trkSearch")?.addEventListener("input", (e) => {
      state.truckSearch = e.target.value || "";
      renderTrucksIfPresent();
      fixComingSoonLabels();
    });

    $("#trkAdd")?.addEventListener("click", () => {
      const label = ($("#trkLabel")?.value || "").trim();
      const plate = ($("#trkPlate")?.value || "").trim();
      const type = ($("#trkType")?.value || "").trim();
      const capacity = ($("#trkCap")?.value || "").trim();
      if (!label) return;

      state.trucks.push(normalizeTruck({ label, plate, type, capacity, active: true }));
      persist();
      renderTrucksIfPresent();
      fixComingSoonLabels();
    });

    $$("[data-trk-toggle]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-toggle");
        const t = state.trucks.find(x => x.id === id);
        if (!t) return;
        t.active = !t.active;
        t.updatedAt = Date.now();
        persist();
        renderTrucksIfPresent();
        fixComingSoonLabels();
      });
    });

    $$("[data-trk-del]", host).forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-trk-del");
        if (!id) return;
        if (!confirm("Delete this truck?")) return;

        // unassign from jobs
        state.jobs = state.jobs.map(j => (j.truckId === id ? normalizeJob({ ...j, truckId: "", updatedAt: Date.now() }) : j));
        state.trucks = state.trucks.filter(x => x.id !== id);

        persist();
        renderTrucksIfPresent();
        fixComingSoonLabels();
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
        const type = prompt("Type:", t.type || "");
        if (type === null) return;
        const cap = prompt("Capacity:", t.capacity || "");
        if (cap === null) return;
        const notes = prompt("Notes:", t.notes || "");
        if (notes === null) return;

        t.label = label.trim();
        t.plate = plate.trim();
        t.type = type.trim();
        t.capacity = cap.trim();
        t.notes = notes.trim();
        t.updatedAt = Date.now();

        persist();
        renderTrucksIfPresent();
        fixComingSoonLabels();
      });
    });
  }

  // ---------------------------
  // Dispatch view (renders into #view-dispatch)
  // ---------------------------
  function renderDispatchIfPresent() {
    const host = $("#view-dispatch");
    if (!host) return;

    const dateStr = ymd(state.currentDate);
    const jobs = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled);
    const receipts = receiptsByDate(dateStr);
    const rev = sumJobRevenue(dateStr);
    const exp = sumReceiptExpense(dateStr);
    const net = clampMoney(rev - exp);

    const { driverConf, truckConf } = conflictsForDate(dateStr);

    // group by driver
    const byDriver = new Map();
    for (const j of jobs) {
      const key = j.driverId || "__unassigned__";
      if (!byDriver.has(key)) byDriver.set(key, []);
      byDriver.get(key).push(j);
    }

    // group by truck
    const byTruck = new Map();
    for (const j of jobs) {
      const key = j.truckId || "__unassigned__";
      if (!byTruck.has(key)) byTruck.set(key, []);
      byTruck.get(key).push(j);
    }

    const driverSections = Array.from(byDriver.entries())
      .sort((a,b) => {
        const an = a[0] === "__unassigned__" ? "ZZZ" : (driverName(a[0]) || "");
        const bn = b[0] === "__unassigned__" ? "ZZZ" : (driverName(b[0]) || "");
        return an.localeCompare(bn);
      })
      .map(([id, list]) => {
        const title = id === "__unassigned__" ? "Unassigned Driver" : (driverName(id) || "Driver");
        return `
          <div class="panel" style="margin-top:12px;">
            <div class="panel-header">
              <div class="panel-title">${escapeHtml(title)} <span class="muted">(${list.length})</span></div>
              <div class="panel-sub">Dispatch board by driver</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${list.map(j => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
                    <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
                    <div class="job-sub">Truck: <strong>${escapeHtml(truckLabel(j.truckId) || "Unassigned")}</strong> · Status: <strong>${escapeHtml(STATUS_LABEL[j.status] || "Scheduled")}</strong></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      })
      .join("");

    const truckSections = Array.from(byTruck.entries())
      .sort((a,b) => {
        const an = a[0] === "__unassigned__" ? "ZZZ" : (truckLabel(a[0]) || "");
        const bn = b[0] === "__unassigned__" ? "ZZZ" : (truckLabel(b[0]) || "");
        return an.localeCompare(bn);
      })
      .map(([id, list]) => {
        const title = id === "__unassigned__" ? "Unassigned Truck" : (truckLabel(id) || "Truck");
        return `
          <div class="panel" style="margin-top:12px;">
            <div class="panel-header">
              <div class="panel-title">${escapeHtml(title)} <span class="muted">(${list.length})</span></div>
              <div class="panel-sub">Dispatch board by truck</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${list.map(j => `
                <div class="job-row">
                  <div class="job-main">
                    <div class="job-title">${escapeHtml(j.customer || "Customer")} · ${money(j.amount)}</div>
                    <div class="job-sub">${escapeHtml(j.pickup || "Pickup")} → ${escapeHtml(j.dropoff || "Dropoff")}</div>
                    <div class="job-sub">Driver: <strong>${escapeHtml(driverName(j.driverId) || "Unassigned")}</strong> · Status: <strong>${escapeHtml(STATUS_LABEL[j.status] || "Scheduled")}</strong></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      })
      .join("");

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Dispatch</div>
          <div class="panel-sub">Daily dispatch board · ${escapeHtml(dateStr)}</div>
        </div>

        <div class="day-totals">
          <div><strong>Jobs:</strong> ${jobs.length}</div>
          <div><strong>Revenue:</strong> ${money(rev)} · <strong>Expenses:</strong> ${money(exp)} · <strong>Net:</strong> ${money(net)}</div>
          <div><strong>Receipts:</strong> ${receipts.length}</div>
        </div>

        ${(driverConf.length || truckConf.length) ? `
          <div class="day-totals" style="margin-top:10px;">
            <div><strong>⚠ Conflicts</strong></div>
            ${driverConf.length ? `<div>Driver conflicts: ${driverConf.map(d => `${escapeHtml(d.name)} (${d.c})`).join(", ")}</div>` : ""}
            ${truckConf.length ? `<div>Truck conflicts: ${truckConf.map(t => `${escapeHtml(t.label)} (${t.c})`).join(", ")}</div>` : ""}
          </div>
        ` : `<div class="muted" style="margin-top:10px;">No conflicts detected for this day.</div>`}

        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="goDayFromDispatch">Open Day Workspace</button>
          <button class="btn" type="button" id="goCalendarFromDispatch">Open Calendar</button>
        </div>
      </div>

      ${jobs.length ? `
        <div style="margin-top:12px;">
          <div class="muted" style="margin-bottom:8px;">Grouped boards</div>
          ${driverSections}
          ${truckSections}
        </div>
      ` : `
        <div class="panel" style="margin-top:12px;">
          <div class="panel-header">
            <div class="panel-title">No jobs scheduled</div>
            <div class="panel-sub">Dispatch needs jobs to display assignments and routing.</div>
          </div>
          <div class="muted">Go to Day Workspace and add jobs for ${escapeHtml(dateStr)}.</div>
        </div>
      `}
    `;

    $("#goDayFromDispatch")?.addEventListener("click", () => setView("day"));
    $("#goCalendarFromDispatch")?.addEventListener("click", () => setView("calendar"));
  }

  // ---------------------------
  // Render router
  // ---------------------------
  function renderAll() {
    renderDashboardPlaceholders();
    renderFullCalendarIfPresent();
    renderDayWorkspaceIfPresent();
    renderDriversIfPresent();
    renderTrucksIfPresent();
    renderDispatchIfPresent();
    fixComingSoonLabels();
  }

  // ---------------------------
  // Nav bindings
  // ---------------------------
  function bindNav() {
    $$("[data-view]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const v = btn.getAttribute("data-view");
        if (v) setView(v);
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
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init() {
    seedFleetIfEmpty();
    bindNav();
    fixComingSoonLabels();

    // Start on dashboard if you have views; otherwise just render placeholders
    const hasViews = $$('[id^="view-"]').length > 0;
    if (hasViews) setView($("#view-dashboard") ? "dashboard" : "day");
    else renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
