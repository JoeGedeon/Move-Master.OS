/***************************************************************
 * Move-Master Sheets Endpoint (Google Apps Script Web App)
 *
 * Deploy as Web App:
 *   - Execute as: Me
 *   - Who has access: Anyone (or Anyone w/ Google account)
 *
 * EXPECTED POST JSON:
 *   1) Single table:
 *      { "table":"jobs", "rows":[ { ... }, { ... } ] }
 *
 *   2) Multi table:
 *      { "tables": { "jobs":[...], "drivers":[...], ... } }
 *
 * NOTES:
 * - setup() creates tabs + headers (no rows).
 * - Rows appear only after POST.
 ***************************************************************/

// Put ONLY the spreadsheet ID (between /d/ and /edit)
const SPREADSHEET_ID = "1o4X_iyORtog0FtiDZZbjx82T4blvB7ySoDmTlwJrgfs";

// Optional shared secret (leave "" to disable)
const TOKEN = "";

// Table key -> Sheet tab name
const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  inventory: "Inventory",
  logs: "Logs"
};

// -------------------- Public entrypoints --------------------

function doGet(e) {
  return jsonResponse_({
    ok: true,
    service: "Move-Master Sheets Endpoint",
    time: new Date().toISOString(),
    spreadsheetId: SPREADSHEET_ID ? "(set)" : "(missing)",
    hint: "POST JSON to this URL. Run setup() once to create tabs/headers."
  });
}

function doPost(e) {
  try {
    // Auth (optional)
    enforceToken_(e);

    // Parse JSON
    const body = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!body) {
      logEvent_("post", "client", "none", "error", "Empty body");
      return jsonResponse_({ ok: false, error: "Empty body" }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (err) {
      logEvent_("post", "client", "none", "error", "Invalid JSON");
      return jsonResponse_({ ok: false, error: "Invalid JSON" }, 400);
    }

    const ss = getSs_();

    // Multi-table
    if (payload && payload.tables && typeof payload.tables === "object") {
      const results = {};
      Object.keys(payload.tables).forEach((tableKey) => {
        const rows = payload.tables[tableKey];
        results[tableKey] = upsertRows_(ss, tableKey, rows);
      });
      logEvent_("post", "client", "multi", "ok", JSON.stringify(results));
      return jsonResponse_({ ok: true, mode: "multi", results });
    }

    // Single-table
    const tableKey = String(payload.table || "").trim();
    const rows = payload.rows;

    if (!tableKey) {
      logEvent_("post", "client", "none", "error", "Missing table");
      return jsonResponse_({ ok: false, error: "Missing 'table' key" }, 400);
    }

    const result = upsertRows_(ss, tableKey, rows);
    logEvent_("post", "client", tableKey, "ok", JSON.stringify(result));
    return jsonResponse_({ ok: true, mode: "single", table: tableKey, result });

  } catch (err) {
    logEvent_("post", "system", "error", "error", String(err && err.message ? err.message : err));
    return jsonResponse_({ ok: false, error: String(err) }, 500);
  }
}

// Run once manually to create tabs + headers
function setup() {
  const ss = getSs_();
  Object.values(SHEET_MAP).forEach((name) => ensureSheetWithHeaders_(ss, name, []));
  // Ensure Logs has the logging headers we expect
  ensureSheetWithHeaders_(ss, SHEET_MAP.logs, ["timestamp", "source", "table", "status", "message"]);
  logEvent_("setup", "system", "setup", "ok", "Sheets + headers ensured");
}

// -------------------- Core helpers --------------------

function getSs_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes("http")) {
    throw new Error("SPREADSHEET_ID must be only the ID (between /d/ and /edit).");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function upsertRows_(ss, tableKey, rows) {
  const key = normalizeTableKey_(tableKey);
  const sheetName = SHEET_MAP[key] || SHEET_MAP[tableKey] || titleCase_(key);
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (!Array.isArray(rows)) {
    // Allow posting a single object as rows
    if (rows && typeof rows === "object") rows = [rows];
    else rows = [];
  }

  // If no rows, still ensure sheet exists + has headers
  if (rows.length === 0) {
    ensureSheetWithHeaders_(ss, sheetName, []);
    return { wrote: 0, sheet: sheetName, note: "No rows provided" };
  }

  // Build headers from incoming row keys
  const incomingHeaders = buildHeadersFromRows_(rows);

  // Ensure sheet has headers (and auto-extend if needed)
  ensureSheetWithHeaders_(ss, sheetName, incomingHeaders);

  // Re-read headers from sheet row 1
  const headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h || "").trim());

  // Build normalized header map for fuzzy matching
  const headerIndex = {};
  headerValues.forEach((h, i) => {
    const n = normalizeKey_(h);
    if (n) headerIndex[n] = i; // 0-based index
  });

  // If incoming contains keys not present, add columns dynamically
  let changed = false;
  incomingHeaders.forEach((h) => {
    const n = normalizeKey_(h);
    if (n && headerIndex[n] === undefined) {
      headerValues.push(h);
      headerIndex[n] = headerValues.length - 1;
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, headerValues.length).setValues([headerValues]);
  }

  // Write rows
  const out = rows.map((r) => {
    const rowObj = (r && typeof r === "object") ? r : {};
    // Always add timestamp if missing
    if (rowObj.timestamp === undefined && rowObj.timeStamp === undefined) {
      rowObj.timestamp = new Date().toISOString();
    }

    const arr = new Array(headerValues.length).fill("");

    Object.keys(rowObj).forEach((k) => {
      const n = normalizeKey_(k);
      if (!n) return;
      const idx = headerIndex[n];
      if (idx === undefined) return; // should not happen after auto-extend
      arr[idx] = rowObj[k];
    });

    return arr;
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, out.length, out[0].length).setValues(out);

  return { wrote: out.length, sheet: sheetName };
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  // If sheet is empty, set headers
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // If no headers provided, keep existing or leave blank
  if (!headers || headers.length === 0) {
    if (lastRow === 0) {
      // default minimal header so sheet isn't a void
      sheet.getRange(1, 1, 1, 1).setValues([["timestamp"]]);
    }
    return;
  }

  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  // Extend existing header row if needed
  const existing = sheet.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0]
    .map(h => String(h || "").trim());

  const existingNorm = new Set(existing.map(normalizeKey_).filter(Boolean));
  const merged = existing.slice();

  headers.forEach((h) => {
    const n = normalizeKey_(h);
    if (!n) return;
    if (!existingNorm.has(n)) {
      merged.push(h);
      existingNorm.add(n);
    }
  });

  if (merged.length !== existing.length) {
    sheet.getRange(1, 1, 1, merged.length).setValues([merged]);
  }
}

