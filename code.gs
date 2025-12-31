/**
 * Move-Master.OS Sheets Endpoint (Google Apps Script Web App)
 * - Accepts POST JSON from your GitHub Pages app
 * - Writes to Google Sheets tabs
 * - Adds CORS headers (best effort)
 *
 * Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone
 */

const CONFIG = {
  // Optional shared secret. If blank, auth is disabled.
  // If set, your client should send Authorization: Bearer <TOKEN>
  TOKEN: "",

  // Spreadsheet target:
  // Leave blank to auto-create a new spreadsheet on first run.
  SPREADSHEET_ID: "",

  // Sheet/tab names
  SHEETS: {
    LOG: "Logs",
    JOBS: "Jobs",
    RECEIPTS: "Receipts",
    DISPATCH: "Dispatch",
    DRIVERS: "Drivers",
    TRUCKS: "Trucks",
    INVENTORY: "Inventory",
  }
};

function doGet(e) {
  return corsJson_({
    ok: true,
    message: "Move-Master.OS endpoint is alive. Use POST to send data.",
    time: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    // --- Auth (optional) ---
    if (CONFIG.TOKEN) {
      const auth = (e && e.parameter && e.parameter.authorization) ? e.parameter.authorization : "";
      // Note: Apps Script Web Apps don't always expose headers reliably.
      // We support passing ?authorization=Bearer%20TOKEN as a fallback.
      // If you want strict auth, keep TOKEN blank until you confirm headers pass through.
      if (auth !== `Bearer ${CONFIG.TOKEN}`) {
        return corsJson_({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    if (!e || !e.postData || !e.postData.contents) {
      return corsJson_({ ok: false, error: "Missing POST body" }, 400);
    }

    const raw = e.postData.contents;
    const payload = JSON.parse(raw);

    // Validate minimal fields
    const type = String(payload.type || "").trim();
    const app = String(payload.app || "").trim();
    const version = String(payload.version || "").trim();

    if (!app || !type) {
      return corsJson_({ ok: false, error: "Invalid payload: missing app/type" }, 400);
    }

    const ss = getOrCreateSpreadsheet_();
    const logSheet = ensureSheet_(ss, CONFIG.SHEETS.LOG, [
      "timestamp", "app", "version", "type", "dateISO", "counts", "raw"
    ]);

    // --- Write payload sections ---
    const result = {
      ok: true,
      received: { app, version, type },
      wrote: {}
    };

    if (type === "jobs" || type === "all") {
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      result.wrote.jobs = upsertJobs_(ss, jobs);
    }

    if (type === "receipts" || type === "all") {
      const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
      result.wrote.receipts = upsertReceipts_(ss, receipts);
    }

    if (type === "dispatch" || type === "all") {
      const dispatch = payload.dispatch && typeof payload.dispatch === "object" ? payload.dispatch : {};
      result.wrote.dispatch = upsertDispatch_(ss, dispatch);
    }

    if (type === "all") {
      const drivers = Array.isArray(payload.drivers) ? payload.drivers : [];
      const trucks = Array.isArray(payload.trucks) ? payload.trucks : [];
      const inventory = Array.isArray(payload.inventory) ? payload.inventory : [];

      result.wrote.drivers = upsertDrivers_(ss, drivers);
      result.wrote.trucks = upsertTrucks_(ss, trucks);
      result.wrote.inventory = upsertInventory_(ss, inventory);
    }

    // Log it (including counts)
    const counts = {
      jobs: (payload.jobs || []).length || 0,
      receipts: (payload.receipts || []).length || 0,
      drivers: (payload.drivers || []).length || 0,
      trucks: (payload.trucks || []).length || 0,
      inventory: (payload.inventory || []).length || 0,
      dispatchDays: payload.dispatch ? Object.keys(payload.dispatch).length : 0,
    };

    logSheet.appendRow([
      new Date().toISOString(),
      app,
      version,
      type,
      String(payload.dateISO || ""),
      JSON.stringify(counts),
      raw
    ]);

    return corsJson_(result, 200);

  } catch (err) {
    return corsJson_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    }, 500);
  }
}

/* =========================
   Writers
   ========================= */

function upsertJobs_(ss, jobs) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.JOBS, [
    "id","date","customer","pickup","dropoff","amount","status","notes","createdAt","updatedAt"
  ]);

  // Simple strategy: wipe and rewrite (safe + fast for now)
  // Later we can “upsert” by ID if you want.
  clearDataKeepHeader_(sh);

  if (!jobs.length) return { rows: 0 };

  const rows = jobs.map(j => ([
    j.id || "",
    j.date || "",
    j.customer || "",
    j.pickup || "",
    j.dropoff || "",
    Number(j.amount || 0),
    j.status || "",
    j.notes || "",
    j.createdAt || "",
    j.updatedAt || ""
  ]));

  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

function upsertReceipts_(ss, receipts) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.RECEIPTS, [
    "id","date","vendor","category","amount","driverId","linkedJobId","notes","createdAt","updatedAt"
  ]);

  clearDataKeepHeader_(sh);

  if (!receipts.length) return { rows: 0 };

  const rows = receipts.map(r => ([
    r.id || "",
    r.date || "",
    r.vendor || "",
    r.category || "",
    Number(r.amount || 0),
    r.driverId || "",
    r.linkedJobId || "",
    r.notes || "",
    r.createdAt || "",
    r.updatedAt || ""
  ]));

  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

function upsertDispatch_(ss, dispatch) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.DISPATCH, [
    "dateISO","jobId","driverId","truckId","notes","updatedAt"
  ]);

  clearDataKeepHeader_(sh);

  const dateKeys = Object.keys(dispatch || {});
  if (!dateKeys.length) return { rows: 0 };

  const rows = [];
  dateKeys.sort().forEach(dateISO => {
    const bucket = dispatch[dateISO] || {};
    Object.keys(bucket).forEach(jobId => {
      const a = bucket[jobId] || {};
      rows.push([
        dateISO,
        jobId,
        a.driverId || "",
        a.truckId || "",
        a.notes || "",
        a.updatedAt || ""
      ]);
    });
  });

  if (!rows.length) return { rows: 0 };
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

