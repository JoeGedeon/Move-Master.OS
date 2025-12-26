/* ============================================================
   apps_v5.js — NAV RECOVERY + VIEW ROUTER (Safe Reset)
   ------------------------------------------------------------
   Fixes: "Buttons press but do nothing" + everything stuck on
   "Coming Soon" + can't open pages.
   Works even if:
   - elements load late
   - data-view attributes are missing or inconsistent
   - multiple nav areas exist
   ============================================================ */

(() => {
  "use strict";

  // ---------- tiny helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const IMPLEMENTED = new Set([
    "dashboard",
    "calendar",
    "day",
    "drivers",
    "trucks",
    "dispatch",
    "finances",
    "inventory",
    "aiscanner",
  ]);

  // map button text -> view name (fallback when data-view is missing)
  const TEXT_TO_VIEW = [
    { match: /dashboard/i, view: "dashboard" },
    { match: /\bcalendar\b/i, view: "calendar" },
    { match: /day\s*workspace/i, view: "day" },
    { match: /\bdrivers?\b/i, view: "drivers" },
    { match: /\btrucks?\b/i, view: "trucks" },
    { match: /\bdispatch\b/i, view: "dispatch" },
    { match: /\bfinances?\b|\bfinance\b/i, view: "finances" },
    { match: /\binventory\b/i, view: "inventory" },
    { match: /ai\s*scanner/i, view: "aiscanner" },
  ];

  function getMainMount() {
    return (
      $("#mainContent") ||
      $("#main") ||
      $("main") ||
      $(".main") ||
      $(".main-content") ||
      $(".content") ||
      $("#content") ||
      document.body
    );
  }

  function ensureViewContainer(view) {
    const id = `view-${view}`;
    let el = document.getElementById(id);
    if (el) return el;

    // Try to find an existing "views" area, otherwise append to main
    const mount = getMainMount();

    el = document.createElement("section");
    el.id = id;
    el.className = "view";
    el.style.display = "none";
    el.style.padding = "12px";
    mount.appendChild(el);
    return el;
  }

  function ensureAllViews() {
    for (const v of IMPLEMENTED) ensureViewContainer(v);
  }

  function setActiveNav(view) {
    // highlight any element with data-view
    $$("[data-view]").forEach((b) => {
      b.classList.toggle("active", (b.getAttribute("data-view") || "").trim() === view);
    });
  }

  function hideAllViews() {
    $$('[id^="view-"]').forEach((v) => (v.style.display = "none"));
  }

  function showView(view) {
    hideAllViews();
    const el = ensureViewContainer(view);
    el.style.display = "block";
    setActiveNav(view);
  }

  // ---------- label fix: Coming Soon -> Active ----------
  function markActiveLabels() {
    // Update buttons with data-view
    $$("[data-view]").forEach((btn) => {
      const v = (btn.getAttribute("data-view") || "").trim();
      if (!IMPLEMENTED.has(v)) return;

      // Try common sublabel nodes first
      const sub = btn.querySelector(".sub") || btn.querySelector(".subtext") || btn.querySelector("small");
      if (sub && /coming\s*soon/i.test(sub.textContent || "")) sub.textContent = "Active";

      // fallback: replace in whole HTML
      if (/coming\s*soon/i.test(btn.textContent || "")) {
        btn.innerHTML = btn.innerHTML.replace(/coming\s*soon/gi, "Active");
      }
    });

    // If your sidebar items DO NOT have data-view, we still try to fix visible text
    // by replacing “Coming Soon” wherever it appears in nav-ish zones.
    const navZones = [$(".sidebar"), $(".topbar"), $(".toolbar"), $("nav")].filter(Boolean);
    for (const z of navZones) {
      // Don’t do a global document replace (that would be cursed).
      const nodes = $$("*", z);
      for (const n of nodes) {
        if (n.children.length) continue;
        if (/coming\s*soon/i.test(n.textContent || "")) {
          n.textContent = (n.textContent || "").replace(/coming\s*soon/gi, "Active");
        }
      }
    }
  }

  // ---------- Basic page content so you can SEE navigation works ----------
  function render(view) {
    const el = ensureViewContainer(view);

    // Only fill if blank-ish
    const t = (el.textContent || "").trim().toLowerCase();
    if (t.length > 10 && !t.includes("coming soon")) return;

    const titleMap = {
      dashboard: "Dashboard",
      calendar: "Calendar",
      day: "Day Workspace",
      drivers: "Drivers",
      trucks: "Trucks",
      dispatch: "Dispatch",
      finances: "Finances",
      inventory: "Inventory",
      aiscanner: "AI Scanner",
    };

    el.innerHTML = `
      <div style="border-radius:12px; padding:12px; background:rgba(0,0,0,0.35); color:#fff;">
        <div style="font-size:18px; font-weight:700;">${escapeHtml(titleMap[view] || view)}</div>
        <div style="opacity:0.85; margin-top:6px;">
          This view is now reachable. Next step is loading your real tables/spreadsheets into it.
        </div>
      </div>
    `;
  }

  function renderAllOnce() {
    for (const v of IMPLEMENTED) render(v);
  }

  // ---------- Click router (EVENT DELEGATION) ----------
  function resolveViewFromClick(target) {
    if (!target) return null;

    // climb up to something clickable
    const clickable =
      target.closest?.("[data-view]") ||
      target.closest?.("button, a, [role='button'], .nav-item, .tile, .card") ||
      target;

    if (!clickable) return null;

    // First: data-view attribute
    const dv = (clickable.getAttribute?.("data-view") || "").trim();
    if (dv && IMPLEMENTED.has(dv)) return dv;

    // Second: ID naming patterns (rare but helpful)
    const id = (clickable.id || "").toLowerCase();
    if (id.startsWith("nav-")) {
      const guess = id.replace("nav-", "");
      if (IMPLEMENTED.has(guess)) return guess;
    }

    // Third: text match fallback
    const txt = (clickable.textContent || "").trim();
    if (!txt) return null;

    for (const m of TEXT_TO_VIEW) {
      if (m.match.test(txt)) return m.view;
    }

    return null;
  }

  function bindRouter() {
    // Remove any old router if it exists (prevents duplicate binds)
    document.removeEventListener("click", window.__FLEET_ROUTER_CAPTURE__, true);

    window.__FLEET_ROUTER_CAPTURE__ = (e) => {
      const view = resolveViewFromClick(e.target);
      if (!view) return;

      // If this is a link, stop it from navigating away
      if (e.target?.closest?.("a")) e.preventDefault();

      // Route
      showView(view);
      render(view);
    };

    // Capture phase so overlays / nested handlers don’t break routing
    document.addEventListener("click", window.__FLEET_ROUTER_CAPTURE__, true);
  }

  // ---------- Proof JS is running (tiny badge) ----------
  function showJsOkBadge() {
    // Don’t create duplicates
    if ($("#jsOkBadge")) return;

    const b = document.createElement("div");
    b.id = "jsOkBadge";
    b.textContent = "JS OK";
    b.style.position = "fixed";
    b.style.bottom = "10px";
    b.style.right = "10px";
    b.style.zIndex = "999999";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "999px";
    b.style.font = "600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    b.style.background = "rgba(0, 150, 80, 0.9)";
    b.style.color = "white";
    b.style.pointerEvents = "none";
    document.body.appendChild(b);
  }

  // ---------- Make sure pointer events aren't disabled globally ----------
  function fixPointerEvents() {
    // Sometimes a bad CSS rule sets pointer-events:none on containers.
    // We gently force nav zones back to normal without touching your layout.
    const zones = [$(".sidebar"), $(".topbar"), $(".toolbar"), $("nav")].filter(Boolean);
    zones.forEach((z) => {
      z.style.pointerEvents = "auto";
    });
  }

  // ---------- INIT ----------
  function init() {
    console.log("✅ apps_v5.js (Nav Recovery) loaded");
    showJsOkBadge();
    ensureAllViews();
    fixPointerEvents();
    markActiveLabels();
    renderAllOnce();
    bindRouter();

    // Start on dashboard by default, but DON’T overwrite your real dashboard
    showView("dashboard");
    render("dashboard");

    // Repeat label fix a moment later (some UIs render late)
    setTimeout(markActiveLabels, 250);
    setTimeout(markActiveLabels, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
