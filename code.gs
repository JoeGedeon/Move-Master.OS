/**
 * Move-Master.OS Sheets Endpoint (Google Apps Script Web App)
 *
 * Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone (or Anyone with link)
 *
 * Notes:
 *  - ContentService responses cannot set headers (no setHeader). Avoid custom headers client-side to reduce CORS preflight.
 *  - If you send an Authorization header from the browser, Safari will preflight and Apps Script will be "quirky".
 *    Best practice: only send Authorization if you actually set a TOKEN.
 */

// -------------------- CONFIG --------------------
const CONFIG = {
  // Optional shared secret. Leave blank to disable auth.
  // If set, client should send:
  //   Authorization: Bearer <TOKEN>
  // or include token in body as { token: "<TOKEN>" } (fallback)
  TOKEN: "",

  // If you want to hard-lock a specific spreadsheet, paste its ID here.
  // If blank, the script will create/find and remember a spreadsheet in Script Properties.
  SPREADSHEET_ID: "",

  // If the sheet is auto-created, this is the file name.
  SPREADSHEET_NAME: "Move-Master.OS Data",
};

// Map incoming table keys -> actual tab names (case-sensitive tab names)
const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  logs: "Logs",
};

// Minimal default headers (only used if the tab is created AND empty)
// If you already have headers, we respect yours.
const DEFAULT_HEADERS = {
  Jobs: ["timestamp", "payload_json"],
  Drivers: ["timestamp", "payload_json"],
  Trucks: ["timestamp", "payload_json"],
  Dispatch: ["timestamp", "payload_json"],
  Receipts: ["timestamp", "payload_json"],
  Assignments: [
    "timestamp",
    "job_id",
    "truck_id",
    "driver_id",
    "role",
    "start_time",
    "end_time",
    "hours",
    "pay_rate",
    "pay_type",
    "notes",
  ],
  Logs: ["timestamp", "level", "event", "message", "meta_json"],
};

// -------------------- WEB APP ENTRYPOINTS --------------------
function doGet(e) {
  // Simple health check (and friendly human read)
  return json_({
    ok: true,
    service: "Move-Master.OS Sheets Endpoint",
    time: new Date().toISOString(),
    hint:
      "POST JSON to this /exec URL. Example: { table:'jobs', rows:[{...}] } or { jobs:[...], drivers:[...] }",
  });
}

function doPost(e) {
  const started = new Date();
  let payload;
  try {
    payload = parseJsonBody_(e);
  } catch (err) {
    log_("ERROR", "parse", String(err), { raw: safeRawBody_(e) });
    return json_({ ok: false, error: "Invalid JSON body", detail: String(err) }, 400);
  }

  // Auth (optional)
  if (!isAuthorized_(e, payload)) {
    log_("WARN", "auth", "Unauthorized request rejected", {});
    return json_({ ok: false, error: "Unauthorized" }, 401);
  }

  // Determine what the client is asking us to write
  // Supported shapes:
  // 1) { table: "jobs", rows: [ {..}, {..} ] }
  // 2) { sheet: "Jobs", rows: [ {..} ] }
  // 3) { jobs: [ {..} ], drivers: [ {..} ], ... } (multi-table push)
  // 4) { data: { jobs:[...], receipts:[...] } } (nested)
  const writePlan = buildWritePlan_(payload);

  if (writePlan.length === 0) {
    log_("WARN", "writePlan", "No writable data found in payload", { keys: Object.keys(payload || {}) });
    return json_({
      ok: false,
      error:
        "No writable data found. Send {table:'jobs', rows:[...]} or {jobs:[...], drivers:[...]} etc.",
    }, 422);
  }

  // Open spreadsheet + execute writes
  const ss = ensureSpreadsheet_();
  const results = [];

  try {
    writePlan.forEach((item) => {
      const sheetName = item.sheetName;
      const rows = normalizeRows_(item.rows);

      const sh = ensureSheet_(ss, sheetName);
      const wrote = appendRowsByHeaders_(sh, rows);

      results.push({ sheet: sheetName, rows_received: rows.length, rows_written: wrote });
    });
  } catch (err) {
    log_("ERROR", "write", String(err), { results_so_far: results, payload_keys: Object.keys(payload || {}) });
    return json_({ ok: false, error: "Write failed", detail: String(err), results }, 500);
  }

  const ms = new Date() - started;
  log_("INFO", "write", "Write completed", { results, ms });

  return json_({
    ok: true,
    ms,
    results,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
  });
}

// -------------------- WRITE PLAN --------------------
function buildWritePlan_(payload) {
  const plan = [];

  if (!payload || typeof payload !== "object") return plan;

  // Shape 1/2
  if (payload.rows && (payload.table || payload.sheet)) {
    const sheetName = resolveSheetName_(payload.table || payload.sheet);
    if (sheetName) plan.push({ sheetName, rows: payload.rows });
    return plan;
  }

  // Shape 4: nested { data: { jobs:[...], ... } }
  const root = payload.data && typeof payload.data === "object" ? payload.data : payload;

  // Shape 3: { jobs:[...], drivers:[...], ... }
  Object.keys(root).forEach((key) => {
    const val = root[key];
    if (!val) return;

    // Accept arrays OR single objects
    if (Array.isArray(val) || typeof val === "object") {
      const sheetName = resolveSheetName_(key);
      if (!sheetName) return;

      plan.push({ sheetName, rows: val });
    }
  });

  return plan;
}

