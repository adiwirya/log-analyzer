# Local AI Error Log Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, offline web app that analyzes a dummy error-log dataset via Ollama (`qwen3:4b`) and displays category/severity/root-cause/recommendation results in a minimalist, informative Flask viewer.

**Architecture:** A pure-logic `analyzer.py` module (prompt building, Ollama calls, JSON parsing with retry/fallback, batch runner) sits behind a thin Flask app (`app.py`) that runs the batch job on a background thread and exposes progress via polling. A single-page viewer (`templates/index.html` + `static/`) triggers the run and renders a summary + results table client-side.

**Tech Stack:** Python 3, Flask, `ollama` Python client, plain HTML/CSS/JS (no frontend framework). File-based storage only (`data/logs.json`, `data/analysis_result.json`) — no database.

## Global Constraints

- AI engine: Ollama, model `qwen3:4b` — must already be pulled locally (`ollama pull qwen3:4b`) and `ollama serve` running before end-to-end testing.
- No database — storage is file-based only (`data/logs.json`, `data/analysis_result.json`).
- No automated test suite (pytest or otherwise) — every task is verified via a manual command/browser check described in that task's steps, per the approved spec.
- Background analysis runs via Python `threading.Thread` + client polling (`GET /status`) — not SSE, not a job queue (Celery/RQ).
- AI parse-failure policy: retry once on JSON parse failure; if the retry also fails, fall back to `category: "UNKNOWN"`, `severity: "UNKNOWN"`, `root_cause: "Failed to parse AI response"`, `recommendation: []`, plus the raw response text for debugging.
- UI must be minimalist (no CSS framework) but informative — a summary stats bar (counts by severity) is required in addition to the detail table.
- Spec reference: `docs/superpowers/specs/2026-07-13-local-ai-error-log-analyzer-design.md`

---

## File Structure

- **Create:** `requirements.txt` — Python dependencies (`flask`, `ollama`).
- **Create:** `data/logs.json` — static dataset, 50 dummy error log entries.
- **Create (at runtime, not by hand):** `data/analysis_result.json` — output of a completed analysis run.
- **Create:** `analyzer.py` — pure logic: `build_prompt`, `call_ollama`, `parse_response`, `analyze_entry`, `run_analysis`. No Flask dependency, so it can be exercised standalone from the command line.
- **Create:** `app.py` — Flask app: routes (`/`, `/run-analysis`, `/status`, `/results`), background-thread orchestration, in-memory progress state.
- **Create:** `templates/index.html` — single-page viewer template (empty state, run button, progress bar, summary + table containers).
- **Create:** `static/style.css` — minimal styling (no framework).
- **Create:** `static/app.js` — client-side logic: trigger run, poll status, render summary + table.

---

### Task 1: Project scaffold & dummy dataset

**Files:**
- Create: `requirements.txt`
- Create: `data/logs.json`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `data/logs.json` — a JSON array of 50 objects, each `{"service": str, "level": str, "message": str}`. All later tasks that load the dataset read this exact path and shape.

- [x] **Step 1: Create `requirements.txt`**

```
flask
ollama
```

- [x] **Step 2: Create `data/logs.json` with 50 dummy entries**

