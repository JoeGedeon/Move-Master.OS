// storage.js — localStorage persistence + normalization

import { STATUS, RECEIPT_CATEGORIES } from "./state.js";

const KEYS = {
  jobs: "fleet_jobs_v6",
  receipts: "fleet_receipts_v6",
  drivers: "fleet_drivers_v6",
  trucks: "fleet_trucks_v6",
  dispatch: "fleet_dispatch_v6",
};

export const pad2 = (n) => String(n).padStart(2, "0");
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function clampMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function money(n) {
  return `$${clampMoney(n).toFixed(2)}`;
}

export function makeId(prefix = "id") {
  try { return crypto.randomUUID(); }
  catch { return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
}

export function load(key) {
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? JSON.parse(raw) : [];
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

export function save(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
}

export function normalizeJob(j) {
  const job = { ...(j || {}) };
  job.id = job.id || makeId("job");
  job.date = job.date || ymd(startOfDay(new Date()));
  job.status = job.status in STATUS ? job.status : STATUS.scheduled;

  job.jobNumber = (job.jobNumber || "").trim();
  job.customer = (job.customer || "").trim();
  job.pickup = (job.pickup || "").trim();
  job.dropoff = (job.dropoff || "").trim();
  job.amount = clampMoney(job.amount ?? 0);
  job.volume = clampMoney(job.volume ?? 0);
  job.notes = (job.notes || "").trim();

  job.driverId = (job.driverId || "").trim();
  job.truckId = (job.truckId || "").trim();

  job.createdAt = job.createdAt || Date.now();
  job.updatedAt = job.updatedAt || job.createdAt;
  return job;
}

export function normalizeReceipt(r) {
  const rec = { ...(r || {}) };
  rec.id = rec.id || makeId("rcpt");
  rec.date = rec.date || ymd(startOfDay(new Date()));

  rec.vendor = (rec.vendor || "").trim();
  rec.category = (rec.category || "").trim();
  if (rec.category && !RECEIPT_CATEGORIES.includes(rec.category)) {
    rec.category = "Other";
  }
  rec.amount = clampMoney(rec.amount ?? 0);
  rec.notes = (rec.notes || "").trim();
  rec.jobId = (rec.jobId || "").trim();

  rec.createdAt = rec.createdAt || Date.now();
  rec.updatedAt = rec.updatedAt || rec.createdAt;
  return rec;
}

export function normalizeDriver(d) {
  const drv = { ...(d || {}) };
  drv.id = drv.id || makeId("drv");
  drv.name = (drv.name || "").trim();
  drv.role = (drv.role || "Driver").trim(); // Driver / Helper / Lead
  drv.phone = (drv.phone || "").trim();
  drv.status = (drv.status || "Active").trim(); // Active / Off / Suspended
  drv.notes = (drv.notes || "").trim();
  drv.createdAt = drv.createdAt || Date.now();
  drv.updatedAt = drv.updatedAt || drv.createdAt;
  return drv;
}

export function normalizeTruck(t) {
  const trk = { ...(t || {}) };
  trk.id = trk.id || makeId("trk");
  trk.unit = (trk.unit || "").trim();     // Truck # / Unit #
  trk.plate = (trk.plate || "").trim();
  trk.capacity = (trk.capacity || "").trim(); // e.g. 26ft, Sprinter
  trk.status = (trk.status || "Ready").trim(); // Ready / In Shop / Assigned
  trk.notes = (trk.notes || "").trim();
  trk.createdAt = trk.createdAt || Date.now();
  trk.updatedAt = trk.updatedAt || trk.createdAt;
  return trk;
}

export function normalizeDispatch(row) {
  const d = { ...(row || {}) };
  d.id = d.id || makeId("dsp");
  d.date = d.date || ymd(startOfDay(new Date()));
  d.jobId = (d.jobId || "").trim();
  d.driverId = (d.driverId || "").trim();
  d.truckId = (d.truckId || "").trim();
  d.startTime = (d.startTime || "08:00").trim();
  d.endTime = (d.endTime || "12:00").trim();
  d.notes = (d.notes || "").trim();
  d.createdAt = d.createdAt || Date.now();
  d.updatedAt = d.updatedAt || d.createdAt;
  return d;
}

export function loadAll() {
  return {
    jobs: load(KEYS.jobs).map(normalizeJob),
    receipts: load(KEYS.receipts).map(normalizeReceipt),
    drivers: load(KEYS.drivers).map(normalizeDriver),
    trucks: load(KEYS.trucks).map(normalizeTruck),
    dispatch: load(KEYS.dispatch).map(normalizeDispatch),
  };
}

export function saveAll({ jobs, receipts, drivers, trucks, dispatch }) {
  save(KEYS.jobs, jobs);
  save(KEYS.receipts, receipts);
  save(KEYS.drivers, drivers);
  save(KEYS.trucks, trucks);
  save(KEYS.dispatch, dispatch);
}

export function seedIfEmpty(store) {
  const isEmpty =
    store.jobs.length === 0 &&
    store.receipts.length === 0 &&
    store.drivers.length === 0 &&
    store.trucks.length === 0 &&
    store.dispatch.length === 0;

  if (!isEmpty) return store;

  const today = ymd(startOfDay(new Date()));
  store.drivers = [
    normalizeDriver({ name: "Sample Driver", role: "Driver", phone: "555-0101", status: "Active" }),
  ];
  store.trucks = [
    normalizeTruck({ unit: "Truck 12", plate: "ABC-123", capacity: "26ft", status: "Ready" }),
  ];
  store.jobs = [
    normalizeJob({ date: today, jobNumber: "J-1001", customer: "Sample Customer", pickup: "Pickup", dropoff: "Dropoff", amount: 1100, volume: 900, status: "scheduled", driverId: store.drivers[0].id, truckId: store.trucks[0].id }),
  ];
  store.receipts = [
    normalizeReceipt({ date: today, vendor: "Shell", category: "Fuel", amount: 68.42, notes: "Fuel for job", jobId: store.jobs[0].id }),
  ];
  store.dispatch = [
    normalizeDispatch({ date: today, jobId: store.jobs[0].id, driverId: store.drivers[0].id, truckId: store.trucks[0].id, startTime: "08:00", endTime: "12:00", notes: "Morning move" }),
  ];

  saveAll(store);
  return store;
}
