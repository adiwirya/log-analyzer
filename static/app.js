const runBtn = document.getElementById("run-btn");
const progressContainer = document.getElementById("progress-container");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressText = document.getElementById("progress-text");
const errorBanner = document.getElementById("error-banner");
const summary = document.getElementById("summary");
const resultsTable = document.getElementById("results-table");
const resultsBody = document.getElementById("results-body");

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function severityBadgeClass(severity) {
  const key = (severity || "UNKNOWN").toUpperCase();
  if (key === "CRITICAL" || key === "HIGH") return "badge-high";
  if (key === "MEDIUM") return "badge-medium";
  if (key === "LOW") return "badge-low";
  return "badge-unknown";
}

function renderSummary(results) {
  const bySeverity = {};
  for (const r of results) {
    const sev = (r.severity || "UNKNOWN").toUpperCase();
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }

  let html = `<div class="summary-item"><span class="label">Total Analyzed</span><span class="value">${results.length}</span></div>`;
  for (const sev of Object.keys(bySeverity).sort((a, b) => (SEVERITY_ORDER[a] ?? 4) - (SEVERITY_ORDER[b] ?? 4))) {
    html += `<div class="summary-item"><span class="label">${sev}</span><span class="value">${bySeverity[sev]}</span></div>`;
  }
  summary.innerHTML = html;
}

function renderTable(results) {
  const sorted = [...results].sort((a, b) => {
    const sa = SEVERITY_ORDER[(a.severity || "UNKNOWN").toUpperCase()] ?? 4;
    const sb = SEVERITY_ORDER[(b.severity || "UNKNOWN").toUpperCase()] ?? 4;
    return sa - sb;
  });

  resultsBody.innerHTML = sorted.map(r => `
    <tr>
      <td>${r.service}</td>
      <td>${r.level}</td>
      <td>${(r.message || "").slice(0, 60)}</td>
      <td>${r.category || ""}</td>
      <td><span class="badge ${severityBadgeClass(r.severity)}">${r.severity || "UNKNOWN"}</span></td>
      <td>${r.root_cause || ""}</td>
      <td><ul>${(r.recommendation || []).map(rec => `<li>${rec}</li>`).join("")}</ul></td>
    </tr>
  `).join("");
  resultsTable.classList.remove("hidden");
}

function renderResults(results) {
  if (!results || results.length === 0) return;
  renderSummary(results);
  renderTable(results);
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
