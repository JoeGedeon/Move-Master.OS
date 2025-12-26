// apps_v5.js — entry module (boots app, binds events, calls render)

import { state, STATUS, STATUS_LABEL, VIEWS } from "./state.js";
import {
  loadAll,
  saveAll,
  seedIfEmpty,
  normalizeJob,
  normalizeReceipt,
  normalizeDriver,
  normalizeTruck,
  normalizeDispatch,
  startOfDay,
  ymd,
  clampMoney,
} from "./storage.js";
import { ensureScaffold, renderAll } from "./render.js";

console.log("✅ apps_v5.js module loaded");

function badge() {
  if (document.getElementById("jsBadge")) return;
  const b = document.createElement("div");
  b.id = "jsBadge";
  b.textContent = "JS ✅";
  b.style.position = "fixed";
  b.style.right = "12px";
  b.style.bottom = "12px";
  b.style.zIndex = "999999";
  b.style.padding = "8px 12px";
  b.style.borderRadius = "999px";
  b.style.background = "rgba(0,160,90,0.92)";
  b.style.color = "#fff";
  b.style.font = "800 12px system-ui";
  b.style.pointerEvents = "none";
  document.body.appendChild(b);
}

function persist() {
  saveAll({
    jobs: state.jobs,
    receipts: state.receipts,
    drivers: state.drivers,
    trucks: state.trucks,
    dispatch: state.dispatch,
  });
}

function loadState() {
  const store = seedIfEmpty(loadAll());
  state.jobs = store.jobs;
  state.receipts = store.receipts;
  state.drivers = store.drivers;
  state.trucks = store.trucks;
  state.dispatch = store.dispatch;

  state.currentDate = startOfDay(new Date());
  state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
}

function setView(view) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  renderAll();
}

function bindNav() {
  // Delegated navigation
  document.addEventListener("click", (e) => {
    const nav = e.target.closest?.("[data-view]");
    if (nav?.dataset?.view) {
      e.preventDefault();
      setView(nav.dataset.view);
    }
  }, true);

  // Optional topbar controls if present
  document.getElementById("btnToday")?.addEventListener("click", () => {
    state.currentDate = startOfDay(new Date());
    state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    renderAll();
  });

  document.getElementById("btnPrev")?.addEventListener("click", () => {
    if (state.view === "calendar") {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
    } else {
      state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() - 1));
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    }
    renderAll();
  });

  document.getElementById("btnNext")?.addEventListener("click", () => {
    if (state.view === "calendar") {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
    } else {
      state.currentDate = startOfDay(new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), state.currentDate.getDate() + 1));
      state.monthCursor = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    }
    renderAll();
  });
}

