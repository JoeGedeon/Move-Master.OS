/*******************************************************
 * Move-Master Sheets Endpoint (Web App)
 *
 * IMPORTANT:
 * 1) Set SPREADSHEET_ID to the *correct* "Move-Master.OS Data" file
 *    (the one with Jobs/Drivers/Trucks/Dispatch/Receipts/Assignments/Logs).
 * 2) Deploy as Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3) Paste the /exec URL into your Move-Master.OS "Sheets" tab.
 *******************************************************/

const SPREADSHEET_ID = "PASTE_YOUR_MOVE_MASTER_OS_DATA_SHEET_ID_HERE"; // <-- REQUIRED
const TOKEN = ""; // optional shared secret. Leave "" to disable.

const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  logs: "Logs",
};

// Define headers for each tab (Row 1)
const HEADERS = {
  Jobs: ["timestamp", "job_id", "customer", "phone", "email", "date", "start_time", "end_time", "origin", "destination", "notes", "payload_json"],
  Drivers: ["timestamp", "driver_id", "name", "phone", "email", "status", "notes", "payload_json"],
  Trucks: ["timestamp", "truck_id", "label", "plate", "status", "notes", "payload_json"],
  Dispatch: ["timestamp", "dispatch_id", "job_id", "truck_id", "lead_driver_id", "status", "notes", "payload_json"],
  Receipts: ["timestamp", "receipt_id", "job_id", "vendor", "amount", "date", "category", "notes", "payload_json"],
  Assignments: ["timestamp", "job_id", "truck_id", "driver_id", "role", "start_time", "end_time", "hours", "pay_rate", "pay_type", "notes", "payload_json"],
  Logs: ["timestamp", "event", "table", "rows", "status", "message", "payload_json"],
};

/**
 * Run ONCE manually to create sheets + headers.
 * Apps Script -> select "setup" in dropdown -> Run -> authorize.
 */
function setup() {
  const ss = getSs_();
  Object.values(SHEET_MAP).forEach((name) => ensureSheetWithHeaders_(ss, name));
  logEvent_("setup", "system", 0, "ok", "Sheets + headers ensured.");
}

/**
 * Health check in browser:
 * Open your /exec URL in Safari and you should see JSON.
 */
function doGet(e) {
  return jsonResponse_({
    ok: true,
    service: "Move-Master Sheets Endpoint",
    time: new Date().toISOString(),
    hint: "Send POST JSON to write rows",
  }, 200);
}

/**
 * Main endpoint: accepts POST JSON from your app.
 * Supports:
 * - { table: "jobs", rows: [ {...}, {...} ] }
 * - { table: "assignments", rows: [ {...} ] }
 * - { jobs:[...], drivers:[...], ... }  (bulk push)
 */
function doPost(e) {
  try {
    // --- Auth (optional) ---
    if (TOKEN) {
      const auth = getHeader_(e, "authorization") || (e && e.parameter && e.parameter.token) || "";
      const token = auth.replace(/^Bearer\s+/i, "").trim();
      if (token !== TOKEN) {
        logEvent_("auth_fail", "system", 0, "fail", "Invalid token");
        return jsonResponse_({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    // --- Parse body ---
    const bodyText = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!bodyText) {
      logEvent_("bad_request", "system", 0, "fail", "Empty body");
      return jsonResponse_({ ok: false, error: "Empty body" }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (err) {
      logEvent_("bad_json", "system", 0, "fail", String(err));
      return jsonResponse_({ ok: false, error: "Invalid JSON", detail: String(err) }, 400);
    }

    const ss = getSs_();
    // Ensure all known sheets exist
    Object.values(SHEET_MAP).forEach((name) => ensureSheetWithHeaders_(ss, name));

    // Normalize incoming data into a list of write ops: [{tableKey, rows}]
    const ops = normalizePayload_(payload);

    let totalRows = 0;
    const results = [];

    ops.forEach(op => {
      const sheetName = SHEET_MAP[op.tableKey];
      if (!sheetName) return;

      const sheet = ss.getSheetByName(sheetName);
      const header = HEADERS[sheetName] || [];
      const written = appendRows_(sheet, header, op.rows);

      totalRows += written;
      results.push({ table: op.tableKey, sheet: sheetName, rows: written });
    });

    logEvent_("write_ok", "system", totalRows, "ok", JSON.stringify(results), payload);

    return jsonResponse_({
      ok: true,
      wrote: totalRows,
      results,
    }, 200);

  } catch (err) {
    logEvent_("server_error", "system", 0, "fail", String(err));
    return jsonResponse_({ ok: false, error: "Server error", detail: String(err) }, 500);
  }
}

/* ------------------------ Helpers ------------------------ */

function getSs_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("PASTE_")) {
    throw new Error("SPREADSHEET_ID is not set. Paste the correct Move-Master.OS Data spreadsheet ID.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheetWithHeaders_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const header = HEADERS[name] || [];
  if (header.length === 0) return;

  const existing = sh.getRange(1, 1, 1, Math.max(1, header.length)).getValues()[0];
  const isBlank = existing.every(v => v === "" || v === null);

  if (isBlank) {
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
}

function normalizePayload_(payload) {
  // Case A: { table: "jobs", rows: [...] }
  if (payload && payload.table && Array.isArray(payload.rows)) {
    return [{ tableKey: String(payload.table).toLowerCase(), rows: payload.rows }];
  }

  // Case B: bulk: { jobs:[...], drivers:[...], ... }
  const ops = [];
  Object.keys(SHEET_MAP).forEach(key => {
    if (Array.isArray(payload[key])) ops.push({ tableKey: key, rows: payload[key] });
  });

  // Case C: single row object with implicit table? (not recommended)
  return ops;
}

function appendRows_(sheet, header, rows) {
  if (!rows || rows.length === 0) return 0;

  const nowIso = new Date().toISOString();

  // Build 2D array aligned to header order
  const values = rows.map(obj => {
    const row = header.map(h => {
      if (h === "timestamp") return obj.timestamp || nowIso;
      if (h === "payload_json") return JSON.stringify(obj);
      // default: take the field from obj
      const v = obj[h];
      return (v === undefined || v === null) ? "" : v;
    });
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  return values.length;
}

function logEvent_(event, tableKey, rows, status, message, payloadObj) {
  try {
    const ss = getSs_();
    ensureSheetWithHeaders_(ss, SHEET_MAP.logs);
    const sh = ss.getSheetByName(SHEET_MAP.logs);
    const header = HEADERS.Logs;

    const obj = {
      timestamp: new Date().toISOString(),
      event,
      table: tableKey,
      rows: rows || 0,
      status: status || "",
      message: message || "",
      payload_json: payloadObj ? JSON.stringify(payloadObj) : "",
    };

    const row = header.map(h => obj[h] ?? "");
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  } catch (_) {
    // If logging fails, we don't block the main request.
  }
}

function jsonResponse_(obj, statusCode) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Apps Script is weird about CORS headers. We keep it simple.
  return out;
}

/**
 * Best-effort header fetch (Apps Script doesn't always expose headers cleanly)
 */
function getHeader_(e, name) {
  try {
    const n = String(name || "").toLowerCase();
    if (e && e.parameter && e.parameter[n]) return e.parameter[n];

    // e.headers isn't consistently available for Web App POSTs.
    // Some deployments include e.postData.type / contents only.
    // So we also support token via querystring (?token=...)
    return "";
  } catch (_) {
    return "";
  }
}