```json
[
  {"service": "POS API", "level": "ERROR", "message": "SQL connection timeout"},
  {"service": "Payment API", "level": "ERROR", "message": "SQL connection timeout after 30000ms"},
  {"service": "Order Service", "level": "CRITICAL", "message": "Deadlock found when trying to get lock; try restarting transaction"},
  {"service": "Inventory Service", "level": "ERROR", "message": "Query execution timeout after 30000ms on table 'stock_levels'"},
  {"service": "Reporting Service", "level": "ERROR", "message": "Too many connections to MySQL server"},
  {"service": "Billing API", "level": "ERROR", "message": "Cannot add or update a child row: a foreign key constraint fails"},
  {"service": "Customer Service", "level": "CRITICAL", "message": "Database connection pool exhausted, no available connections"},
  {"service": "Order Service", "level": "ERROR", "message": "Duplicate entry '10245' for key 'orders.PRIMARY'"},
  {"service": "Warehouse API", "level": "ERROR", "message": "Lock wait timeout exceeded; try restarting transaction"},
  {"service": "Analytics Service", "level": "ERROR", "message": "Table 'analytics.daily_summary' doesn't exist"},
  {"service": "Payment API", "level": "ERROR", "message": "Redis connection refused on 127.0.0.1:6379"},
  {"service": "Session Service", "level": "ERROR", "message": "Redis timeout waiting for response after 2000ms"},
  {"service": "Cart Service", "level": "ERROR", "message": "Redis ERR max number of clients reached"},
  {"service": "Auth Service", "level": "ERROR", "message": "Redis connection reset by peer"},
  {"service": "Cache Warmup Job", "level": "CRITICAL", "message": "Redis OOM command not allowed when used memory > 'maxmemory'"},
  {"service": "Product Service", "level": "CRITICAL", "message": "Redis cluster is down (CLUSTERDOWN)"},
  {"service": "Notification Service", "level": "ERROR", "message": "Redis NOAUTH Authentication required"},
  {"service": "Rate Limiter", "level": "ERROR", "message": "Redis connection pool exhausted, no idle connections"},
  {"service": "Shipping API", "level": "ERROR", "message": "Connection timed out after 5000ms while calling carrier API"},
  {"service": "Payment Gateway", "level": "ERROR", "message": "SSL handshake failed: certificate verify failed"},
  {"service": "Notification Service", "level": "ERROR", "message": "DNS resolution failed for host smtp.example.com"},
  {"service": "Third-Party Integration", "level": "ERROR", "message": "Connection reset by peer while reading response"},
  {"service": "Webhook Dispatcher", "level": "ERROR", "message": "Read timeout on upstream server after 10000ms"},
  {"service": "External API Client", "level": "ERROR", "message": "No route to host 10.0.4.15"},
  {"service": "Load Balancer", "level": "CRITICAL", "message": "Upstream connect error or disconnect/reset before headers"},
  {"service": "Sync Worker", "level": "ERROR", "message": "Network is unreachable"},
  {"service": "POS Frontend", "level": "ERROR", "message": "PHP Fatal error: Uncaught TypeError: array_merge(): Argument #1 must be of type array, null given"},
  {"service": "Web Portal", "level": "ERROR", "message": "PHP Fatal error: Uncaught Error: Call to undefined method Order::calculateTax()"},
  {"service": "Checkout Page", "level": "WARNING", "message": "PHP Warning: Undefined array key \"customer_id\""},
  {"service": "Admin Panel", "level": "CRITICAL", "message": "PHP Fatal error: Allowed memory size of 134217728 bytes exhausted"},
  {"service": "Report Generator", "level": "ERROR", "message": "PHP Fatal error: Maximum execution time of 30 seconds exceeded"},
  {"service": "Invoice Module", "level": "WARNING", "message": "PHP Notice: Trying to access array offset on value of type null"},
  {"service": "Customer Portal", "level": "ERROR", "message": "PHP Fatal error: Uncaught Error: Class \"App\\Services\\PaymentService\" not found"},
  {"service": "Legacy Billing System", "level": "ERROR", "message": "PHP Parse error: syntax error, unexpected '}' in billing.php on line 88"},
  {"service": "Product Catalog", "level": "ERROR", "message": "PHP Fatal error: Cannot redeclare getProductPrice()"},
  {"service": "Coupon Engine", "level": "ERROR", "message": "PHP Fatal error: Uncaught DivisionByZeroError: Division by zero"},
  {"service": "Auth Service", "level": "WARNING", "message": "JWT token expired for user session"},
  {"service": "Login API", "level": "WARNING", "message": "Invalid credentials provided too many times, account locked"},
  {"service": "SSO Gateway", "level": "ERROR", "message": "SAML assertion validation failed: signature mismatch"},
  {"service": "Auth Service", "level": "CRITICAL", "message": "Refresh token reuse detected, possible token theft"},
  {"service": "Identity Provider", "level": "ERROR", "message": "OAuth2 client_id not recognized"},
  {"service": "Admin Login", "level": "CRITICAL", "message": "Possible session hijacking attempt detected from new IP"},
  {"service": "API Gateway", "level": "WARNING", "message": "Missing Authorization header on protected route"},
  {"service": "Payment API", "level": "ERROR", "message": "HTTP 502 Bad Gateway from upstream payment processor"},
  {"service": "Order API", "level": "WARNING", "message": "HTTP 429 Too Many Requests"},
  {"service": "Shipping API", "level": "ERROR", "message": "HTTP 500 Internal Server Error from carrier integration"},
  {"service": "Inventory API", "level": "ERROR", "message": "Unexpected end of JSON input while parsing upstream response"},
  {"service": "Notification API", "level": "ERROR", "message": "HTTP 503 Service Unavailable"},
  {"service": "Search API", "level": "CRITICAL", "message": "Elasticsearch cluster health is RED"},
  {"service": "Recommendation Service", "level": "ERROR", "message": "gRPC deadline exceeded while calling model server"}
]
```

