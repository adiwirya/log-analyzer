const runBtn = document.getElementById("run-btn");
const runBtnLabel = document.getElementById("run-btn-label");
const progressContainer = document.getElementById("progress-container");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressText = document.getElementById("progress-text");
const errorBanner = document.getElementById("error-banner");
const errorBannerText = document.getElementById("error-banner-text");
const summary = document.getElementById("summary");
const emptyState = document.getElementById("empty-state");
const resultsTable = document.getElementById("results-table");
const resultsBody = document.getElementById("results-body");

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

function showError(message) {
  errorBannerText.textContent = message;
  errorBanner.classList.remove("hidden");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function severityKey(severity) {
  return (severity || "UNKNOWN").toUpperCase();
}

function severityBadgeClass(severity) {
  const key = severityKey(severity);
  if (key === "CRITICAL" || key === "HIGH") return "badge-high";
  if (key === "MEDIUM") return "badge-medium";
  if (key === "LOW") return "badge-low";
  return "badge-unknown";
}

function severityCardClass(severity) {
  const key = severityKey(severity);
  if (key === "CRITICAL" || key === "HIGH") return "sev-high";
  if (key === "MEDIUM") return "sev-medium";
  if (key === "LOW") return "sev-low";
  return "sev-unknown";
}

function setRunning(isRunning) {
  runBtn.disabled = isRunning;
  runBtn.classList.toggle("is-running", isRunning);
  runBtnLabel.textContent = isRunning ? "Running..." : "Run Analysis";
}

function renderSummary(results) {
  const bySeverity = {};
  for (const r of results) {
    const sev = severityKey(r.severity);
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }

  let html = `<div class="summary-card"><span class="label">Total Analyzed</span><span class="value">${results.length}</span></div>`;
  for (const sev of Object.keys(bySeverity).sort((a, b) => (SEVERITY_ORDER[a] ?? 4) - (SEVERITY_ORDER[b] ?? 4))) {
    html += `<div class="summary-card ${severityCardClass(sev)}"><span class="label">${escapeHtml(sev)}</span><span class="value">${bySeverity[sev]}</span></div>`;
  }
  summary.innerHTML = html;
}

function renderTable(results) {
  const sorted = [...results].sort((a, b) => {
    const sa = SEVERITY_ORDER[severityKey(a.severity)] ?? 4;
    const sb = SEVERITY_ORDER[severityKey(b.severity)] ?? 4;
    return sa - sb;
  });

  resultsBody.innerHTML = sorted.map(r => {
    const message = r.message || "";
    const rootCause = r.root_cause || "";
    return `
    <tr>
      <td class="col-service">${escapeHtml(r.service)}</td>
      <td class="col-level">${escapeHtml(r.level)}</td>
      <td class="col-message">${escapeHtml(message)}</td>
      <td>${escapeHtml(r.category || "")}</td>
      <td><span class="badge ${severityBadgeClass(r.severity)}">${escapeHtml(severityKey(r.severity))}</span></td>
      <td class="col-root-cause" title="${escapeHtml(rootCause)}">${escapeHtml(rootCause)}</td>
      <td><ul>${(r.recommendation || []).map(rec => `<li>${escapeHtml(rec)}</li>`).join("")}</ul></td>
    </tr>
  `;
  }).join("");
  resultsTable.classList.remove("hidden");
}

function renderResults(results) {
  if (!results || results.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");
  renderSummary(results);
  renderTable(results);
}

function poll() {
  fetch("/status")
    .then(res => res.json())
    .then(status => {
      if (status.error) {
        progressContainer.classList.add("hidden");
        setRunning(false);
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
        setRunning(false);
        fetch("/results")
          .then(res => res.json())
          .then(renderResults);
      }
    });
}

runBtn.addEventListener("click", () => {
  setRunning(true);
  errorBanner.classList.add("hidden");
  fetch("/run-analysis", { method: "POST" })
    .then(res => res.json())
    .then(data => {
      if (data.started) {
        setTimeout(poll, 500);
      } else {
        setRunning(false);
        showError(data.reason || "Could not start analysis");
      }
    });
});

renderResults(window.INITIAL_RESULTS);
