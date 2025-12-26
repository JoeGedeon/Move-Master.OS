// state.js — single source of truth (date-first)

export const STATUS = {
  scheduled: "scheduled",
  completed: "completed",
  cancelled: "cancelled",
};

export const STATUS_LABEL = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RECEIPT_CATEGORIES = [
  "Fuel",
  "Tolls",
  "Supplies",
  "Parking",
  "Meals",
  "Maintenance",
  "Lodging",
  "Other",
];

export const VIEWS = [
  "dashboard",
  "calendar",
  "day",
  "jobs",
  "receipts",
  "drivers",
  "trucks",
  "dispatch",
  "finances",
  "inventory",
  "aiscanner",
];

export const state = {
  view: "dashboard",
  currentDate: new Date(),
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),

  jobs: [],
  receipts: [],
  drivers: [],
  trucks: [],
  dispatch: [],

  debug: false,
};
