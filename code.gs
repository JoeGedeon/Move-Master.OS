const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  logs: "Logs",
};
/** Move-Master.OS — Apps Script Web App (CORS-safe)
 *  Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone
 */

const SHEET_NAMES = {
  jobs: "Jobs",
  receipts: "Receipts",
  dispatch: "Dispatch",
  drivers: "Drivers",
  trucks: "Trucks",
  inventory: "Inventory",
  log: "Log",
};

function doGet(e) {
  return corsTextResponse_("Move-Master.OS endpoint is live ✅");
}

function doPost(e) {
  try {
    const raw = e?.postData?.contents || "";
    const payload = raw ? JSON.parse(raw) : {};

    // Basic shape guard
    const type = (payload.type || "").toString().trim();
    if (!type) return corsJsonResponse_({ ok:false, error:"Missing payload.type" }, 400);

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Route writes
    if (type === "jobs" || type === "all") upsertArray_(ss, SHEET_NAMES.jobs, payload.jobs || []);
    if (type === "receipts" || type === "all") upsertArray_(ss, SHEET_NAMES.receipts, payload.receipts || []);
    if (type === "dispatch" || type === "all") upsertDispatch_(ss, SHEET_NAMES.dispatch, payload.dispatch || {});
    if (type === "all") {
      upsertArray_(ss, SHEET_NAMES.drivers, payload.drivers || []);
      upsertArray_(ss, SHEET_NAMES.trucks, payload.trucks || []);
      upsertArray_(ss, SHEET_NAMES.inventory, payload.inventory || []);
    }

    // Optional log
    appendLog_(ss, SHEET_NAMES.log, payload);

    return corsJsonResponse_({
      ok: true,
      message: "Received ✅",
      receivedType: type,
      receivedAt: new Date().toISOString(),
    });

  } catch (err) {
    return corsJsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    }, 500);
  }
}

/** CORS preflight support (Apps Script doesn't officially expose OPTIONS,
 *  but you can still return CORS headers on all responses and keep requests "simple".
 *  We'll also provide a doGet that confirms it's live.
 */
function corsJsonResponse_(obj, statusCode) {
  const out = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  // Apps Script doesn't let us set status directly via ContentService reliably,
  // but we still return a valid response body + CORS headers.
  return addCorsHeaders_(out);
}

function corsTextResponse_(text) {
  const out = ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.TEXT);
  return addCorsHeaders_(out);
}

function addCorsHeaders_(output) {
  // Note: Apps Script Web Apps don’t expose full header control like Node,
  // but this pattern works for most browser cases when requests are "simple".
  // If you add custom headers (like Authorization), the browser does preflight
  // and Apps Script often can't satisfy it. So keep it simple.
  return output;
}

/** Write an array of objects to a sheet as a table */
function upsertArray_(ss, sheetName, arr) {
  const sheet = getOrCreate_(ss, sheetName);

  if (!Array.isArray(arr) || arr.length === 0) {
    // Still ensure header exists
    if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,1).setValue("empty");
    return;
  }

  // Build headers from union of keys
  const keys = unionKeys_(arr);

  // Write header
  sheet.clearContents();
  sheet.getRange(1, 1, 1, keys.length).setValues([keys]);

  // Write rows
  const rows = arr.map(obj => keys.map(k => normalizeCell_(obj[k])));
  sheet.getRange(2, 1, rows.length, keys.length).setValues(rows);
}

/** Dispatch is nested object: { "YYYY-MM-DD": { "jobId": {driverId, truckId,...} } } */
function upsertDispatch_(ss, sheetName, dispatchObj) {
  const sheet = getOrCreate_(ss, sheetName);
  sheet.clearContents();

  const headers = ["dateISO", "jobId", "driverId", "truckId", "notes", "updatedAt"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const rows = [];
  const dates = Object.keys(dispatchObj || {}).sort();
  for (const dateISO of dates) {
    const bucket = dispatchObj[dateISO] || {};
    for (const jobId of Object.keys(bucket)) {
      const a = bucket[jobId] || {};
      rows.push([
        dateISO,
        jobId,
        a.driverId || "",
        a.truckId || "",
        a.notes || "",
        a.updatedAt ? new Date(a.updatedAt).toISOString() : "",
      ]);
    }
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function appendLog_(ss, sheetName, payload) {
  const sheet = getOrCreate_(ss, sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,4).setValues([["timestamp","type","dateISO","version"]]);
  }
  sheet.appendRow([
    new Date().toISOString(),
    (payload.type || ""),
    (payload.dateISO || ""),
    (payload.version || ""),
  ]);
}

function getOrCreate_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function unionKeys_(arr) {
  const set = {};
  arr.forEach(o => Object.keys(o || {}).forEach(k => set[k] = true));
  return Object.keys(set);
}

function normalizeCell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
