/* =========================================================
   Shared Job Schema — Fleet Flow ↔ Move Masters
   ========================================================= */

export const JobStatus = {
  SURVEY:                             'SURVEY',
  PENDING_APPROVAL:                   'PENDING_APPROVAL',
  AWAITING_SIGNATURE:                 'AWAITING_SIGNATURE',
  LOADING:                            'LOADING',
  AWAITING_DISPATCH:                  'AWAITING_DISPATCH',
  EN_ROUTE_TO_WAREHOUSE:              'EN_ROUTE_TO_WAREHOUSE',
  IN_WAREHOUSE:                       'IN_WAREHOUSE',
  AWAITING_WAREHOUSE_DISPATCH:        'AWAITING_WAREHOUSE_DISPATCH',
  AWAITING_OUTTAKE:                   'AWAITING_OUTTAKE',
  OUT_FOR_DELIVERY:                   'OUT_FOR_DELIVERY',
  PAYMENT_PENDING:                    'PAYMENT_PENDING',
  UNLOAD_AUTHORIZED:                  'UNLOAD_AUTHORIZED',
  DELIVERY_AWAITING_CLIENT_CONFIRMATION: 'DELIVERY_AWAITING_CLIENT_CONFIRMATION',
  DELIVERY_AWAITING_DRIVER_EVIDENCE:  'DELIVERY_AWAITING_DRIVER_EVIDENCE',
  COMPLETED:                          'COMPLETED',
  CANCELLED:                          'CANCELLED'
};

export function createJob(id) {
  return {
    id,
    status: JobStatus.SURVEY,

    customer: '',
    pickup: '',
    dropoff: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],

    inventory: [],
    inventoryTotals: {
      estimatedCubicFeet: 0,
      revisedCubicFeet: 0,
      finalCubicFeet: 0
    },

    billing: {
      basePrice: 0,
      accessorialTotal: 0,
      approvedTotal: null,
      totalPaid: 0,
      balanceRemaining: null,
      isPaidInFull: false,
      paymentReceived: false,
      pricingBreakdown: null
    },

    paymentLedger: [],
    labor: [],
    accessorials: {
      longCarryFeet: 0,
      stairs: 0,
      elevator: false,
      bulkyItems: [],
      shuttleRequired: false,
      storageHandling: false,
      notes: ''
    },

    warehouse: {},
    communications: [],
    permissions: {
      driverCanEdit: true,
      clientCanSign: false,
      officeCanAuthorizeUnload: false,
      driverCanUnload: false
    },

    pricingInputs: {
      region: 'FL',
      season: 'standard'
    },

    clientSigned: false,
    clientSignedAt: null,
    driverSigned: false,
    driverSignedAt: null,
    loadingEvidence: null,
    deliveryEvidence: null,
    deliveryConfirmedByClient: false,
    deliveryConfirmedAt: null,
    arrivedAt: null,
    proposedChanges: null,

    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
