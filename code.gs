/*******************************
 * Move-Master.OS Sheets Endpoint (Web App)
 * - Paste this entire file into Code.gs (replace everything)
 * - Deploy as Web App:
 *    Execute as: Me
 *    Who has access: Anyone
 * - Paste the /exec URL into Move-Master.OS → Sheets tab
 *******************************/

// 1) SET THIS: Spreadsheet ID of the ONE real "Move-Master.OS Data" file
// Open the Google Sheet → URL looks like:
// https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";

// 2) Optional: simple bearer token (leave blank to disable auth)
const API_TOKEN = ""; // e.g. "supersecret123"

// Canonical sheet/tab names
const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  logs: "Logs",
};

// Preferred headers (so columns stay stable)
const HEADERS = {
  Jobs: [
    "timestamp","job_id","date","customer_name","phone","email",
    "pickup_address","dropoff_address","move_size","cubic_feet",
    "truck_id","crew_notes","status","total","deposit","balance","notes"
  ],
  Drivers: [
    "timestamp","driver_id","name","phone","email","role","pay_rate","pay_type","active","notes"
  ],
  Trucks: [
    "timestamp","truck_id","name","plate","capacity","active","notes"
  ],
  Dispatch: [
    "timestamp","dispatch_id","job_id","truck_id","driver_id","start_time","end_time","status","notes"
  ],
  Receipts: [
    "timestamp","receipt_id","job_id","vendor","category","amount","tax","total","date","image_url","notes"
  ],
  Assignments: [
    "timestamp","job_id","truck_id","driver_id","role","start_time","end_time","hours","pay_rate","pay_type","notes"
  ],
  Logs: [
    "timestamp","table","ok","message","row_count","raw_preview"
  ],
};

/**
 * Run this ONCE from the editor (optional but recommended)
 * It creates all tabs and headers immediately.
 */
function setup() {
  const ss = getSS_();
  Object.values(SHEET_MAP).forEach(name => ensureSheet_(ss, name));
  log_(ss, "system", true, "Setup completed: tabs + headers ensured", 0, "");
}

/**
 * Health check (open the /exec URL in a browser)
 */
function doGet(e) {
  return textResponse_(
    JSON.stringify({
      ok: true,
      service: "Move-Master.OS Sheets Endpoint",
      spreadsheetLinked: !!SPREADSHEET_ID && SPREADSHEET_ID !== "PASTE_YOUR_SPREADSHEET_ID_HERE",
      expectedTabs: Object.values(SHEET_MAP),
      time: new Date().toISOString(),
    }, null, 2)
  );
}

/**
 * Main POST handler
 * Accepts JSON payloads in either form:
 * A) { table: "jobs", rows: [{...},{...}] }
 * B) { jobs: [...], drivers: [...], assignments: [...], ... }  (Push All style)
 */
function doPost(e) {
  const ss = getSS_();

  try {
    // Basic auth (optional)
    if (API_TOKEN) {
      const auth = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
      const headerAuth = getHeader_(e, "authorization");
      const bearer = headerAuth && headerAuth.toLowerCase().startsWith("bearer ")
        ? headerAuth.slice(7).trim()
        : "";
      const provided = bearer || auth;
      if (provided !== API_TOKEN) {
        log_(ss, "auth", false, "Unauthorized (bad token)", 0, "");
        return jsonResponse_({ ok: false, error: "unauthorized" }, 401);
      }
    }

    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!raw) {
      log_(ss, "request", false, "Empty body", 0, "");
      return jsonResponse_({ ok: false, error: "empty_body" }, 400);
    }

    const payload = JSON.parse(raw);

    // Normalize into tasks: [{tableKey, rows}]
    const tasks = normalizePayload_(payload);

    let totalWritten = 0;
    const results = [];

    tasks.forEach(task => {
      const sheetName = SHEET_MAP[task.tableKey];
      if (!sheetName) {
        results.push({ table: task.tableKey, ok: false, message: "Unknown table" });
        return;
      }

      const sh = ensureSheet_(ss, sheetName);
      const rows = Array.isArray(task.rows) ? task.rows : [];
      if (!rows.length) {
        results.push({ table: sheetName, ok: true, message: "No rows to write", written: 0 });
        return;
      }

      // Ensure headers (stable preferred headers, plus any new keys found)
      const header = ensureHeaders_(sh, sheetName, rows);

      // Append rows
      const values = rows.map(obj => header.map(h => coerce_(obj[h])));
      const startRow = sh.getLastRow() + 1;
      sh.getRange(startRow, 1, values.length, header.length).setValues(values);

      totalWritten += values.length;
      results.push({ table: sheetName, ok: true, written: values.length });
      log_(ss, sheetName, true, "Wrote rows", values.length, raw.slice(0, 500));
    });

    return jsonResponse_({ ok: true, written: totalWritten, results }, 200);

  } catch (err) {
    const msg = (err && err.stack) ? err.stack : String(err);
    log_(ss, "error", false, msg, 0, "");
    return jsonResponse_({ ok: false, error: "server_error", message: String(err) }, 500);
  }
}

