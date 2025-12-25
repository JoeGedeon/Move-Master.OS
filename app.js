/* FleetPro Foundation JS (stable build)
   - View switching
   - Month calendar
   - Day workspace with spreadsheet-style editing
   - Fix: iPad “1 character then blur” issue by NOT re-rendering on every keystroke
   - Fix: horizontal scroll for wide tables (CSS table-wrap)
*/

const STORE_KEY = "fleetpro_foundation_v1";

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const pad2 = (n) => String(n).padStart(2,"0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

function fmtLong(d){
  return d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }

// ---------- Data Model ----------
const defaultState = () => ({
  cursorDate: toISO(new Date()),     // where calendar/day nav is pointed
  view: "dashboard",
  dayTab: "jobs",
  days: {
    // "YYYY-MM-DD": { jobs: [], receipts: [], notes: [], drivers: [], trucks: [], records: [], media: [], ai: [] }
  }
});

let state = loadState();

// Ensure a day object exists
function ensureDay(iso){
  if (!state.days[iso]) {
    state.days[iso] = {
      jobs: [],
      receipts: [],
      notes: [],
      drivers: [],
      trucks: [],
      records: [],
      media: [],
      ai: []
    };
  }
  return state.days[iso];
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  }catch(e){
    return defaultState();
  }
}

function saveState(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  // JS badge
  const jsBadge = $("#jsBadge");
  jsBadge.textContent = "JS: loaded";
  jsBadge.classList.add("ok");

  // Clock
  tickClock();
  setInterval(tickClock, 1000);

  // Sidebar navigation
  $("#sideNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".navbtn");
    if (!btn) return;
    const view = btn.dataset.view;
    if (!view) return;
    switchView(view);
  });

  // Toolbar buttons
  $("#btnToday").addEventListener("click", () => {
    state.cursorDate = toISO(new Date());
    saveState();
    renderAll();
  });

  $("#btnPrev").addEventListener("click", () => {
    navCursor(-1);
  });

  $("#btnNext").addEventListener("click", () => {
    navCursor(+1);
  });

  $("#btnAddJob").addEventListener("click", () => addRowForActiveDay("jobs"));
  $("#btnAddReceipt").addEventListener("click", () => addRowForActiveDay("receipts"));
  $("#btnAddNote").addEventListener("click", () => addRowForActiveDay("notes"));

  $("#openToday").addEventListener("click", () => {
    state.cursorDate = toISO(new Date());
    state.view = "day";
    saveState();
    renderAll();
  });

  $("#openCalendar").addEventListener("click", () => {
    state.view = "calendar";
    saveState();
    renderAll();
  });

  // Day tabs
  $("#dayTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.dayTab = tab.dataset.tab;
    saveState();
    renderDay();
  });

  $("#btnAddRow").addEventListener("click", () => addRowForActiveTab());

  // Initial render
  renderAll();
});

// ---------- Navigation ----------
function switchView(view){
  state.view = view;
  saveState();
  renderAll();
}

function navCursor(delta){
  const cur = new Date(state.cursorDate + "T00:00:00");
  if (state.view === "calendar") {
    // month navigation
    const d = new Date(cur.getFullYear(), cur.getMonth()+delta, 1);
    state.cursorDate = toISO(d);
  } else {
    // day navigation
    cur.setDate(cur.getDate() + delta);
    state.cursorDate = toISO(cur);
  }
  saveState();
  renderAll();
}

// ---------- Render Root ----------
function renderAll(){
  // activate view section
  $$(".view").forEach(v => v.classList.remove("active"));
  const viewId = `#view-${state.view}`;
  const v = $(viewId);
  if (v) v.classList.add("active");

  // sidebar active button
  $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));

  // context header
  $("#contextTitle").textContent = "Operations";
  $("#contextSubtitle").textContent =
    state.view === "calendar" ? "Calendar navigation (Month)" :
    state.view === "day" ? `Day Workspace: ${state.cursorDate}` :
    "Foundation mode (Smart)";

  // render each relevant view
  renderDashboard();
  if (state.view === "calendar") renderCalendar();
  if (state.view === "day") renderDay();
}

function tickClock(){
  const d = new Date();
  const h = d.getHours();
  const m = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  $("#clock").textContent = `${hh}:${m}:${s} ${ampm}`;
}

