/* =========================================================
   Move-Master.OS — apps_v5.js (Supabase-connected)
   - No build tools
   - Works with your existing index.html + styles.css
   - Injects login modal automatically (no HTML edits)
   - Reads org_id from org_members
   - Loads jobs/drivers/trucks and renders:
     Dashboard, Calendar, Day Workspace, Drivers, Trucks
   ========================================================= */

(() => {
  "use strict";

  // ---------------------------
  // 0) CONFIG — YOU MUST SET THESE 2
  // ---------------------------
  const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
  const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

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

  function setJsPill(ok, text) {
    const pill = $("#jsPill");
    if (!pill) return;
    pill.classList.toggle("ok", !!ok);
    pill.classList.toggle("bad", !ok);
    pill.textContent = text;
  }

  function safe(fn) { try { fn(); } catch (e) { console.error(e); } }

  // ---------------------------
  // Supabase client
  // ---------------------------
  let supabase = null;

  function initSupabase() {
    if (!window.supabase?.createClient) {
      setJsPill(false, "JS: Supabase CDN missing");
      throw new Error("Supabase JS CDN not loaded. Add <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script>");
    }
    if (!SUPABASE_URL.startsWith("http") || SUPABASE_ANON_KEY.length < 20) {
      setJsPill(false, "JS: Set Supabase keys");
      throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY in apps_v5.js");
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    view: "dashboard",
    currentDate: startOfDay(new Date()),
    monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    orgId: null,
    session: null,

    jobs: [],
    drivers: [],
    trucks: [],
    receipts: [], // (we’ll wire receipts next)
  };

  const STATUS = {
    scheduled: "scheduled",
    completed: "completed",
    cancelled: "cancelled",
  };

  // ---------------------------
  // Login UI (injected)
  // ---------------------------
  function ensureLoginModal() {
    if ($("#__loginModal")) return;

    const overlay = $("#modalOverlay") || (() => {
      const o = document.createElement("div");
      o.id = "modalOverlay";
      o.className = "modal-overlay";
      o.hidden = true;
      document.body.appendChild(o);
      return o;
    })();

    const modal = document.createElement("div");
    modal.id = "__loginModal";
    modal.className = "modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-header">
        <h3>Sign in</h3>
        <button id="__loginClose" class="icon-btn" type="button">✕</button>
      </div>

      <div id="__loginError" class="modal-error" hidden></div>

      <div class="modal-body">
        <label class="field">
          <span>Email</span>
          <input id="__loginEmail" type="email" placeholder="you@email.com" autocomplete="email" />
        </label>
        <label class="field">
          <span>Password</span>
          <input id="__loginPass" type="password" placeholder="••••••••" autocomplete="current-password" />
        </label>
      </div>

      <div class="modal-actions">
        <button id="__loginBtn" class="btn primary" type="button">Sign In</button>
        <button id="__loginCancel" class="btn" type="button">Cancel</button>
      </div>
    `;

    document.body.appendChild(modal);

    function close() {
      overlay.hidden = true;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      $("#__loginError").hidden = true;
      $("#__loginError").textContent = "";
    }

    $("#__loginClose").addEventListener("click", close);
    $("#__loginCancel").addEventListener("click", close);
    overlay.addEventListener("click", close);

    $("#__loginBtn").addEventListener("click", async () => {
      const email = ($("#__loginEmail").value || "").trim();
      const password = ($("#__loginPass").value || "").trim();
      const err = $("#__loginError");

      const fail = (msg) => {
        err.textContent = msg;
        err.hidden = false;
      };

      if (!email) return fail("Email required.");
      if (!password) return fail("Password required.");

      err.hidden = true;
      err.textContent = "";

      setJsPill(true, "JS: signing in…");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setJsPill(false, "JS: sign-in failed");
        return fail(error.message);
      }

      state.session = data.session;
      close();
      await bootData();
      setJsPill(true, "JS: ready ✅");
    });
  }

  function openLoginModal() {
    ensureLoginModal();
    const overlay = $("#modalOverlay");
    const modal = $("#__loginModal");
    overlay.hidden = false;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  // ---------------------------
  // Org resolution
  // ---------------------------
  async function resolveOrgId() {
    // expects org_members row exists (you said success ✅)
    const userId = state.session?.user?.id;
    if (!userId) throw new Error("No session user.");

    const { data, error } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.org_id) throw new Error("No org membership found. Insert org_members row (org_id + user_id + role).");

    state.orgId = data.org_id;
  }

  // ---------------------------
  // Data loaders
  // ---------------------------
  async function loadDrivers() {
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("org_id", state.orgId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    state.drivers = data || [];
  }

  async function loadTrucks() {
    const { data, error } = await supabase
      .from("trucks")
      .select("*")
      .eq("org_id", state.orgId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    state.trucks = data || [];
  }

  async function loadJobsForMonth() {
    const y = state.monthCursor.getFullYear();
    const m = state.monthCursor.getMonth(); // 0-index
    const from = `${y}-${pad2(m + 1)}-01`;
    const to = `${y}-${pad2(m + 1)}-${pad2(new Date(y, m + 1, 0).getDate())}`;

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("org_id", state.orgId)
      .gte("move_date", from)
      .lte("move_date", to)
      .order("move_date", { ascending: true });

    if (error) throw new Error(error.message);
    state.jobs = data || [];
  }

  // ---------------------------
  // View switching
  // ---------------------------
  function setView(name) {
    state.view = name;

    $$('[id^="view-"]').forEach((el) => el.classList.remove("active"));
    const panel = $(`#view-${name}`);
    if (panel) panel.classList.add("active");

    $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));

    renderAll();
  }

  // ---------------------------
  // Aggregations
  // ---------------------------
  function jobsByDate(dateStr) {
    return state.jobs.filter((j) => j.move_date === dateStr);
  }

  function sumJobRevenue(dateStr) {
    let total = 0;
    for (const j of jobsByDate(dateStr)) {
      if (j.status === STATUS.cancelled) continue;
      total += clampMoney(j.price_estimated ?? 0);
    }
    return clampMoney(total);
  }

  // ---------------------------
  // Renders
  // ---------------------------
  function renderDashboard() {
    const todayStr = ymd(state.currentDate);

    const todayLine = $("#todayLine");
    if (todayLine) todayLine.textContent = `Org: ${state.orgId ? "connected" : "not set"} · ${todayStr}`;

    const todayStats = $("#todayStats");
    if (todayStats) {
      const jobsToday = jobsByDate(todayStr);
      const rev = sumJobRevenue(todayStr);
      todayStats.innerHTML = `
        <div><strong>${jobsToday.length}</strong> job(s)</div>
        <div>Revenue (est): <strong>${money(rev)}</strong></div>
        <div class="muted">Tip: Add more jobs to see calendar markers.</div>
      `;
    }

    const monthSnapshot = $("#monthSnapshot");
    if (monthSnapshot) {
      const y = state.monthCursor.getFullYear();
      const m = state.monthCursor.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();

      let jobCount = 0;
      let revenue = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
        const js = jobsByDate(dateStr);
        jobCount += js.length;
        for (const j of js) if (j.status !== STATUS.cancelled) revenue += clampMoney(j.price_estimated ?? 0);
      }

      monthSnapshot.innerHTML = `
        <div><strong>${monthName(m)} ${y}</strong></div>
        <div>Jobs: <strong>${jobCount}</strong></div>
        <div>Revenue (est): <strong>${money(revenue)}</strong></div>
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

      btn.addEventListener("click", () => {
        state.currentDate = startOfDay(d);
        state.monthCursor = new Date(d.getFullYear(), d.getMonth(), 1);
        setView("day");
      });

      container.appendChild(btn);
    }
  }

  function renderCalendar() {
    const grid = $("#calendarGrid");
    const label = $("#monthLabel") || $("#calendarLabel");
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
    const today = startOfDay(new Date());

    for (let i = 0; i < firstDow; i++) {
      const pad = document.createElement("div");
      pad.className = "day pad";
      grid.appendChild(pad);
    }

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

      const js = jobsByDate(dateStr).filter(j => j.status !== STATUS.cancelled).length;
      if (js) {
        const chip = document.createElement("span");
        chip.className = "chip chip-jobs";
        chip.textContent = `${js} job${js === 1 ? "" : "s"}`;
        marker.appendChild(chip);
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

  function renderDay() {
    const dateStr = ymd(state.currentDate);

    const title = $("#dayTitle");
    if (title) title.textContent = `Day Workspace – ${dateStr}`;

    const list = $("#dayJobsList");
    if (!list) return;

    const jobs = jobsByDate(dateStr);

    const rev = sumJobRevenue(dateStr);
    list.innerHTML = `
      <div class="day-totals">
        <div><strong>Totals</strong></div>
        <div>Revenue (est): ${money(rev)} · Jobs: ${jobs.length}</div>
      </div>
      ${
        jobs.length
          ? jobs.map((j) => `
              <div class="job-row ${j.status === "completed" ? "is-completed" : ""} ${j.status === "cancelled" ? "is-cancelled" : ""}">
                <div class="job-main">
                  <div class="job-title">${escapeHtml(j.customer_name || "Customer")}</div>
                  <div class="job-sub">${escapeHtml(j.pickup_address || "Pickup")} → ${escapeHtml(j.dropoff_address || "Dropoff")} · ${money(j.price_estimated || 0)}</div>
                </div>
                <div class="job-actions">
                  <span class="chip chip-jobs">${escapeHtml(j.status)}</span>
                </div>
              </div>
            `).join("")
          : `<div class="muted empty">No jobs for this day yet.</div>`
      }
    `;
  }

  function renderDrivers() {
    const host = $("#view-drivers");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Drivers</div>
          <div class="panel-sub">Loaded from Supabase</div>
        </div>

        <div class="day-list">
          ${
            state.drivers.length
              ? state.drivers.map(d => `
                  <div class="job-row">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(d.name)}</div>
                      <div class="job-sub muted">${escapeHtml(d.phone || "")}</div>
                    </div>
                    <div class="job-actions">
                      <span class="chip">${d.active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                `).join("")
              : `<div class="muted empty">No drivers found.</div>`
          }
        </div>
      </div>
    `;
  }

  function renderTrucks() {
    const host = $("#view-trucks");
    if (!host) return;

    host.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">Trucks</div>
          <div class="panel-sub">Loaded from Supabase</div>
        </div>

        <div class="day-list">
          ${
            state.trucks.length
              ? state.trucks.map(t => `
                  <div class="job-row">
                    <div class="job-main">
                      <div class="job-title">${escapeHtml(t.label)}</div>
                      <div class="job-sub muted">${escapeHtml(t.capacity_class || "")} ${escapeHtml(t.plate || "")}</div>
                    </div>
                    <div class="job-actions">
                      <span class="chip">${t.active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                `).join("")
              : `<div class="muted empty">No trucks found.</div>`
          }
        </div>
      </div>
    `;
  }

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
        "Workspace";
    }

    if (state.view === "dashboard") renderDashboard();
    if (state.view === "calendar") renderCalendar();
    if (state.view === "day") renderDay();
    if (state.view === "drivers") renderDrivers();
    if (state.view === "trucks") renderTrucks();
  }

  // ---------------------------
  // Nav bindings
  // ---------------------------
  function bindNav() {
    $$("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (btn.dataset.view) setView(btn.dataset.view);
      });
    });

    $("#btnToday")?.addEventListener("click", async () => {
      state.currentDate = startOfDay(new Date());
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      await loadJobsForMonth();
      renderAll();
    });

    $("#btnPrev")?.addEventListener("click", async () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      await loadJobsForMonth();
      renderAll();
    });

    $("#btnNext")?.addEventListener("click", async () => {
      if (state.view === "calendar") {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      } else {
        state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
        state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
      }
      await loadJobsForMonth();
      renderAll();
    });

    $("#calPrev")?.addEventListener("click", async () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      await loadJobsForMonth();
      renderAll();
    });

    $("#calNext")?.addEventListener("click", async () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      await loadJobsForMonth();
      renderAll();
    });

    $("#calToday")?.addEventListener("click", async () => {
      const now = new Date();
      state.monthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      state.currentDate = startOfDay(now);
      await loadJobsForMonth();
      renderAll();
    });

    // Add a login button if you want (no HTML edits)
    const topRight = document.querySelector(".top-right");
    if (topRight && !$("#__btnLogin")) {
      const b = document.createElement("button");
      b.id = "__btnLogin";
      b.className = "btn";
      b.type = "button";
      b.textContent = "Login";
      b.addEventListener("click", () => openLoginModal());
      topRight.insertBefore(b, topRight.firstChild);
    }
  }

  // ---------------------------
  // Boot
  // ---------------------------
  async function bootData() {
    await resolveOrgId();
    await Promise.all([loadDrivers(), loadTrucks()]);
    await loadJobsForMonth();
    renderAll();
  }

  async function init() {
    setJsPill(false, "JS: loading…");
    initSupabase();
    ensureLoginModal();
    bindNav();

    // restore session if present
    const { data } = await supabase.auth.getSession();
    state.session = data.session;

    if (!state.session) {
      setJsPill(false, "JS: please login");
      openLoginModal();
      // still render dashboard shell
      if ($("#view-dashboard")) setView("dashboard");
      return;
    }

    await bootData();
    setJsPill(true, "JS: ready ✅");

    if ($("#view-dashboard")) setView("dashboard");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safe(() => init()));
  } else {
    safe(() => init());
  }
})();