function resolveSheetName_(tableOrSheet) {
  if (!tableOrSheet) return null;

  // If they passed "Jobs" directly
  if (SHEET_MAP[String(tableOrSheet).toLowerCase()] == null && DEFAULT_HEADERS[tableOrSheet]) {
    return tableOrSheet;
  }

  const key = String(tableOrSheet).toLowerCase().trim();
  return SHEET_MAP[key] || null;
}

// -------------------- SHEETS HELPERS --------------------
function ensureSpreadsheet_() {
  // If hard-locked
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }

  // Use Script Properties to remember created spreadsheet
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("MOVE_MASTER_SPREADSHEET_ID");
  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (e) {
      // If it was deleted or inaccessible, fall through and recreate
      props.deleteProperty("MOVE_MASTER_SPREADSHEET_ID");
    }
  }

  // Create a new one
  const ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  props.setProperty("MOVE_MASTER_SPREADSHEET_ID", ss.getId());

  // Ensure base tabs exist
  Object.values(SHEET_MAP).forEach((sheetName) => ensureSheet_(ss, sheetName));

  return ss;
}

function ensureSheet_(ss, sheetName) {
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);

  // If empty, set default headers (if we have them)
  if (sh.getLastRow() === 0) {
    const headers = DEFAULT_HEADERS[sheetName];
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  return sh;
}

/**
 * Appends rows by matching object keys to the sheet's header row.
 * - Respects your existing headers
 * - If a key doesn't exist as a header, it will ADD a new column header at the end
 * - If row is not an object, stores it in payload_json
 */
function appendRowsByHeaders_(sheet, rows) {
  if (!rows || !rows.length) return 0;

  const headerRow = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const headers = headerRow.filter((h) => h !== "" && h != null).map(String);

  // If no headers exist at all, inject a minimal set
  if (headers.length === 0) {
    const fallback = DEFAULT_HEADERS[sheet.getName()] || ["timestamp", "payload_json"];
    sheet.getRange(1, 1, 1, fallback.length).setValues([fallback]);
    return appendRowsByHeaders_(sheet, rows);
  }

  // Build header index
  const headerIndex = {};
  headers.forEach((h, idx) => (headerIndex[h] = idx));

  // Collect any new headers needed
  const newHeaders = [];
  rows.forEach((r) => {
    if (r && typeof r === "object" && !Array.isArray(r)) {
      Object.keys(r).forEach((k) => {
        if (headerIndex[k] == null && newHeaders.indexOf(k) === -1) newHeaders.push(k);
      });
    }
  });

  // Append new headers if needed
  if (newHeaders.length) {
    const startCol = headers.length + 1;
    sheet.getRange(1, startCol, 1, newHeaders.length).setValues([newHeaders]);
    newHeaders.forEach((h, i) => (headerIndex[h] = headers.length + i));
    headers.push(...newHeaders);
  }

  // Prepare write matrix
  const out = rows.map((r) => {
    const row = new Array(headers.length).fill("");

    // Always attempt to set timestamp if that header exists
    if (headerIndex["timestamp"] != null) {
      row[headerIndex["timestamp"]] = new Date().toISOString();
    }

    if (r && typeof r === "object" && !Array.isArray(r)) {
      Object.keys(r).forEach((k) => {
        const idx = headerIndex[k];
        if (idx == null) return;
        row[idx] = r[k];
      });
    } else {
      // Non-object row: store it safely
      if (headerIndex["payload_json"] == null) {
        // Add payload_json header if missing
        const col = headers.length + 1;
        sheet.getRange(1, col).setValue("payload_json");
        headerIndex["payload_json"] = headers.length;
        headers.push("payload_json");
        row.push("");
      }
      row[headerIndex["payload_json"]] = JSON.stringify(r);
    }

    return row;
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, out.length, out[0].length).setValues(out);
  return out.length;
}

// -------------------- REQUEST / AUTH / JSON --------------------
function parseJsonBody_(e) {
  const raw = safeRawBody_(e);
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeRawBody_(e) {
  try {
    return e && e.postData && e.postData.contents ? e.postData.contents : "";
  } catch (_) {
    return "";
  }
}

function isAuthorized_(e, payload) {
  if (!CONFIG.TOKEN) return true;

  // Header: Authorization: Bearer TOKEN
  const auth = getHeader_(e, "Authorization") || getHeader_(e, "authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.replace("Bearer ", "").trim();
    return token === CONFIG.TOKEN;
  }

  // Fallback: token in body
  if (payload && payload.token && String(payload.token) === CONFIG.TOKEN) return true;

  return false;
}

// Apps Script doesn't reliably expose headers in all contexts,
// but we try. If unavailable, rely on token-in-body.
function getHeader_(e, name) {
  try {
    if (!e) return null;
    if (e.headers && e.headers[name]) return e.headers[name];
    if (e.parameter && e.parameter[name]) return e.parameter[name];
    return null;
  } catch (_) {
    return null;
  }
}

function normalizeRows_(maybeRows) {
  if (!maybeRows) return [];
  if (Array.isArray(maybeRows)) return maybeRows;
  // If a single object was sent, treat as 1 row
  return [maybeRows];
}

function json_(obj, statusCode) {
  // ContentService can't set status codes directly. We include it in payload for debugging.
  const payload = Object.assign({}, obj, statusCode ? { statusCode } : {});
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

// -------------------- LOGGING --------------------
function log_(level, event, message, meta) {
  try {
    const ss = ensureSpreadsheet_();
    const sh = ensureSheet_(ss, "Logs");

    const row = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      meta_json: meta ? JSON.stringify(meta) : "",
    };

    appendRowsByHeaders_(sh, [row]);
  } catch (e) {
    // If logging fails, we don't want to block the main request.
  }
}