/* -------------------------
   Helpers
-------------------------- */

function getSS_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
    throw new Error("SPREADSHEET_ID is not set. Paste your Google Sheet ID into Code.gs.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  // Ensure at least the preferred headers exist (row 1)
  const preferred = HEADERS[name] || ["timestamp"];
  const current = sh.getLastRow() >= 1 ? sh.getRange(1, 1, 1, sh.getLastColumn() || 1).getValues()[0] : [];
  const hasAnything = current.some(v => String(v || "").trim() !== "");

  if (!hasAnything) {
    sh.getRange(1, 1, 1, preferred.length).setValues([preferred]);
  }
  return sh;
}

function ensureHeaders_(sh, sheetName, rows) {
  const preferred = HEADERS[sheetName] || ["timestamp"];

  // Read existing header row
  const lastCol = Math.max(sh.getLastColumn(), preferred.length);
  const headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(x => String(x || "").trim());
  let header = headerRow.filter(h => h);

  // If empty, start from preferred
  if (!header.length) header = preferred.slice();

  // Add any new keys found in incoming data (without breaking existing columns)
  const foundKeys = new Set();
  rows.forEach(r => {
    if (r && typeof r === "object") Object.keys(r).forEach(k => foundKeys.add(k));
  });

  // Ensure timestamp exists
  foundKeys.add("timestamp");

  // Preferred first, then extras
  const merged = [];
  preferred.forEach(h => { if (!merged.includes(h)) merged.push(h); });
  Array.from(foundKeys).forEach(k => { if (!merged.includes(k)) merged.push(k); });

  // If header changed, write it back
  const changed = merged.join("|") !== header.join("|");
  if (changed) {
    sh.getRange(1, 1, 1, merged.length).setValues([merged]);
  }

  return merged;
}

function normalizePayload_(payload) {
  // A) { table: "jobs", rows: [...] }
  if (payload && payload.table && payload.rows) {
    return [{ tableKey: String(payload.table).toLowerCase(), rows: payload.rows }];
  }

  // B) { jobs: [...], drivers: [...], ... }
  const tasks = [];
  Object.keys(SHEET_MAP).forEach(key => {
    if (payload[key]) tasks.push({ tableKey: key, rows: payload[key] });
  });

  // If nothing matched, try to guess:
  // If payload looks like array => treat as jobs
  if (!tasks.length && Array.isArray(payload)) {
    tasks.push({ tableKey: "jobs", rows: payload });
  }

  return tasks;
}

function log_(ss, table, ok, message, rowCount, rawPreview) {
  const sh = ensureSheet_(ss, SHEET_MAP.logs);
  const ts = new Date().toISOString();
  sh.appendRow([ts, table, ok ? "true" : "false", message, rowCount, rawPreview]);
}

function coerce_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

// Apps Script web responses (CORS-safe enough for browser fetch)
function jsonResponse_(obj, statusCode) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script doesn't let you reliably set CORS headers in all contexts.
  // If your frontend uses fetch, use mode: "no-cors" or proxy through your own backend if needed.
  return out;
}

function textResponse_(text) {
  const out = ContentService.createTextOutput(text);
  out.setMimeType(ContentService.MimeType.TEXT);
  return out;
}

// Best-effort header fetch (Apps Script doesn't expose all headers cleanly in every context)
function getHeader_(e, name) {
  try {
    // Some deployments include headers in e.postData, some don't. Best-effort only.
    const n = String(name || "").toLowerCase();
    if (e && e.parameter) {
      // Allow passing auth via querystring too (token=)
      if (n === "authorization" && e.parameter.authorization) return e.parameter.authorization;
    }
  } catch (_) {}
  return "";
}