- [x] **Step 3: Verify the file is valid JSON with 50 entries**

Run:
```bash
python -c "import json; data = json.load(open('data/logs.json')); print(len(data)); print(data[0]); print(data[-1])"
```
Expected: prints `50`, then the first entry (`POS API` / SQL connection timeout) and the last entry (`Recommendation Service` / gRPC deadline exceeded).

- [x] **Step 4: Commit**

```bash
git add requirements.txt data/logs.json
git commit -m "Add project scaffold and 50-entry dummy log dataset"
```

**Task 1 status: COMPLETE.** Commit `d75eb78`. Task-reviewer approved (spec compliant, no issues).

---

### Task 2: Prompt builder + Ollama client wrapper

**Files:**
- Create: `analyzer.py`

**Interfaces:**
- Consumes: nothing new (uses the `ollama` package installed in Task 1's `requirements.txt`).
- Produces:
  - `build_prompt(service: str, message: str) -> str`
  - `call_ollama(prompt: str, model: str = "qwen3:4b") -> str` — returns the raw text content of the model's reply.

- [x] **Step 1: Install dependencies**

```bash
pip install -r requirements.txt
```

- [x] **Step 2: Create `analyzer.py` with `build_prompt` and `call_ollama`**

```python
import ollama


def build_prompt(service, message):
    return f"""You are a senior software engineer.

Analyze this error log.

Service:
{service}

Error:
{message}

Return JSON only:

{{
 "category":"",
 "severity":"",
 "root_cause":"",
 "recommendation":[]
}}"""


def call_ollama(prompt, model="qwen3:4b"):
    response = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        format="json",
    )
    return response["message"]["content"]
```

- [x] **Step 3: Verify `build_prompt` output manually**

Run:
```bash
python -c "from analyzer import build_prompt; print(build_prompt('Payment API', 'Redis connection refused'))"
```
Expected: prints the full prompt text with `Payment API` after `Service:` and `Redis connection refused` after `Error:`, ending with the JSON template.

- [x] **Step 4: Verify `call_ollama` against a real running Ollama instance**

Make sure Ollama is running and the model is pulled first:
```bash
ollama pull qwen3:4b
```

Run:
```bash
python -c "from analyzer import build_prompt, call_ollama; print(call_ollama(build_prompt('Payment API', 'Redis connection refused')))"
```
Expected: prints a text response containing JSON-like content with keys `category`, `severity`, `root_cause`, `recommendation` (values will vary — this step only confirms the Ollama call round-trips successfully).

- [x] **Step 5: Commit**

```bash
git add analyzer.py
git commit -m "Add prompt builder and Ollama client wrapper"
```

**Task 2 status: COMPLETE.** `analyzer.py` content (committed earlier as `wip-task2`, commit `5502665`) re-verified on resume — Step 3 and Step 4 both passed against a real local Ollama instance (`qwen3:4b`). Finalized in commit below.

---

### Task 3: Response parser with retry & fallback

**Files:**
- Modify: `analyzer.py`

**Interfaces:**
- Consumes: `build_prompt`, `call_ollama` from Task 2.
- Produces:
  - `parse_response(raw_text: str) -> dict` — raises `ValueError` if no JSON object can be extracted.
  - `analyze_entry(entry: dict, model: str = "qwen3:4b") -> dict` — returns `{**entry, **ai_fields}` where `ai_fields` has keys `category`, `severity`, `root_cause`, `recommendation` (and `raw_response` only on fallback).

- [x] **Step 1: Add `parse_response` and `analyze_entry` to `analyzer.py`**

```python
import json
import re

import ollama


def build_prompt(service, message):
    return f"""You are a senior software engineer.

Analyze this error log.

Service:
{service}

Error:
{message}

Return JSON only:

{{
 "category":"",
 "severity":"",
 "root_cause":"",
 "recommendation":[]
}}"""


def call_ollama(prompt, model="qwen3:4b"):
    response = ollama.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        format="json",
    )
    return response["message"]["content"]


def parse_response(raw_text):
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from response: {raw_text!r}")


def analyze_entry(entry, model="qwen3:4b"):
    prompt = build_prompt(entry["service"], entry["message"])

    for attempt in range(2):
        raw_text = call_ollama(prompt, model=model)
        try:
            ai_fields = parse_response(raw_text)
            return {**entry, **ai_fields}
        except ValueError:
            if attempt == 1:
                return {
                    **entry,
                    "category": "UNKNOWN",
                    "severity": "UNKNOWN",
                    "root_cause": "Failed to parse AI response",
                    "recommendation": [],
                    "raw_response": raw_text,
                }
```

- [x] **Step 2: Verify `parse_response` on clean JSON**

Run:
```bash
python -c "from analyzer import parse_response; print(parse_response('{\"category\": \"Database\", \"severity\": \"HIGH\", \"root_cause\": \"x\", \"recommendation\": [\"a\"]}'))"
```
Expected: prints `{'category': 'Database', 'severity': 'HIGH', 'root_cause': 'x', 'recommendation': ['a']}`.

- [x] **Step 3: Verify `parse_response` extracts JSON wrapped in prose**

Run:
```bash
python -c "from analyzer import parse_response; print(parse_response('Sure! Here is the JSON: {\"category\": \"Database\", \"severity\": \"HIGH\", \"root_cause\": \"x\", \"recommendation\": []} Hope this helps!'))"
```
Expected: prints `{'category': 'Database', 'severity': 'HIGH', 'root_cause': 'x', 'recommendation': []}`.

- [x] **Step 4: Verify `parse_response` raises on unparseable text**

Run:
```bash
python -c "from analyzer import parse_response; parse_response('not json at all')"
```
Expected: raises `ValueError: Could not parse JSON from response: 'not json at all'`.

- [x] **Step 5: Verify `analyze_entry` retry-then-fallback behavior (no real Ollama call needed)**

Run:
```bash
python <<'EOF'
import analyzer

calls = {"count": 0}


def fake_call_ollama(prompt, model="qwen3:4b"):
    calls["count"] += 1
    return "not valid json"


analyzer.call_ollama = fake_call_ollama

result = analyzer.analyze_entry({"service": "Test", "level": "ERROR", "message": "test"})
print(result)
print("calls:", calls["count"])
EOF
```
Expected: prints a dict with `category: 'UNKNOWN'`, `severity: 'UNKNOWN'`, `root_cause: 'Failed to parse AI response'`, `raw_response: 'not valid json'`, and `calls: 2` (confirming exactly one retry).

- [x] **Step 6: Commit**

```bash
git add analyzer.py
git commit -m "Add JSON response parsing with retry and UNKNOWN fallback"
```

---

### Task 4: Batch runner with progress tracking

**Files:**
- Modify: `analyzer.py`

**Interfaces:**
- Consumes: `analyze_entry` from Task 3.
- Produces: `run_analysis(logs: list[dict], model: str = "qwen3:4b", progress_callback=None) -> list[dict]` — `progress_callback`, if given, is called as `progress_callback(current: int, total: int)` after each entry.

- [x] **Step 1: Add `run_analysis` to `analyzer.py`**

Append this function at the end of `analyzer.py`:

```python
def run_analysis(logs, model="qwen3:4b", progress_callback=None):
    results = []
    total = len(logs)
    for i, entry in enumerate(logs, start=1):
        result = analyze_entry(entry, model=model)
        results.append(result)
        if progress_callback:
            progress_callback(i, total)
    return results
```

- [x] **Step 2: Verify `run_analysis` drives `analyze_entry` and reports progress (no real Ollama call needed)**

Run:
```bash
python <<'EOF'
import analyzer

analyzer.call_ollama = lambda prompt, model="qwen3:4b": (
    '{"category": "Database", "severity": "HIGH", "root_cause": "x", "recommendation": ["y"]}'
)

logs = [
    {"service": "A", "level": "ERROR", "message": "m1"},
    {"service": "B", "level": "ERROR", "message": "m2"},
    {"service": "C", "level": "ERROR", "message": "m3"},
]

progress_calls = []
results = analyzer.run_analysis(logs, progress_callback=lambda c, t: progress_calls.append((c, t)))

print(len(results))
print(results[0])
print(progress_calls)
EOF
```
Expected: prints `3`, then a dict for the first entry with `service: 'A'` and `category: 'Database'`, then `[(1, 3), (2, 3), (3, 3)]`.

- [x] **Step 3: Commit**

```bash
git add analyzer.py
git commit -m "Add batch runner with progress callback"
```

---

### Task 5: Flask app — routes & background thread orchestration

**Files:**
- Create: `app.py`

**Interfaces:**
- Consumes: `run_analysis` from Task 4 (`analyzer.run_analysis(logs, model=MODEL, progress_callback=...)`).
- Produces:
  - Routes: `GET /`, `POST /run-analysis`, `GET /status`, `GET /results`.
  - Writes `data/analysis_result.json` on completion — later tasks (templates/JS) read this shape: a JSON array of dicts, each with `service`, `level`, `message`, `category`, `severity`, `root_cause`, `recommendation` (and optionally `raw_response`).
  - Module-level `progress` dict shape consumed by `templates/index.html`/`static/app.js`: `{"running": bool, "current": int, "total": int, "done": bool, "error": str | None}`.

- [x] **Step 1: Create `app.py`**

```python
import json
import os
import threading

from flask import Flask, jsonify, render_template

from analyzer import run_analysis

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LOGS_PATH = os.path.join(DATA_DIR, "logs.json")
RESULT_PATH = os.path.join(DATA_DIR, "analysis_result.json")
MODEL = "qwen3:4b"

progress = {"running": False, "current": 0, "total": 0, "done": False, "error": None}
progress_lock = threading.Lock()


def _load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _run_analysis_job():
    try:
        logs = _load_json(LOGS_PATH)
        if logs is None:
            raise FileNotFoundError(f"{LOGS_PATH} not found")

        def on_progress(current, total):
            with progress_lock:
                progress["current"] = current
                progress["total"] = total

        results = run_analysis(logs, model=MODEL, progress_callback=on_progress)

        with open(RESULT_PATH, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        with progress_lock:
            progress["running"] = False
            progress["done"] = True
    except Exception as exc:
        with progress_lock:
            progress["running"] = False
            progress["done"] = True
            progress["error"] = str(exc)


@app.route("/")
def index():
    logs_exist = os.path.exists(LOGS_PATH)
    results = _load_json(RESULT_PATH)
    return render_template("index.html", results=results, logs_exist=logs_exist)


@app.route("/run-analysis", methods=["POST"])
def run_analysis_route():
    with progress_lock:
        if progress["running"]:
            return jsonify({"started": False, "reason": "already running"}), 409
        progress["running"] = True
        progress["current"] = 0
        progress["total"] = 0
        progress["done"] = False
        progress["error"] = None

    thread = threading.Thread(target=_run_analysis_job, daemon=True)
    thread.start()
    return jsonify({"started": True})


@app.route("/status")
def status():
    with progress_lock:
        return jsonify(dict(progress))


@app.route("/results")
def results_route():
    results = _load_json(RESULT_PATH)
    return jsonify(results or [])


if __name__ == "__main__":
    app.run(debug=True)
```

- [x] **Step 2: Create minimal placeholder template so the app can start**

Create `templates/index.html` with a temporary placeholder (this is replaced with the full viewer in Task 6):

```html
<!DOCTYPE html>
<html>
<head><title>Local AI Error Log Analyzer</title></head>
<body><h1>Placeholder — replaced in Task 6</h1></body>
</html>
```

- [x] **Step 3: Verify the server starts and routes respond correctly**

Run in one terminal:
```bash
python app.py
```

In another terminal, run:
```bash
curl -s http://127.0.0.1:5000/
curl -s -X POST http://127.0.0.1:5000/run-analysis
sleep 3
curl -s http://127.0.0.1:5000/status
```
Expected:
- First `curl` returns the placeholder HTML with `200 OK`.
- Second `curl` returns `{"started": true}`.
- Third `curl` (after 3s) returns JSON with `"running": true` and `"current"` greater than `0` if Ollama is running and responding, e.g. `{"running": true, "current": 1, "total": 50, "done": false, "error": null}` (exact `current` varies with model speed).

Stop the server with Ctrl+C once confirmed (no need to wait for the full 50-entry run — that happens in Task 9).

- [x] **Step 4: Commit**

```bash
git add app.py templates/index.html
git commit -m "Add Flask app with background-thread analysis and polling routes"
```

---

### Task 6: Viewer template, styling, and run/poll wiring

**Files:**
- Modify: `templates/index.html`
- Create: `static/style.css`
- Create: `static/app.js`

**Interfaces:**
- Consumes: `GET /status` and `POST /run-analysis` responses from Task 5 (shapes above).
- Produces: DOM elements consumed by Task 7's rendering code: `#summary` (container), `#results-table` + `#results-body` (table), `#error-banner`, `#progress-container` / `#progress-bar-fill` / `#progress-text`.

- [x] **Step 1: Replace `templates/index.html` with the full viewer page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Local AI Error Log Analyzer</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
  <header>
    <h1>Local AI Error Log Analyzer</h1>
    <button id="run-btn" {% if not logs_exist %}disabled{% endif %}>Run Analysis</button>
  </header>

  {% if not logs_exist %}
  <p class="error-banner">data/logs.json not found. Add a dataset file before running analysis.</p>
  {% endif %}

  <div id="progress-container" class="hidden">
    <div id="progress-bar"><div id="progress-bar-fill"></div></div>
    <p id="progress-text"></p>
  </div>

  <p id="error-banner" class="error-banner hidden"></p>

  <section id="summary"></section>

  <table id="results-table" class="hidden">
    <thead>
      <tr>
        <th>Service</th>
        <th>Level</th>
        <th>Message</th>
        <th>Category</th>
        <th>Severity</th>
        <th>Root Cause</th>
        <th>Recommendation</th>
      </tr>
    </thead>
    <tbody id="results-body"></tbody>
  </table>

  <script>
    window.INITIAL_RESULTS = {{ (results or []) | tojson }};
  </script>
  <script src="{{ url_for('static', filename='app.js') }}"></script>
</body>
</html>
```

- [x] **Step 2: Create `static/style.css`**

```css
* { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Arial, sans-serif; }
body { margin: 2rem; color: #1a1a1a; }
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
h1 { font-size: 1.4rem; margin: 0; }
button { padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.5; }
.hidden { display: none; }
.error-banner { background: #fdecea; color: #611a15; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem; }

#progress-container { margin-bottom: 1rem; }
#progress-bar { background: #e0e0e0; border-radius: 4px; height: 10px; overflow: hidden; }
#progress-bar-fill { background: #2563eb; height: 100%; width: 0%; transition: width 0.3s; }
#progress-text { font-size: 0.85rem; color: #555; margin-top: 0.25rem; }

#summary { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; }
.summary-item { background: #f5f5f5; border-radius: 6px; padding: 0.75rem 1rem; min-width: 120px; }
.summary-item .label { font-size: 0.75rem; color: #666; display: block; }
.summary-item .value { font-size: 1.3rem; font-weight: 600; }

table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; vertical-align: top; }
th { background: #fafafa; }

.badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; color: #fff; }
.badge-high { background: #dc2626; }
.badge-medium { background: #d97706; }
.badge-low { background: #059669; }
.badge-unknown { background: #6b7280; }
```

- [x] **Step 3: Create `static/app.js` with run button + polling (rendering stubbed for now)**

```javascript
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
```

- [x] **Step 4: Verify in browser**

Run:
```bash
python app.py
```

Open `http://127.0.0.1:5000/` in a browser. Confirm:
- Page loads with title "Local AI Error Log Analyzer", a "Run Analysis" button, no console errors.
- Clicking "Run Analysis" disables the button (text becomes "Running...") and shows a progress bar that fills up over time.
- Browser devtools console shows `renderResults called with 50 entries` once the run finishes (confirms polling correctly detects `done` and fetches `/results`).

Stop the server with Ctrl+C once confirmed.

- [x] **Step 5: Commit**

```bash
git add templates/index.html static/style.css static/app.js
git commit -m "Add viewer template, styling, and run/poll wiring"
```

---

### Task 7: Results rendering — summary stats + table

**Files:**
- Modify: `static/app.js`

**Interfaces:**
- Consumes: results array shape from Task 5 (`service`, `level`, `message`, `category`, `severity`, `root_cause`, `recommendation`).
- Produces: fully populated `#summary` and `#results-table` DOM — nothing further depends on this beyond the browser.

- [x] **Step 1: Replace the stub `renderResults` in `static/app.js` with full rendering**

Replace this block:

```javascript
function renderResults(results) {
  // Filled in by Task 7.
  console.log("renderResults called with", results.length, "entries");
}
```

with:

```javascript
const summary = document.getElementById("summary");
const resultsTable = document.getElementById("results-table");
const resultsBody = document.getElementById("results-body");

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

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
```

- [x] **Step 2: Verify with a small fixture in the browser**

Run:
```bash
python app.py
```

In the browser devtools console (with the page open at `http://127.0.0.1:5000/`), run:
```javascript
renderResults([
  {service: "Test A", level: "ERROR", message: "msg", category: "Database", severity: "HIGH", root_cause: "pool exhausted", recommendation: ["check pool size", "restart service"]},
  {service: "Test B", level: "ERROR", message: "msg", category: "Network", severity: "LOW", root_cause: "flaky link", recommendation: ["retry"]}
]);
```
Expected: the summary bar shows "Total Analyzed: 2", "HIGH: 1", "LOW: 1"; the table shows two rows, "Test A" first (HIGH sorts above LOW) with a red badge, "Test B" second with a green badge, and its recommendation cell rendered as a bullet list with one item.

- [x] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "Render summary stats and results table"
```

---

### Task 8: Error handling — Ollama unavailable & missing dataset

**Files:**
- Modify: `app.py`
- Modify: `templates/index.html`

**Interfaces:**
- Consumes: `progress["error"]` (Task 5), `logs_exist` template variable (Task 5).
- Produces: no new interfaces — this task hardens existing behavior.

- [ ] **Step 1: Verify the missing-dataset case (uses existing `logs_exist` check from Task 5)**

Run:
```bash
mv data/logs.json data/logs.json.bak
python app.py
```

Open `http://127.0.0.1:5000/` in a browser. Confirm:
- The page shows the banner "data/logs.json not found. Add a dataset file before running analysis."
- The "Run Analysis" button is disabled (grayed out).

Stop the server (Ctrl+C), then restore the dataset:
```bash
mv data/logs.json.bak data/logs.json
```

- [ ] **Step 2: Verify the Ollama-unavailable case without needing to actually stop Ollama**

`_run_analysis_job` in `app.py` already wraps the whole job in `try/except Exception` and stores `str(exc)` in `progress["error"]` (see Task 5, Step 1) — this step confirms that path surfaces correctly end-to-end through `/status` and the UI.

Run:
```bash
python <<'EOF'
import analyzer


def fake_call_ollama(prompt, model="qwen3:4b"):
    raise ConnectionError("Could not connect to Ollama at http://localhost:11434")


analyzer.call_ollama = fake_call_ollama

import app as flask_app

flask_app._run_analysis_job()
print(flask_app.progress)
EOF
```
Expected: prints a `progress` dict with `"running": False`, `"done": True`, and `"error"` containing `"Could not connect to Ollama at http://localhost:11434"`.

- [ ] **Step 3: Confirm the error renders in the browser UI**

Run:
```bash
python app.py
```

In the browser devtools console (page open at `http://127.0.0.1:5000/`), simulate the polled error response directly:
```javascript
fetch("/status").then(r => r.json()).then(console.log);
```
This just confirms `/status` is reachable; to see the actual error banner render, re-run Step 2's script against the running server process is not applicable (it's a separate process) — instead, confirm the rendering logic itself by inspecting `static/app.js`'s `poll()` function (Task 6, Step 3): when `status.error` is truthy, it calls `showError(status.error)`, which sets `#error-banner` text and removes the `hidden` class. This code path was already exercised by the missing-dataset scenario producing a `FileNotFoundError` message if `data/logs.json` is renamed away and "Run Analysis" is clicked instead of relying on `logs_exist`:

```bash
mv data/logs.json data/logs.json.bak
```
Then, with the server still running, use devtools to remove the `disabled` attribute from the button (`document.getElementById('run-btn').disabled = false`) and click it. Confirm the red error banner appears with a message mentioning `logs.json`. Restore the dataset afterward:
```bash
mv data/logs.json.bak data/logs.json
```

- [ ] **Step 4: Commit**

```bash
git add app.py templates/index.html
git commit -m "Verify error handling for missing dataset and unreachable Ollama"
```

---

### Task 9: Full end-to-end verification

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: the complete app from Tasks 1–8.
- Produces: `data/analysis_result.json` populated with 50 real analyzed entries.

- [ ] **Step 1: Confirm Ollama is running with the right model**

```bash
ollama list
```
Expected: `qwen3:4b` appears in the list. If not, run `ollama pull qwen3:4b` first.

- [ ] **Step 2: Run the full app end-to-end**

```bash
python app.py
```

Open `http://127.0.0.1:5000/` in a browser and click "Run Analysis". Wait for the progress bar to reach 50/50 and disappear.

- [ ] **Step 3: Verify the output file**

Run (in another terminal, while or after the server is running):
```bash
python -c "import json; r = json.load(open('data/analysis_result.json')); print(len(r)); print(r[0]); print(sum(1 for x in r if x['severity'] == 'UNKNOWN'))"
```
Expected: prints `50`, the fully analyzed first entry (containing `service`, `level`, `message`, `category`, `severity`, `root_cause`, `recommendation`), and a count of `UNKNOWN`-severity entries (ideally `0`, but any small number confirms the fallback path works rather than crashing).

- [ ] **Step 4: Verify the browser view**

Confirm in the browser:
- The summary bar shows "Total Analyzed: 50" plus a breakdown by severity.
- The table lists all 50 rows, sorted with the highest severities first.
- Each row's Recommendation column renders as a bullet list (not a raw array string).

- [ ] **Step 5: Commit**

If any fixes were needed during this verification pass, commit them now. If no code changed, no commit is needed for this task — the plan is complete once Step 4 passes.

---

## Self-Review Notes

- **Spec coverage:** dataset (Task 1), Ollama call + prompt (Task 2), JSON parsing + retry/fallback (Task 3), batch loop (Task 4), Flask routes/background thread (Task 5), viewer UI + run/poll (Task 6), summary + table rendering (Task 7), error handling for both failure modes named in the spec (Task 8), full 50-entry acceptance run (Task 9). All spec sections (2–9) are covered.
- **Placeholders:** none — every step has literal file content and literal commands.
- **Type/signature consistency:** `analyze_entry`, `run_analysis`, `progress` dict shape, and the results array shape are defined once (Tasks 3–5) and reused verbatim in every later task (6–9) without renaming.
