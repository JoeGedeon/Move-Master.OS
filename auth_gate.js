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

  // Default: not signed in
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

      // 🔁 UI reflection (NON-blocking, safe)
      const btn = document.querySelector("#authMount button");
      if (btn) btn.textContent = user ? "Signed In" : "Sign In";
    });
  }

  // Start watching for Firebase
  waitForFirebase();
})();

(function () {
  /**
   * Auth Button Mount
   * =================
   * - Creates Sign In button
   * - Safe to run even if Firebase is not ready
   * - NO app state changes
   */

  const mount = document.getElementById("authMount");
  if (!mount) return;

  const btn = document.createElement("button");
  btn.className = "nav-item";
  btn.textContent = "Sign In";

  btn.onclick = async () => {
    if (!window.firebase || !firebase.auth) {
      alert("Firebase not ready yet");
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();

    try {
      const result = await firebase.auth().signInWithPopup(provider);
      const user = result.user;

      console.log("[AuthGate] Signed in as:", user.email || user.uid);
    } catch (err) {
      console.error("[AuthGate] Sign-in failed:", err);
      alert("Sign-in failed. Check console.");
    }
  };

  mount.appendChild(btn);
})();
