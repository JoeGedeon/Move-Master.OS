/* =========================================================
   UNIFIED BRIDGE - Connects Fleet Flow API ↔ Move Masters OS
   ========================================================= */

// Wait for Firebase to be initialized by firebase_gate.js
function waitForFirebase() {
  return new Promise((resolve) => {
    if (window.firebase && window.firebase.firestore) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.firebase && window.firebase.firestore) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    }
  });
}

// Initialize after Firebase is ready
let db = null;

waitForFirebase().then(() => {
  db = firebase.firestore();
  console.log('✅ Unified Bridge: Firebase connected');
});

// ============================================================================
// TRANSLATION LAYER - Fleet Flow ↔ Move Masters
// ============================================================================

function translateFleetFlowToMM(fleetFlowJob) {
  const statusMap = {
    'SURVEY': 'scheduled',
    'PENDING_APPROVAL': 'scheduled',
    'AWAITING_SIGNATURE': 'scheduled',
    'LOADING': 'scheduled',
    'AWAITING_DISPATCH': 'scheduled',
    'EN_ROUTE_TO_WAREHOUSE': 'scheduled',
    'IN_WAREHOUSE': 'scheduled',
    'OUT_FOR_DELIVERY': 'scheduled',
    'PAYMENT_PENDING': 'scheduled',
    'UNLOAD_AUTHORIZED': 'scheduled',
    'COMPLETED': 'completed',
    'CANCELLED': 'cancelled'
  };

  return {
    id: fleetFlowJob.id,
    date: fleetFlowJob.date || new Date().toISOString().split('T')[0],
    customer: fleetFlowJob.customer || 'Customer',
    pickup: fleetFlowJob.pickup || '',
    dropoff: fleetFlowJob.dropoff || '',
    amount: fleetFlowJob.billing?.approvedTotal || 0,
    status: statusMap[fleetFlowJob​​​​​​​​​​​​​​​​
