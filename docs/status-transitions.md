# Status Transitions

This document defines the only allowed state transitions in the system.
Any transition not listed here is invalid.

---

## jobs.status

Allowed transitions:

- NEW → ASSIGNED
- ASSIGNED → ENROUTE
- ENROUTE → COMPLETED

Notes:
- Jobs may only move forward.
- Jobs may not skip states.
- Jobs may not be modified by drivers directly.

---

## driverAssignments.status

Allowed transitions:

- assigned → enroute
- enroute → completed

Notes:
- Driver assignments are controlled by the assigned driver(s).
- Driver assignments may not move backward.
- Completion of a driverAssignment may trigger a job status update.

---

## Invalid Transitions

The following are explicitly disallowed:

- NEW → ENROUTE
- NEW → COMPLETED
- ASSIGNED → COMPLETED
- completed → any other state
- enroute → assigned

Any transition not listed above must be rejected by UI and server rules.
