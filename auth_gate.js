(function () {
  "use strict";

  function log(msg) {
    console.log("[AuthGate]", msg);
  }

  window.MM_AUTH_READY = false;

  function ensureAuthButton() {
    const mount = document.getElementById("authMount");
    if (!mount) return false;

    let btn = mount.querySelector("button");
    if (!btn) {
      btn = document.createElement("button");
      btn.className = "nav-item";
      btn.textContent = "Sign In";
      btn.type = "button";

      btn.onclick = () => {
        if (!window.firebase || !firebase.auth) {
          alert("Firebase not ready yet");
          return;
        }
        alert("Firebase Auth UI comes next");
      };

      mount.appendChild(btn);
      log("Auth button mounted");
    }

    return true;
  }

  function waitForDOM() {
    if (!document.getElementById("authMount")) {
      return setTimeout(waitForDOM, 50);
    }
    waitForFirebase();
  }

  function waitForFirebase() {
    ensureAuthButton();

    if (!window.firebase || !firebase.auth) {
      log("Waiting for Firebase Auth…");
      return setTimeout(waitForFirebase, 100);
    }

    firebase.auth().onAuthStateChanged((user) => {
      window.MM_AUTH_READY = !!user;
      const btn = document.querySelector("#authMount button");
      if (btn) btn.textContent = user ? "Signed In" : "Sign In";
    });
  }

  waitForDOM();
})();
