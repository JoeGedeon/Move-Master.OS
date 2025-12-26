(() => {
  const pill = document.getElementById("jsPill");
  if (pill) {
    pill.classList.remove("bad");
    pill.classList.add("ok");
    pill.textContent = "JS: executing…";
  }
})();
