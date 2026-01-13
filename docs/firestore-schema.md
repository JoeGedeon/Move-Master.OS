# Firestore Schema

## users
Document ID: Firebase Auth UID  
Fields:
- role: string ("admin" | "dispatcher" | "driver")
- displayName: string
- phone: string
- active: boolean
- createdAt: timestamp

## jobs
Document ID: auto  
Fields:
- customerName: string
- status: string ("NEW" | "ASSIGNED" | "ENROUTE" | "COMPLETED")
- createdAt: timestamp

## driverAssignments
Document ID: auto  
Fields:
- jobId: string (jobs/{jobId})
- driverIds: string[]
- truckId: string | null
- date: timestamp
- status: string ("assigned" | "enroute" | "completed")
- createdAt: timestamp
- createdBy: string (admin/dispatcher UID)

## automationRules
Document ID: auto  
Fields:
- name: string
- actionType: string
- triggerCollection: string
- triggerField: string
- triggerEquals: string
- enabled: boolean
- createdAt: timestamp

## automationRuns
Document ID: auto  
Fields:
- ruleName: string
- status: string
- createdAt: timestamp
