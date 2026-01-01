/*******************************************************
 * Move-Master Sheets Endpoint (Web App)
 *
 * What this does:
 * - Accepts POST JSON from your web app
 * - Routes to the correct tab (Jobs/Drivers/Trucks/Dispatch/Receipts/Assignments/Logs)
 * - Auto-creates missing tabs + headers when you run setup()
 * - Logs every request into Logs
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone (or Anyone with Google account)
 *******************************************************/

// IMPORTANT: Put ONLY the spreadsheet ID (between /d/ and /edit)
const SPREADSHEET_ID = "1o4X_iyORtog0FtiDZZbjx82T4blvB7ySoDmTlwJrgfs"; // <-- REQUIRED

// Optional shared secret. Leave "" to disable.
const TOKEN = "";

// Table name routing (keys your app can send)
const SHEET_MAP = {
  jobs: "Jobs",
  drivers: "Drivers",
  trucks: "Trucks",
  dispatch: "Dispatch",
  receipts: "Receipts",
  assignments: "Assignments",
  logs: "Logs",
};

// Headers by sheet (Row 1)
const HEADERS = {
  Jobs: ["timestamp", "job_id", "date", "customer", "phone", "email", "pickup", "dropoff", "status", "notes"],
  Drivers: ["timestamp", "driver_id", "name", "phone", "email", "role", "active", "notes"],
  Trucks: ["timestamp", "truck_id", "name", "plate", "capacity", "active", "notes"],
  Dispatch: ["timestamp", "dispatch_id", "job_id", "truck_id", "driver_id", "start_time", "end_time", "status", "notes"],
  Receipts: ["timestamp", "receipt_id", "job_id", "vendor", "amount", "category", "date", "notes"],
  Assignments: ["timestamp", "job_id", "truck_id", "driver_id", "role", "start_time", "end_time", "hours", "pay_rate", "pay_type", "notes"],
  Logs: ["timestamp", "source", "table", "ok", "message", "payload_preview"],
};

// =============== PUBLIC FUNCTIONS ===============

function setup() {
  const ss = getSs_();
  Object.values(SHEET_MAP).forEach((sheetName) => {
    ensureSheetWithHeaders_(ss, sheetName);
  });
  logEvent_("setup", "system", "setup", true, "Sheets + headers ensured.", "");
  return jsonResponse_({ ok: true, message: "Setup complete. Tabs + headers ensured." }, 200);
}

function doGet(e) {
  // Health check
  return jsonResponse_({
    ok: true,
    service: "Move-Master Sheets Endpoint",
    time: new Date().toISOString(),
    spreadsheetId: SPREADSHEET_ID ? "(set)" : "(missing)",
    hint: "POST JSON to this URL. Run setup() once to create tabs/headers.",
  }, 200);
}

