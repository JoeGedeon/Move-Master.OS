(function () {
    "use strict";

   /**
     * Firebase Feature Gate
     * ---------------------
     * Rules:
     * - Must NEVER block core app startup
     * - Must NEVER assume Firebase is available
     * - Must NEVER touch core state or UI
     * - Initializes Firebase as soon as the SDK is ready
     */

   // Feature flag (single reversible switch)
   const FIREBASE_ENABLED = true;

   function log(msg) {
         console.log("[FirebaseGate]", msg);
   }

   if (!FIREBASE_ENABLED) {
         log("Firebase disabled by feature flag. Skipping init.");
         return;
   }

   const firebaseConfig = {
         apiKey: "AIzaSyA0f42Pv4N7MDKWYixg5a-D3MrjldU--Pw",
         authDomain: "movemastersos.firebaseapp.com",
         projectId: "movemastersos",
         storageBucket: "movemastersos.firebasestorage.app",
         messagingSenderId: "422211525514",
         appId: "1:422211525514:web:e94d355b1720d816eec673"
   };

   function waitForFirebaseSDK() {
         if (!window.firebase || !firebase.initializeApp) {
                 setTimeout(waitForFirebaseSDK, 50);
                 return;
         }
         initFirebase();
   }

   function initFirebase() {
         if (!window.firebase || !firebase.initializeApp) {
                 log("Firebase SDK not found. Aborting safely.");
                 return;
         }

      try {
              if (!firebase.apps.length) {
                        firebase.initializeApp(firebaseConfig);
                        log("Firebase initialized successfully.");
              } else {
                        log("Firebase already initialized.");
              }

           // Signal that Firebase is ready for other modules
           window.MM_FIREBASE_READY = true;

      } catch (err) {
              console.error("[FirebaseGate] Init failed:", err);
      }
   }

   // Start polling for Firebase SDK
   waitForFirebaseSDK();

})();
