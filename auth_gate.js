((function () {
  "use strict";

  function log(msg) {
    console.log("[AuthGate]", msg);
  }

  window.MM_AUTH_READY = false;

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

        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithRedirect(provider);
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
