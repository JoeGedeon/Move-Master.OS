(function () {
  "use strict";

  /**
   * Firebase Feature Gate
   * ---------------------
   * Rules:
   * - Must NEVER block core app startup
   * - Must NEVER assume Firebase is available
   * - Must NEVER touch core state or UI
   * - Must activate ONLY after MM_CORE_READY === true
   */

  // 🔒 Feature flag (single reversible switch)
  const FIREBASE_ENABLED = true;

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
    if (!window.firebase || !firebase.initializeApp) {
      log("Firebase SDK not found. Aborting safely.");
      return;
    }

    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.appspot.com",
      messagingSenderId: "YOUR_SENDER_ID",
      appId: "YOUR_APP_ID"
    };

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        log("Firebase initialized successfully.");
      } else {
        log("Firebase already initialized.");
      }
    } catch (err) {
      console.error("[FirebaseGate] Init failed:", err);
    }
  }

  // 🚦 Start polling for core readiness
  waitForCore();
})();
