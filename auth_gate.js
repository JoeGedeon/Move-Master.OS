(function () {
  "use strict";

  function log(msg) {
    console.log("[AuthGate]", msg);
  }

  // Default: not signed in
  window.MM_AUTH_READY = false;

  // Ensure button exists (idempotent)
  function ensureAuthButton() {
    const mount = document.getElementById("authMount");
    if (!mount) return null;

    let btn = mount.querySelector("button");
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "nav-item";
      btn.textContent = "Sign In";
      btn.onclick = () => {
        if (!window.firebase || !firebase.auth) {
          alert("Firebase not ready yet");
          return;
        }
        alert("Firebase Auth UI comes next");
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

  waitForFirebase();
})();
