(function () {
  "use strict";

  function log(msg) {
    console.log("[FirebaseInit]", msg);
  }

  // Firebase SDKs must already be loaded via <script> tags
  if (!window.firebase) {
    log("Firebase SDK not found. Aborting init.");
    return;
  }

  try {
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT.appspot.com",
      messagingSenderId: "YOUR_SENDER_ID",
      appId: "YOUR_APP_ID"
    };

    firebase.initializeApp(firebaseConfig);
    log("Firebase initialized successfully ✅");

    // Signal readiness (DO NOT use yet)
    window.MM_FIREBASE_READY = true;

  } catch (err) {
    console.error("[FirebaseInit] Init failed:", err);
  }
})();
