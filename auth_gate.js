(function () {
  "use strict";

  /**
   * Auth Gate
   * =========
   * - Decides IF a user is signed in
   * - Does NOT block the app
   * - Does NOT touch app logic
   * - Reflects auth state in the sidebar button only
   */

  function log(msg) {
    console.log("[AuthGate]", msg);
  }

  // Default: not signed in
  window.MM_AUTH_READY = false;

  // Ensure Sign In button exists (idempotent, safe)
  function ensureAuthButton() {
    const mount = document.getElementById("authMount");
    if (!mount) return null;

    let btn = mount.querySelector("button");

    if (!btn) {
      btn = document.createElement("button");
      btn.className = "nav-item";
      btn.textContent = "Sign In";

      btn.onclick = async () => {
        if (!window.firebase || !firebase.auth) {
          alert("Firebase not ready yet");
          return;
        }

        const provider = new firebase.auth.GoogleAuthProvider();

        try {
          await firebase.auth().signInWithPopup(provider);
        } catch (err) {
          console.error("[AuthGate] Sign-in failed:", err);
          alert("Sign-in failed");
        }
      };

      mount.appendChild(btn);
    }

    return btn;
  }

  function waitForFirebase() {
    ensureAuthButton();

    if (!window.firebase || !firebase.auth) {
      log("Waiting for Firebase Auth...");
      return setTimeout(waitForFirebase, 100);
    }

    log("Firebase Auth detected");
    listenForAuth();
  }

  function listenForAuth() {
    firebase.auth().onAuthStateChanged((user) => {
      window.MM_AUTH_READY = !!user;

      log(user ? "User signed in" : "No user signed in");

      const btn = ensureAuthButton();
      if (btn) {
        btn.textContent = user ? "Signed In" : "Sign In";
      }
    });
  }

  // Start watching
  waitForFirebase();
})();
