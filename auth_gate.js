(function () {
  "use strict";

  var TAG = "[AuthGate]";
  function log(m) { console.log(TAG, m); }
  function warn(m) { console.warn(TAG, m); }

  window.MM_AUTH_READY   = false;
  window.MM_CURRENT_USER = null;
  window.MM_USER_ROLE    = null;

  /* ====== MODAL ====== */

  var MODAL_ID = "mm-auth-modal";

  function buildModal() {
    if (document.getElementById(MODAL_ID)) return;
    var overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px)";
    overlay.innerHTML = '<div style="background:#1a1f2e;border:1px solid #2e3650;border-radius:12px;padding:32px;width:340px;box-shadow:0 24px 64px rgba(0,0,0,0.6)">'
      + '<h2 style="color:#e2e8f0;margin:0 0 4px;font-size:18px;font-weight:700">Move-Master.OS</h2>'
      + '<p style="color:#64748b;margin:0 0 24px;font-size:13px">Fleet + Moving CRM</p>'
      + '<div id="mm-auth-error" style="display:none;background:#3d1515;border:1px solid #7f1d1d;border-radius:6px;color:#fca5a5;font-size:13px;padding:10px 12px;margin-bottom:16px"></div>'
      + '<label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;letter-spacing:.5px">EMAIL</label>'
      + '<input id="mm-auth-email" type="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;background:#0f1220;border:1px solid #2e3650;border-radius:6px;color:#e2e8f0;font-size:14px;padding:10px 12px;margin-bottom:16px;outline:none" />'
      + '<label style="display:block;color:#94a3b8;font-size:12px;font-weight:600;margin-bottom:6px;letter-spacing:.5px">PASSWORD</label>'
      + '<input id="mm-auth-pass" type="password" placeholder="••••••••" style="width:100%;box-sizing:border-box;background:#0f1220;border:1px solid #2e3650;border-radius:6px;color:#e2e8f0;font-size:14px;padding:10px 12px;margin-bottom:24px;outline:none" />'
      + '<button id="mm-auth-submit" style="width:100%;background:#3b82f6;border:none;border-radius:6px;color:#fff;font-size:14px;font-weight:600;padding:12px;cursor:pointer">Sign In</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) removeModal(); });
    overlay.addEventListener("keydown", function (e) { if (e.key === "Enter") attemptSignIn(); });
    document.getElementById("mm-auth-submit").addEventListener("click", attemptSignIn);
    setTimeout(function () { var el = document.getElementById("mm-auth-email"); if (el) el.focus(); }, 50);
  }

  function removeModal() { var m = document.getElementById(MODAL_ID); if (m) m.remove(); }

  function showAuthError(msg) {
    var el = document.getElementById("mm-auth-error");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  }

  function setSubmitLoading(loading) {
    var btn = document.getElementById("mm-auth-submit");
    if (!btn) return;
    btn.textContent = loading ? "Signing in…" : "Sign In";
    btn.disabled = loading;
    btn.style.background = loading ? "#1e40af" : "#3b82f6";
  }

  /* ====== SIGN IN / OUT ====== */

  function attemptSignIn() {
    var email = (document.getElementById("mm-auth-email") || {}).value || "";
    var pass  = (document.getElementById("mm-auth-pass")  || {}).value || "";
    if (!email || !pass) { showAuthError("Email and password are required."); return; }
    setSubmitLoading(true);
    firebase.auth().signInWithEmailAndPassword(email.trim(), pass)
      .then(function () { log("Sign-in successful."); removeModal(); })
      .catch(function (err) {
        setSubmitLoading(false);
        showAuthError(friendlyError(err.code));
        warn("Sign-in failed: " + err.code);
      });
  }

  function signOut() {
    firebase.auth().signOut()
      .then(function () { log("Signed out."); })
      .catch(function (e) { warn("Sign-out error: " + e.message); });
  }

  function friendlyError(code) {
    var map = {
      "auth/user-not-found":       "No account found with that email.",
      "auth/wrong-password":       "Incorrect password.",
      "auth/invalid-email":        "Please enter a valid email address.",
      "auth/invalid-credential":   "Email or password is incorrect.",
      "auth/too-many-requests":    "Too many attempts. Please wait and try again.",
      "auth/network-request-failed": "Network error. Check your connection.",
      "auth/user-disabled":        "This account has been disabled."
    };
    return map[code] || "Sign-in failed. Please try again.";
  }

  /* ====== SIDEBAR BUTTON ====== */

  function renderAuthButton(user) {
    var mount = document.getElementById("authMount");
    if (!mount) return;
    mount.innerHTML = "";
    if (!user) {
      var btn = document.createElement("button");
      btn.className = "nav-item";
      btn.textContent = "Sign In";
      btn.type = "button";
      btn.addEventListener("click", function () {
        if (!window.firebase || !firebase.auth) { alert("Firebase not ready yet."); return; }
        buildModal();
      });
      mount.appendChild(btn);
    } else {
      var wrap = document.createElement("div");
      wrap.style.cssText = "padding:6px 8px";
      var role = document.createElement("div");
      role.style.cssText = "color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase";
      role.textContent = (window.MM_USER_ROLE || "office").toUpperCase();
      var emailEl = document.createElement("div");
      emailEl.style.cssText = "color:#e2e8f0;font-size:12px;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px";
      emailEl.textContent = user.email || user.uid.substring(0, 12) + "…";
      var out = document.createElement("button");
      out.className = "nav-item";
      out.textContent = "Sign Out";
      out.type = "button";
      out.style.cssText = "font-size:12px;padding:6px 10px;color:#ef4444;border-color:#ef4444;width:100%";
      out.addEventListener("click", signOut);
      wrap.appendChild(role);
      wrap.appendChild(emailEl);
      wrap.appendChild(out);
      mount.appendChild(wrap);
    }
  }

  /* ====== ROLE LOOKUP ====== */

  function fetchUserRole(uid) {
    if (!window.firebase || !firebase.firestore) return;
    firebase.firestore().collection("users").doc(uid).get()
      .then(function (snap) {
        window.MM_USER_ROLE = snap.exists ? (snap.data().role || "office") : "office";
        if (!snap.exists) log("No /users doc for " + uid + " — defaulting to office.");
        log("Role: " + window.MM_USER_ROLE);
        renderAuthButton(firebase.auth().currentUser);
        window.dispatchEvent(new CustomEvent("mm:auth:statechange", {
          detail: { user: firebase.auth().currentUser, role: window.MM_USER_ROLE }
        }));
      })
      .catch(function (err) {
        warn("Role fetch failed: " + err.message);
        window.MM_USER_ROLE = "office";
      });
  }

  /* ====== AUTH STATE LISTENER ====== */

  function startAuthListener() {
    firebase.auth().onAuthStateChanged(function (user) {
      window.MM_AUTH_READY   = !!user;
      window.MM_CURRENT_USER = user || null;
      renderAuthButton(user);
      if (user) {
        log("Signed in: " + user.email + " (" + user.uid + ")");
        fetchUserRole(user.uid);
        if (window.MM_BRIDGE && typeof window.MM_BRIDGE.restart === "function") {
          window.MM_BRIDGE.restart();
        }
      } else {
        log("Signed out — stopping bridge.");
        window.MM_USER_ROLE = null;
        if (window.MM_BRIDGE && typeof window.MM_BRIDGE.stop === "function") {
          window.MM_BRIDGE.stop();
        }
        window.dispatchEvent(new CustomEvent("mm:auth:statechange", {
          detail: { user: null, role: null }
        }));
      }
    });
  }

  /* ====== BOOT ====== */

  function waitForDOM(cb, n) {
    n = n || 0;
    if (document.getElementById("authMount")) { cb(); return; }
    if (n > 100) { warn("authMount not found."); return; }
    setTimeout(function () { waitForDOM(cb, n + 1); }, 50);
  }

  function waitForFirebase(cb, n) {
    n = n || 0;
    if (window.MM_FIREBASE_READY === true && window.firebase && firebase.auth) { cb(); return; }
    if (n > 200) { warn("Firebase not ready — auth aborted."); return; }
    setTimeout(function () { waitForFirebase(cb, n + 1); }, 100);
  }

  waitForDOM(function () {
    renderAuthButton(null);
    waitForFirebase(function () {
      log("Firebase ready. Starting auth listener.");
      startAuthListener();
    });
  });

})();