function bindDayWorkspaceActions() {
  document.addEventListener("click", (e) => {
    // Add Job
    if (e.target?.id === "jobAdd") {
      const dateStr = ymd(state.currentDate);
      const jobNumber = (document.getElementById("jobNum")?.value || "").trim();
      const customer = (document.getElementById("jobCustomer")?.value || "").trim();
      const pickup = (document.getElementById("jobPickup")?.value || "").trim();
      const dropoff = (document.getElementById("jobDropoff")?.value || "").trim();
      const amount = clampMoney(document.getElementById("jobAmount")?.value ?? 0);

      if (!customer) return alert("Customer is required.");
      if (amount < 0) return alert("Amount must be 0 or more.");

      state.jobs.push(normalizeJob({
        date: dateStr,
        jobNumber,
        customer,
        pickup,
        dropoff,
        amount,
        status: STATUS.scheduled,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      persist();
      renderAll();
    }

    // Job delete
    const del = e.target.closest?.("[data-job-del]");
    if (del) {
      const id = del.getAttribute("data-job-del");
      if (!id) return;
      if (!confirm("Delete this job?")) return;
      state.jobs = state.jobs.filter(j => j.id !== id);
      // unlink receipts
      state.receipts = state.receipts.map(r => r.jobId === id ? normalizeReceipt({ ...r, jobId:"", updatedAt:Date.now() }) : r);
      persist();
      renderAll();
      return;
    }

    // Job edit
    const edit = e.target.closest?.("[data-job-edit]");
    if (edit) {
      const id = edit.getAttribute("data-job-edit");
      const j = state.jobs.find(x => x.id === id);
      if (!j) return;

      const customer = prompt("Customer:", j.customer || "");
      if (customer === null) return;
      const pickup = prompt("Pickup:", j.pickup || "");
      if (pickup === null) return;
      const dropoff = prompt("Dropoff:", j.dropoff || "");
      if (dropoff === null) return;
      const amount = prompt("Amount:", String(j.amount ?? 0));
      if (amount === null) return;

      j.customer = customer.trim();
      j.pickup = pickup.trim();
      j.dropoff = dropoff.trim();
      j.amount = clampMoney(amount);
      j.updatedAt = Date.now();

      persist();
      renderAll();
      return;
    }

    // Receipt add
    if (e.target?.id === "rcAdd") {
      const dateStr = ymd(state.currentDate);
      const vendor = (document.getElementById("rcVendor")?.value || "").trim();
      const amount = clampMoney(document.getElementById("rcAmount")?.value ?? 0);
      const category = (document.getElementById("rcCategory")?.value || "").trim();
      const jobId = (document.getElementById("rcJob")?.value || "").trim();
      const notes = (document.getElementById("rcNotes")?.value || "").trim();

      if (!vendor) return alert("Vendor is required.");
      if (amount <= 0) return alert("Amount must be greater than 0.");

      state.receipts.push(normalizeReceipt({
        date: dateStr,
        vendor, amount, category, jobId, notes,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      persist();
      renderAll();
      return;
    }

    // Receipt delete
    const rdel = e.target.closest?.("[data-rc-del]");
    if (rdel) {
      const id = rdel.getAttribute("data-rc-del");
      if (!id) return;
      if (!confirm("Delete this receipt?")) return;
      state.receipts = state.receipts.filter(r => r.id !== id);
      persist();
      renderAll();
      return;
    }

    // Receipt edit
    const redit = e.target.closest?.("[data-rc-edit]");
    if (redit) {
      const id = redit.getAttribute("data-rc-edit");
      const r = state.receipts.find(x => x.id === id);
      if (!r) return;

      const vendor = prompt("Vendor:", r.vendor || "");
      if (vendor === null) return;
      const amount = prompt("Amount:", String(r.amount ?? 0));
      if (amount === null) return;
      const category = prompt("Category:", r.category || "");
      if (category === null) return;
      const notes = prompt("Notes:", r.notes || "");
      if (notes === null) return;

      r.vendor = vendor.trim();
      r.amount = clampMoney(amount);
      r.category = category.trim();
      r.notes = notes.trim();
      r.updatedAt = Date.now();

      persist();
      renderAll();
      return;
    }

    // Sheet add/save/delete (drivers/trucks/dispatch)
    const addSheet = e.target.closest?.("[data-sheet-add]");
    if (addSheet) {
      const kind = addSheet.getAttribute("data-sheet-add");
      if (kind === "drivers") state.drivers.push(normalizeDriver({ name:"", role:"Driver", status:"Active" }));
      if (kind === "trucks") state.trucks.push(normalizeTruck({ unit:"", status:"Ready" }));
      if (kind === "dispatch") state.dispatch.push(normalizeDispatch({ date: ymd(state.currentDate) }));
      renderAll();
      return;
    }

    const delSheet = e.target.closest?.("[data-sheet-del]");
    if (delSheet) {
      const kind = delSheet.getAttribute("data-sheet-del");
      const id = delSheet.getAttribute("data-id");
      if (!kind || !id) return;
      if (!confirm("Delete this row?")) return;
      state[kind] = (state[kind] || []).filter(r => r.id !== id);
      persist();
      renderAll();
      return;
    }

    const saveSheet = e.target.closest?.("[data-sheet-save]");
    if (saveSheet) {
      // Pull contenteditable cells into state before saving
      const kind = saveSheet.getAttribute("data-sheet-save");
      const rows = document.querySelectorAll(`tr[data-sheet="${kind}"]`);
      rows.forEach(tr => {
        const id = tr.getAttribute("data-id");
        const row = (state[kind] || []).find(r => r.id === id);
        if (!row) return;
        tr.querySelectorAll("td[data-col]").forEach(td => {
          const col = td.getAttribute("data-col");
          row[col] = (td.textContent || "").trim();
        });
        row.updatedAt = Date.now();
      });
      persist();
      alert("Saved ✅");
      renderAll();
      return;
    }
  }, true);

  // Job status change delegated
  document.addEventListener("change", (e) => {
    const sel = e.target.closest?.("select[data-job-status]");
    if (!sel) return;
    const id = sel.getAttribute("data-job-status");
    const j = state.jobs.find(x => x.id === id);
    if (!j) return;
    j.status = STATUS_LABEL[sel.value] ? sel.value : STATUS.scheduled;
    j.updatedAt = Date.now();
    persist();
    renderAll();
  }, true);
}

function init() {
  badge();
  ensureScaffold();
  loadState();
  bindNav();
  bindDayWorkspaceActions();
  setView("dashboard");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