// ---------- Dashboard ----------
function renderDashboard(){
  const todayIso = toISO(new Date());
  ensureDay(todayIso);
  const day = ensureDay(state.cursorDate);
  const jobs = day.jobs.length;
  const receipts = day.receipts.length;

  $("#todayLine").textContent = `${fmtLong(new Date(todayIso+"T00:00:00"))} • ${jobs} job(s), ${receipts} receipt(s)`;

  // pressure list (simple rule placeholders)
  const pressures = [];
  day.jobs.forEach((j, idx) => {
    if (!j.customer || !j.pickup || !j.dropoff) pressures.push(`DANGER (${state.cursorDate}) Job #${idx+1} missing customer/pickup/dropoff`);
    if (!j.volume) pressures.push(`WARN (${state.cursorDate}) Job #${idx+1} missing volume`);
  });

  const ul = $("#pressureList");
  ul.innerHTML = "";
  if (!pressures.length) {
    ["Overbooked drivers: AI later","Truck maintenance conflicts: rules later","Receipts missing: driver app later"].forEach(t=>{
      const li=document.createElement("li"); li.textContent=t; ul.appendChild(li);
    });
  } else {
    pressures.slice(0,6).forEach(t=>{
      const li=document.createElement("li"); li.textContent=t; ul.appendChild(li);
    });
  }

  // month stats
  const cur = new Date(state.cursorDate+"T00:00:00");
  const y = cur.getFullYear(), m = cur.getMonth();

  let monthJobs=0, monthReceipts=0, monthExpenses=0, monthWarn=0;
  Object.keys(state.days).forEach(iso=>{
    const d = new Date(iso+"T00:00:00");
    if (d.getFullYear()===y && d.getMonth()===m){
      const dd = ensureDay(iso);
      monthJobs += dd.jobs.length;
      monthReceipts += dd.receipts.length;
      dd.receipts.forEach(r=>{
        const amt = Number(r.amount || 0);
        monthExpenses += isNaN(amt) ? 0 : amt;
      });
      dd.jobs.forEach(j=>{
        if (!j.customer || !j.pickup || !j.dropoff) monthWarn++;
        if (!j.volume) monthWarn++;
      });
    }
  });

  $("#statJobs").textContent = String(monthJobs);
  $("#statReceipts").textContent = String(monthReceipts);
  $("#statExpenses").textContent = `$${Math.round(monthExpenses)}`;
  $("#statWarnings").textContent = String(monthWarn);
}

// ---------- Calendar ----------
function renderCalendar(){
  const cursor = new Date(state.cursorDate+"T00:00:00");
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);

  $("#calTitle").textContent = cursor.toLocaleDateString(undefined, { month:"long", year:"numeric" });

  const grid = $("#calendarGrid");
  grid.innerHTML = "";

  // Build start (Sunday before/at first)
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  // 6 weeks grid
  for (let i=0; i<42; i++){
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === cursor.getMonth();

    ensureDay(iso);
    const dd = state.days[iso];

    const tile = document.createElement("div");
    tile.className = "daytile";
    tile.dataset.iso = iso;

    const num = document.createElement("div");
    num.className = "daynum" + (inMonth ? "" : " dim");
    num.textContent = String(d.getDate());
    tile.appendChild(num);

    const badges = document.createElement("div");
    badges.className = "badges";

    if (dd.jobs.length){
      const b = document.createElement("span");
      b.className = "badge good";
      b.textContent = `${dd.jobs.length} job`;
      badges.appendChild(b);
    }
    // warnings: missing fields
    let warn = 0;
    dd.jobs.forEach(j=>{
      if (!j.customer || !j.pickup || !j.dropoff) warn++;
      if (!j.volume) warn++;
    });
    if (warn){
      const b = document.createElement("span");
      b.className = "badge warn";
      b.textContent = `${warn} warn`;
      badges.appendChild(b);
    }

    tile.appendChild(badges);

    tile.addEventListener("click", () => {
      state.cursorDate = iso;
      state.view = "day";
      saveState();
      renderAll();
    });

    grid.appendChild(tile);
  }
}

// ---------- Day Workspace ----------
function renderDay(){
  const iso = state.cursorDate;
  const day = ensureDay(iso);

  $("#dayTitle").textContent = fmtLong(new Date(iso+"T00:00:00"));
  $("#chipJobs").textContent = `Jobs: ${day.jobs.length}`;

  const totalVol = day.jobs.reduce((sum,j)=> sum + (Number(j.volume)||0), 0);
  $("#chipVolume").textContent = `Volume: ${totalVol}`;

  // tabs active
  $$("#dayTabs .tab").forEach(t=> t.classList.toggle("active", t.dataset.tab === state.dayTab));

  // render tab content
  const content = $("#tabContent");
  content.innerHTML = "";

  if (state.dayTab === "jobs") {
    content.appendChild(renderJobsTable(day));
  } else if (state.dayTab === "drivers") {
    content.appendChild(renderSimpleTable("drivers", day, ["name","phone","role"]));
  } else if (state.dayTab === "trucks") {
    content.appendChild(renderSimpleTable("trucks", day, ["unit","plate","status"]));
  } else if (state.dayTab === "records") {
    content.appendChild(renderSimpleTable("records", day, ["type","details","status"]));
  } else if (state.dayTab === "media") {
    content.appendChild(renderSimpleTable("media", day, ["type","url","notes"]));
  } else if (state.dayTab === "ai") {
    content.appendChild(renderSimpleTable("ai", day, ["model","confidence","summary","warnings"]));
  }
}

function addRowForActiveDay(kind){
  const iso = state.cursorDate;
  const day = ensureDay(iso);

  if (kind === "jobs"){
    day.jobs.push({ jobId: nextJobId(day), customer:"", pickup:"", dropoff:"", volume:"", notes:"" });
  } else if (kind === "receipts"){
    day.receipts.push({ vendor:"", category:"", amount:"", note:"" });
  } else if (kind === "notes"){
    day.notes.push({ note:"" });
  }
  saveState();
  // Stay where you are; re-render safely
  if (state.view === "day") renderDay();
  else renderDashboard();
}

function addRowForActiveTab(){
  const iso = state.cursorDate;
  const day = ensureDay(iso);
  const tab = state.dayTab;

  if (tab === "jobs") addRowForActiveDay("jobs");
  else {
    day[tab].push({});
    saveState();
    renderDay();
  }
}

function nextJobId(day){
  const n = day.jobs.length + 1;
  return `J-${String(n).padStart(4,"0")}`;
}

// ---------- Tables (Editing that does NOT break typing) ----------
function renderJobsTable(day){
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "sheet";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
     