function upsertDrivers_(ss, drivers) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.DRIVERS, [
    "id","name","notes","createdAt","updatedAt"
  ]);

  clearDataKeepHeader_(sh);

  if (!drivers.length) return { rows: 0 };
  const rows = drivers.map(d => ([
    d.id || "",
    d.name || "",
    d.notes || "",
    d.createdAt || "",
    d.updatedAt || ""
  ]));
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

function upsertTrucks_(ss, trucks) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.TRUCKS, [
    "id","name","notes","createdAt","updatedAt"
  ]);

  clearDataKeepHeader_(sh);

  if (!trucks.length) return { rows: 0 };
  const rows = trucks.map(t => ([
    t.id || "",
    t.name || "",
    t.notes || "",
    t.createdAt || "",
    t.updatedAt || ""
  ]));
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

function upsertInventory_(ss, inventory) {
  const sh = ensureSheet_(ss, CONFIG.SHEETS.INVENTORY, [
    "id","name","category","cuft","createdAt","updatedAt"
  ]);

  clearDataKeepHeader_(sh);

  if (!inventory.length) return { rows: 0 };
  const rows = inventory.map(i => ([
    i.id || "",
    i.name || "",
    i.category || "",
    Number(i.cuft || 0),
    i.createdAt || "",
    i.updatedAt || ""
  ]));
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return { rows: rows.length };
}

/* =========================
   Spreadsheet helpers
   ========================= */

function getOrCreateSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  // Auto-create a new spreadsheet once
  const ss = SpreadsheetApp.create("Move-Master.OS Data");
  // Put its ID in logs so you can copy it into CONFIG later if you want
  Logger.log("Created spreadsheet: " + ss.getId());
  return ss;
}

function ensureSheet_(ss, name, headerRow) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const firstRow = sh.getRange(1, 1, 1, headerRow.length).getValues()[0];
  const hasHeader = firstRow.join("").trim().length > 0;

  if (!hasHeader) {
    sh.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function clearDataKeepHeader_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow <= 1) return;
  sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
}

/* =========================
   Response helpers (CORS-ish)
   ========================= */

function corsJson_(obj, statusCode) {
  const out = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  // Best-effort CORS headers (Apps Script Web Apps are… quirky)
  out.setHeader("Access-Control-Allow-Origin", "*");
  out.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  out.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Status code isn't directly supported in TextOutput, but we still include it in payload
  // If you need real HTTP codes, we can switch to HtmlService + doPost wrapper later.
  if (statusCode) {
    out.setHeader("X-Status", String(statusCode));
  }

  return out;
}
