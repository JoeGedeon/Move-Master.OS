document.addEventListener("DOMContentLoaded", () => {
  init();
});

function init() {
  state = loadState();
  bindNav();
  renderDashboard();
  renderCalendar();
  setJSLoaded(true);
}