function doPost(e) {
  try {
    // ---- Auth (optional) ----
    if (TOKEN) {
      const token = getToken_(e);
      if (token !== TOKEN) {
        logEvent_("doPost", "client", "unknown", false, "Unauthorized (bad token)", "");
        return jsonResponse_({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    // ---- Parse payload ----
    const payload = parseJsonBody_(e);
    if (!payload) {
      logEvent_("doPost", "client", "unknown", false, "No JSON body", "");
      return jsonResponse_({ ok: false, error: "Missing JSON body" }, 400);
    }

    // Expected formats supported:
    // A) { table: "jobs", rows: [ {...}, {...} ] }
    // B) { table: "jobs", ...fields }
    // C) { jobs: [ {...}, {...} ] }  (push-all style)
    // D) { tables: { jobs: [...], drivers: [...] } }

    const ss = getSs_();

    // Push-all style
    if (payload.tables && typeof payload.tables === "object") {
      const results = {};
      Object.keys(payload.tables).forEach((k) => {
        results[k] = writeToTable_(ss, k, payload.tables[k]);
      });
      logEvent_("doPost", "client", "tables", true, "Wrote multiple tables.", preview_(payload));
      return jsonResponse_({ ok: true, results }, 200);
    }

    // Another push-all style
    const knownKeys = Object.keys(SHEET_MAP).filter(k => k !== "logs");
    const foundKeys = knownKeys.filter(k => payload[k] !== undefined);
    if (foundKeys.length) {
      const results = {};
      foundKeys.forEach((k) => {
        results[k] = writeToTable_(ss, k, payload[k]);
      });
      logEvent_("doPost", "client", "multi", true, "Wrote tables by key.", preview_(payload));
      return jsonResponse_({ ok: true, results }, 200);
    }

    // Single table style
    const tableKey = String(payload.table || payload.type || payload.target || "").toLowerCase().trim();
    if (!tableKey) {
      logEvent_("doPost", "client", "unknown", false, "No table specified", preview_(payload));
      return jsonResponse_({ ok: false, error: "No table specified (use table/type/target)" }, 400);
    }

    const rows = payload.rows !== undefined ? payload.rows : payload;
    const result = writeToTable_(ss, tableKey, rows);

    logEvent_("doPost", "client", tableKey, true, `Wrote ${result.written} row(s) to ${result.sheet}.`, preview_(payload));
    return jsonResponse_({ ok: true, ...result }, 200);

  } catch (err) {
    logEvent_("doPost", "client", "unknown", false, String(err && err.message ? err.message : err), "");
    return jsonResponse_({ ok: false, error: String(err) }, 500);
  }
}

// =============== INTERNAL HELPERS ===============

function getSs_() {
  if (!SPREADSHEET_ID || !String(SPREADSHEET_ID).trim()) {
    throw new Error("SPREADSHEET_ID is not set. Paste the correct Move-Master.OS Data spreadsheet ID.");
  }

  try {
    return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
  } catch (e) {
    // This is the exact pain you were seeing.
    // Usually permissions/account/deployment mismatch.
    throw new Error(
      "Cannot open spreadsheet by ID. Fix checklist: " +
      "(1) Run setup() in editor and approve permissions, " +
      "(2) Make sure you're logged into the SAME Google account that owns the sheet, " +
      "(3) Ensure SPREADSHEET_ID is ONLY the ID, no URL, no spaces, " +
      "(4) Deploy a NEW version and update your app with the NEW /exec URL."
    );
  }
}

function ensureSheetWithHeaders_(ss, sheetName) {
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);

  const headers = HEADERS[sheetName] || ["timestamp"];
  const current = sh.getRange(1, 1, 1, sh.getLastColumn() || 1).getValues()[0] || [];
  const empty = current.join("").trim().length === 0;

  if (empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeToTable_(ss, tableKey, rows) {
  const key = String(tableKey || "").toLowerCase().trim();
  const sheetName = SHEET_MAP[key];
  if (!sheetName) throw new Error(`Unknown table "${tableKey}". Allowed: ${Object.keys(SHEET_MAP).join(", ")}`);

  const sh = ensureSheetWithHeaders_(ss, sheetName);
  const headers = HEADERS[sheetName] || ["timestamp"];

  const normalized = normalizeRows_(rows);
  const values = normalized.map((obj) => mapRow_(headers, obj));

  if (values.length) {
    sh.getRange(sh.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  }

  return { sheet: sheetName, written: values.length };
}

function normalizeRows_(rows) {
  if (rows === null || rows === undefined) return [];
  if (Array.isArray(rows)) return rows.map(r => (typeof r === "object" && r ? r : { value: r }));
  if (typeof rows === "object") return [rows];
  return [{ value: rows }];
}

function mapRow_(headers, obj) {
  const o = obj || {};
  return headers.map((h) => {
    if (h === "timestamp") return o.timestamp || new Date().toISOString();
    return (o[h] !== undefined && o[h] !== null) ? String(o[h]) : "";
  });
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  const txt = e.postData.contents;
  try {
    return JSON.parse(txt);
  } catch (err) {
    return null;
  }
}

function getToken_(e) {
  // token can come from:
  // - ?token= in querystring
  // - Authorization: Bearer <token>
  if (e && e.parameter && e.parameter.token) return String(e.parameter.token);

  try {
    const headers = (e && e.postData && e.postData.type) ? {} : {};
    // Apps Script does not reliably expose request headers here.
  } catch (_) {}

  return "";
}

function logEvent_(source, who, table, ok, message, payloadPreview) {
  try {
    const ss = SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
    const sh = ensureSheetWithHeaders_(ss, "Logs");
    sh.appendRow([new Date().toISOString(), who, table, ok ? "true" : "false", message, payloadPreview || ""]);
  } catch (_) {
    // If logging fails, we don't block the endpoint.
  }
}

function preview_(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.length > 500 ? s.slice(0, 500) + "..." : s;
  } catch (_) {
    return "";
  }
}

function jsonResponse_(obj, statusCode) {
  // Apps Script is picky about CORS headers. We keep it simple.
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
