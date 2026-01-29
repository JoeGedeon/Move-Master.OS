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
    status: statusMap[fleetFlowJob.status] || 'scheduled',
    notes: fleetFlowJob.notes || '',
    
    _fleetFlowStatus: fleetFlowJob.status,
    _fleetFlowData: fleetFlowJob,
    
    createdAt: fleetFlowJob.createdAt || Date.now(),
    updatedAt: fleetFlowJob.updatedAt || Date.now()
  };
}

// ============================================================================
// DATABASE LAYER - Firebase Operations
// ============================================================================

class UnifiedDatabase {
  
  async getJobsForDate(dateStr) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const snapshot = await db.collection('jobs')
        .where('date', '==', dateStr)
        .get();
      
      const jobs = [];
      snapshot.forEach(doc => {
        const fleetFlowJob = { id: doc.id, ...doc.data() };
        jobs.push(translateFleetFlowToMM(fleetFlowJob));
      });
      
      return jobs;
    } catch (error) {
      console.error('Error loading jobs:', error);
      return [];
    }
  }
  
  async getJob(jobId) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const doc = await db.collection('jobs').doc(jobId).get();
      if (!doc.exists) return null;
      
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error('Error loading job:', error);
      return null;
    }
  }
  
  async createJob(mmJobData) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const jobId = `JOB-${Date.now()}`;
      
      const fleetFlowJob = {
        id: jobId,
        date: mmJobData.date,
        status: 'SURVEY',
        
        customer: mmJobData.customer,
        pickup: mmJobData.pickup,
        dropoff: mmJobData.dropoff,
        notes: mmJobData.notes,
        
        inventory: [],
        inventoryTotals: {
          estimatedCubicFeet: 0,
          revisedCubicFeet: 0,
          finalCubicFeet: 0
        },
        billing: {
          basePrice: 0,
          accessorialTotal: 0,
          approvedTotal: mmJobData.amount || 0,
          totalPaid: 0,
          balanceRemaining: mmJobData.amount || 0,
          isPaidInFull: false
        },
        labor: [],
        accessorials: {},
        warehouse: {},
        permissions: {
          driverCanEdit: true,
          clientCanSign: false
        },
        
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await db.collection('jobs').doc(jobId).set(fleetFlowJob);
      
      return translateFleetFlowToMM(fleetFlowJob);
      
    } catch (error) {
      console.error('Error creating job:', error);
      throw error;
    }
  }
  
  async updateJob(jobId, mmUpdates) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const existingJob = await this.getJob(jobId);
      if (!existingJob) throw new Error('Job not found');
      
      const updates = {
        customer: mmUpdates.customer !== undefined ? mmUpdates.customer : existingJob.customer,
        pickup: mmUpdates.pickup !== undefined ? mmUpdates.pickup : existingJob.pickup,
        dropoff: mmUpdates.dropoff !== undefined ? mmUpdates.dropoff : existingJob.dropoff,
        notes: mmUpdates.notes !== undefined ? mmUpdates.notes : existingJob.notes,
        date: mmUpdates.date !== undefined ? mmUpdates.date : existingJob.date,
        updatedAt: Date.now()
      };
      
      if (mmUpdates.amount !== undefined) {
        updates['billing.approvedTotal'] = mmUpdates.amount;
      }
      
      await db.collection('jobs').doc(jobId).update(updates);
      
      const updatedJob = await this.getJob(jobId);
      return translateFleetFlowToMM(updatedJob);
      
    } catch (error) {
      console.error('Error updating job:', error);
      throw error;
    }
  }
  
  async updateJobStatus(jobId, mmStatus) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const existingJob = await this.getJob(jobId);
      if (!existingJob) throw new Error('Job not found');
      
      let newFleetFlowStatus = existingJob.status;
      
      if (mmStatus === 'cancelled') {
        newFleetFlowStatus = 'CANCELLED';
      } else if (mmStatus === 'completed') {
        newFleetFlowStatus = 'COMPLETED';
      }
      
      await db.collection('jobs').doc(jobId).update({
        status: newFleetFlowStatus,
        updatedAt: Date.now()
      });
      
      const updatedJob = await this.getJob(jobId);
      return translateFleetFlowToMM(updatedJob);
      
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  }
  
  async deleteJob(jobId) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      await db.collection('jobs').doc(jobId).delete();
      
      const dispatchSnapshot = await db.collection('driverAssignments')
        .where('jobId', '==', jobId)
        .get();
      
      const batch = db.batch();
      dispatchSnapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
    } catch (error) {
      console.error('Error deleting job:', error);
      throw error;
    }
  }
  
  async getDispatchForDate(dateStr) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const snapshot = await db.collection('driverAssignments')
        .where('date', '==', dateStr)
        .get();
      
      const assignments = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        assignments[data.jobId] = {
          driverId: data.driverId || '',
          truckId: data.truckId || '',
          notes: data.notes || '',
          updatedAt: data.updatedAt || Date.now()
        };
      });
      
      return assignments;
      
    } catch (error) {
      console.error('Error loading dispatch:', error);
      return {};
    }
  }
  
  async saveDispatchAssignment(dateStr, jobId, assignment) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const docId = `${dateStr}_${jobId}`;
      
      await db.collection('driverAssignments').doc(docId).set({
        date: dateStr,
        jobId: jobId,
        driverId: assignment.driverId || '',
        truckId: assignment.truckId || '',
        notes: assignment.notes || '',
        updatedAt: Date.now()
      });
      
    } catch (error) {
      console.error('Error saving dispatch:', error);
      throw error;
    }
  }
  
  async clearDispatchForDate(dateStr) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const snapshot = await db.collection('driverAssignments')
        .where('date', '==', dateStr)
        .get();
      
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
    } catch (error) {
      console.error('Error clearing dispatch:', error);
      throw error;
    }
  }
  
  async getDrivers() {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const snapshot = await db.collection('users')
        .where('role', '==', 'driver')
        .get();
      
      const drivers = [];
      snapshot.forEach(doc => drivers.push({ id: doc.id, ...doc.data() }));
      return drivers;
    } catch (error) {
      console.error('Error loading drivers:', error);
      return [];
    }
  }
  
  async getTrucks() {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      const snapshot = await db.collection('trucks').get();
      const trucks = [];
      snapshot.forEach(doc => trucks.push({ id: doc.id, ...doc.data() }));
      return trucks;
    } catch (error) {
      console.error('Error loading trucks:', error);
      return [];
    }
  }
  
  async saveDriver(driver) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      if (driver.id) {
        await db.collection('users').doc(driver.id).set({
          ...driver,
          role: 'driver'
        });
      } else {
        const ref = await db.collection('users').add({
          ...driver,
          role: 'driver'
        });
        driver.id = ref.id;
      }
      return driver;
    } catch (error) {
      console.error('Error saving driver:', error);
      throw error;
    }
  }
  
  async saveTruck(truck) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      
      if (truck.id) {
        await db.collection('trucks').doc(truck.id).set(truck);
      } else {
        const ref = await db.collection('trucks').add(truck);
        truck.id = ref.id;
      }
      return truck;
    } catch (error) {
      console.error('Error saving truck:', error);
      throw error;
    }
  }
  
  async deleteDriver(driverId) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      await db.collection('users').doc(driverId).delete();
    } catch (error) {
      console.error('Error deleting driver:', error);
      throw error;
    }
  }
  
  async deleteTruck(truckId) {
    try {
      if (!db) throw new Error('Firebase not initialized');
      await db.collection('trucks').doc(truckId).delete();
    } catch (error) {
      console.error('Error deleting truck:', error);
      throw error;
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

const unifiedDB = new UnifiedDatabase();

export const MMAdapter = {
  async loadJobsForDate(dateStr) {
    return await unifiedDB.getJobsForDate(dateStr);
  },
  
  async loadDrivers() {
    return await unifiedDB.getDrivers();
  },
  
  async loadTrucks() {
    return await unifiedDB.getTrucks();
  },
  
  async loadDispatch(dateStr) {
    return await unifiedDB.getDispatchForDate(dateStr);
  },
  
  async saveJob(job) {
    if (job.id && job.id.startsWith('JOB-')) {
      return await unifiedDB.updateJob(job.id, job);
    } else {
      return await unifiedDB.createJob(job);
    }
  },
  
  async updateJobStatus(jobId, status) {
    return await unifiedDB.updateJobStatus(jobId, status);
  },
  
  async deleteJob(jobId) {
    return await unifiedDB.deleteJob(jobId);
  },
  
  async saveDispatchAssignment(dateStr, jobId, assignment) {
    return await unifiedDB.saveDispatchAssignment(dateStr, jobId, assignment);
  },
  
  async clearDispatch(dateStr) {
    return await unifiedDB.clearDispatchForDate(dateStr);
  },
  
  async saveDriver(driver) {
    return await unifiedDB.saveDriver(driver);
  },
  
  async saveTruck(truck) {
    return await unifiedDB.saveTruck(truck);
  },
  
  async deleteDriver(driverId) {
    return await unifiedDB.deleteDriver(driverId);
  },
  
  async deleteTruck(truckId) {
    return await unifiedDB.deleteTruck(truckId);
  }
};

export const FFAdapter = {
  async getDispatchAssignment(jobId, dateStr) {
    const assignments = await unifiedDB.getDispatchForDate(dateStr);
    return assignments[jobId] || null;
  },
  
  async getAssignedDriver(jobId, dateStr) {
    const assignment = await this.getDispatchAssignment(jobId, dateStr);
    if (!assignment || !assignment.driverId) return null;
    
    const drivers = await unifiedDB.getDrivers();
    return drivers.find(d => d.id === assignment.driverId) || null;
  }
};

export default {
  db: unifiedDB,
  MMAdapter,
  FFAdapter
};

console.log('✅ Unified Bridge loaded - Fleet Flow ↔ Move Masters connected');
