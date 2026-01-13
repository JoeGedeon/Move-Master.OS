## Dispatcher Dashboard
Role: admin, dispatcher

Reads:
- jobs
- driverAssignments

Writes:
- jobs.status (NEW → ASSIGNED)
- driverAssignments (create)

---

## Driver View
Role: driver

Reads:
- driverAssignments (where driverIds contains UID)

Writes:
- driverAssignments.status (assigned → enroute → completed)
