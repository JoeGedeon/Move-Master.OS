// ---------- STATE ----------
const state = {
  drivers: [
    { name: "Marcus", status: "Available", hours: 6 },
    { name: "Elena", status: "Booked", hours: 9 }
  ],
  trucks: [
    { id: "TRK-01", status: "Active", mileage: 120334 },
    { id: "TRK-02", status: "Maintenance", mileage: 89420 }
  ],
  bookings: {}
};

// ---------- NAV ----------
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---------- CLOCK ----------
setInterval(() => {
  document.getElementById("clock").innerText = new Date().toLocaleTimeString();
}, 1000);

// ---------- TABLES ----------
function renderDrivers() {
  const tbody = document.getElementById("driversTable");
  tbody.innerHTML = "";
  state.drivers.forEach(d => {
    tbody.innerHTML += `<tr>
      <td contenteditable>${d.name}</td>
      <td contenteditable>${d.status}</td>
      <td contenteditable>${d.hours}</td>
    </tr>`;
  });
}

function renderTrucks() {
  const tbody = document.getElementById("trucksTable");
  tbody.innerHTML = "";
  state.trucks.forEach(t => {
    tbody.innerHTML += `<tr>
      <td>${t.id}</td>
      <td contenteditable>${t.status}</td>
      <td contenteditable>${t.mileage}</td>
    </tr>`;
  });
}

// ---------- CALENDAR ----------
function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";
  for (let d = 1; d <= 30; d++) {
    const div = document.createElement("div");
    div.className = "day";
    div.innerText = d;
    div.onclick = () => toggleBooking(d, div);
    grid.appendChild(div);
  }
}

function toggleBooking(day, el) {
  el.classList.toggle("booked");
  state.bookings[day] = !state.bookings[day];
}

// ---------- INIT ----------
renderDrivers();
renderTrucks();
renderCalendar();

