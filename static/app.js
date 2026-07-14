const runBtn = document.getElementById("run-btn");
const progressContainer = document.getElementById("progress-container");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressText = document.getElementById("progress-text");
const errorBanner = document.getElementById("error-banner");

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function renderResults(results) {
  // Filled in by Task 7.
  console.log("renderResults called with", results.length, "entries");
}

function poll() {
  fetch("/status")
    .then(res => res.json())
    .then(status => {
      if (status.error) {
        progressContainer.classList.add("hidden");
        runBtn.disabled = false;
        runBtn.textContent = "Run Analysis";
        showError(status.error);
        return;
      }

      if (status.running) {
        progressContainer.classList.remove("hidden");
        const pct = status.total ? Math.round((status.current / status.total) * 100) : 0;
        progressBarFill.style.width = pct + "%";
        progressText.textContent = `${status.current}/${status.total} analyzed...`;
        setTimeout(poll, 1500);
      } else if (status.done) {
        progressContainer.classList.add("hidden");
        runBtn.disabled = false;
        runBtn.textContent = "Run Analysis";
        fetch("/results")
          .then(res => res.json())
          .then(renderResults);
      }
    });
}

runBtn.addEventListener("click", () => {
  runBtn.disabled = true;
  runBtn.textContent = "Running...";
  errorBanner.classList.add("hidden");
  fetch("/run-analysis", { method: "POST" })
    .then(res => res.json())
    .then(data => {
      if (data.started) {
        setTimeout(poll, 500);
      } else {
        runBtn.disabled = false;
        runBtn.textContent = "Run Analysis";
        showError(data.reason || "Could not start analysis");
      }
    });
});

renderResults(window.INITIAL_RESULTS);
