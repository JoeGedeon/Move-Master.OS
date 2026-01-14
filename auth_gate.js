(function () {
  "use strict";

  /**
   * Auth Gate
   * =========
   * This file decides IF the app is allowed to start.
   * It does NOT touch app logic.
   * It does NOT modify state.
   * It only listens and reports.
   */

  function log(msg) {
    console.log("[AuthGate]", msg);
  }

  // We assume "not signed in" by default
  window.MM_AUTH_READY = false;

  function waitForFirebase() {
    if (!window.firebase || !firebase.auth) {
      log("Waiting for Firebase Auth...");
      return setTimeout(waitForFirebase, 100);
    }

    log("Firebase Auth detected");
    listenForAuth();
  }

  function listenForAuth() {
    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        log("User signed in:", user.email || user.uid);
        window.MM_AUTH_READY = true;
      } else {
        log("No user signed in");
        window.MM_AUTH_READY = false;
      }
    });
  }

  // Start watching
  waitForFirebase();
})();

(function () {
  const mount = document.getElementById("authMount");
  if (!mount) return;

  const btn = document.createElement("button");
  btn.className = "nav-item";
  btn.textContent = "Sign In";

  btn.onclick = () => {
    alert("Firebase Auth UI comes next");
  };

  mount.appendChild(btn);
})();
