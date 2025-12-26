/* =========================================================
   apps_v5.js — DIAGNOSTIC BOOT + ROUTER PROOF
   Purpose:
   - Prove the file is executing (badge)
   - Show errors on-screen (iPad Safari friendly)
   - Prove clicks are being captured (tap log)
   - No modules, no imports, no dependencies
   ========================================================= */
(() => {
  "use strict";

  // ---------- On-screen logger ----------
  function ensurePanel() {
    let p = document.getElementById("__diagPanel");
    if (p) return p;

    p = document.createElement("div");
    p.id = "__diagPanel";
    p.style.cssText = [
      "position:fixed",
      "left:12px",
      "right:12px",
      "bottom:12px",
      "z-index:999999",
      "max-height:42vh",
      "overflow:auto",
      "background:rgba(0,0,0,.82)",
      "color:#fff",
      "padding:10px",
      "border-radius:12px",
      "font:12px/1.35 system-ui, -apple-system, Segoe UI, Roboto",
      "display:none",
      "white-space:pre-wrap"
    ].join(";");

    const title = document.createElement("div");
    title.style.cssText = "font-weight:900;margin-bottom:8px;";
    title.textContent = "DIAGNOSTICS";
    p.appendChild(title);

    const body = document.createElement("div");
    body.id = "__diagBody";
    p.appendChild(body);

    document.body.appendChild(p);
    return p;
  }

  function logLine(msg) {
    const p = ensurePanel();
    p.style.display = "block";
    const body = document.getElementById("__diagBody");
    const line = document.createElement("div");
    line.textContent = msg;
    body.appendChild(line);
    p.scrollTop = p.scrollHeight;
  }

  // ---------- Hard proof badge ----------
  function badge(text, ok = true) {
    let b = document.getElementById("__jsBadge");
    if (!b) {
      b = document.createElement("div");
      b.id = "__jsBadge";
      b.style.cssText = [
        "position:fixed",
        "top:12px",
        "right:12px",
        "z-index:999999",
        "padding:8px 12px",
        "border-radius:999px",
        "font:900 12px system-ui, -apple-system",
        "color:#fff",
        "pointer-events:none"
      ].join(";");
      document.body.appendChild(b);
    }
    b.style.background = ok ? "rgba(0,160,90,.92)" : "rgba(180,0,0,.92)";
    b.textContent = text;
  }

  // ---------- Catch errors that normally disappear ----------
  window.addEventListener("error", (e) => {
    badge("JS ❌ ERROR", false);
    logLine("❌ window.error");
    logLine(String(e?.message || "Unknown error"));
    if (e?.filename) logLine("File: " + e.filename);
    if (typeof e?.lineno === "number") logLine("Line: " + e.lineno + " Col: " + e.colno);
  });

  window.addEventListener("unhandledrejection", (e) => {
    badge("JS ❌ PROMISE ERROR", false);
    logLine("❌ unhandledrejection");
    logLine(String(e?.reason?.message || e?.reason || "Unknown rejection"));
  });

  // ---------- Start marker ----------
  function init() {
    badge("JS ✅ EXECUTING", true);
    logLine("✅ apps_v5.js is executing.");
    logLine("URL: " + location.href);
    logLine("Time: " + new Date().toLocaleString());

    // Prove click capture (if your UI is covered by an overlay, this will show it)
    document.addEventListener("click", (evt) => {
      const el = evt.target;
      const tag = el?.tagName ? el.tagName.toLowerCase() : "unknown";
      const txt = (el?.textContent || "").trim().slice(0, 40);
      logLine(`👆 click: <${tag}> "${txt}"`);
    }, true);

    // Minimal router proof: if elements have data-view, show which one was clicked
    document.addEventListener("click", (evt) => {
      const btn = evt.target.closest?.("[data-view]");
      if (!btn) return;
      evt.preventDefault();
      const v = btn.dataset.view;
      logLine(`➡️ data-view clicked: ${v}`);
    }, true);

    // Overlay detector: finds fixed elements that could be blocking clicks
    setTimeout(() => {
      const blockers = [];
      document.querySelectorAll("body *").forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed" && cs.display !== "none" && cs.visibility !== "hidden") {
          const z = parseInt(cs.zIndex || "0", 10);
          const r = el.getBoundingClientRect();
          // giant fixed layer candidate
          if (r.width > innerWidth * 0.8 && r.height > innerHeight * 0.6 && z >= 10) {
            blockers.push({ el, z, w: r.width, h: r.height });
          }
        }
      });
      blockers.sort((a,b) => b.z - a.z);
      if (blockers.length) {
        logLine("⚠️ Possible click-blocking overlay(s) detected:");
        blockers.slice(0,3).forEach((b, i) => {
          logLine(`  #${i+1} z-index=${b.z} size=${Math.round(b.w)}x${Math.round(b.h)} tag=<${b.el.tagName.toLowerCase()}> id="${b.el.id}" class="${b.el.className}"`);
        });
      } else {
        logLine("✅ No obvious click-blocking overlay detected.");
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