function buildHeadersFromRows_(rows) {
  // union of keys across rows, stable-ish order
  const seen = new Set();
  const out = [];

  rows.forEach((r) => {
    if (!r || typeof r !== "object") return;
    Object.keys(r).forEach((k) => {
      const key = String(k || "").trim();
      if (!key) return;
      const n = normalizeKey_(key);
      if (!n) return;
      if (seen.has(n)) return;
      seen.add(n);
      out.push(key);
    });
  });

  // Make sure timestamp exists
  if (!seen.has(normalizeKey_("timestamp"))) out.unshift("timestamp");
  return out;
}

// -------------------- Logging --------------------

function logEvent_(source, actor, table, status, message) {
  try {
    const ss = getSs_();
    const sheet = ss.getSheetByName(SHEET_MAP.logs) || ss.insertSheet(SHEET_MAP.logs);
    ensureSheetWithHeaders_(ss, SHEET_MAP.logs, ["timestamp", "source", "table", "status", "message"]);
    sheet.appendRow([new Date().toISOString(), actor || source, table, status, message]);
  } catch (_) {
    // swallow logging failures to not break main flow
  }
}

// -------------------- Token / auth --------------------

function enforceToken_(e) {
  if (!TOKEN) return;

  const headerAuth = getHeader_(e, "authorization"); // "Bearer xxx"
  const queryToken = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : "";

  let got = "";
  if (headerAuth) got = headerAuth.replace(/^Bearer\s+/i, "").trim();
  if (!got && queryToken) got = queryToken.trim();

  if (got !== TOKEN) {
    throw new Error("Unauthorized: bad token");
  }
}

function getHeader_(e, name) {
  try {
    const n = String(name || "").toLowerCase();
    // Some deployments expose headers via e.postData.type/contents only. Best-effort.
    if (e && e.parameter && e.parameter[n]) return String(e.parameter[n]);
    return "";
  } catch (_) {
    return "";
  }
}

// -------------------- Normalization utilities --------------------

function normalizeTableKey_(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

// Make "jobId", "job_id", "Job ID" all match -> "jobid"
function normalizeKey_(k) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // remove underscores/spaces/punct
}

function titleCase_(s) {
  return String(s || "").replace(/(^|_)([a-z])/g, (_, p1, p2) => (p1 ? " " : "") + p2.toUpperCase());
}

function jsonResponse_(obj, statusCode) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
