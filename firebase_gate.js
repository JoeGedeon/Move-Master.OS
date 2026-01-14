(function () {
  "use strict";

  // Feature flag
  const FIREBASE_ENABLED = true; // <-- stays false until everything works

  function log(msg) {
    console.log("[FirebaseGate]", msg);
  }

  function waitForCore() {
    if (window.MM_CORE_READY === true) {
      log("Core detected. Safe to proceed.");
      if (FIREBASE_ENABLED) initFirebase();
      return;
    }
    setTimeout(waitForCore, 50);
  }

  function initFirebase() {
    log("Firebase init skipped (disabled).");
  }

  waitForCore();
})();
