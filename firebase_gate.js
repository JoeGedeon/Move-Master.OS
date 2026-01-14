(function () {
  "use strict";

  /**
   * Firebase Feature Gate
   * ---------------------
   * This file MUST:
   * - Never block core app startup
   * - Never assume Firebase exists
   * - Never mutate core state
   * - Only activate AFTER core signals readiness
   */

  // Feature flag (single switch, reversible)
  const FIREBASE_ENABLED = true; // flip ONLY when ready

  function log(msg) {
    console.log("[FirebaseGate]", msg);
  }

  function waitForCore() {
    if (window.MM_CORE_READY === true) {
      log("Core detected. Safe to proceed.");

      if (FIREBASE_ENABLED) {
        initFirebase();
      } else {
        log("Firebase disabled by feature flag.");
      }

      return;
    }

    setTimeout(waitForCore, 50);
  }

  function initFirebase() {
    /**
     * Firebase will be initialized here later.
     * No imports. No config. No auth.
     * This is intentionally a no-op.
     */
    log("Firebase init entered (no integration yet).");
  }

  // Start polling for core readiness
  waitForCore();
})();
