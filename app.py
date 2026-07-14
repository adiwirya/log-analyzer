import json
import os
import threading

from flask import Flask, jsonify, render_template

from analyzer import parse_log_file, run_analysis

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LOGS_PATH = os.path.join(DATA_DIR, "file.log")
RESULT_PATH = os.path.join(DATA_DIR, "analysis_result.json")
MODEL = "qwen3:1.7b"
ANALYZABLE_LEVELS = {"ERROR", "CRITICAL"}

progress = {"running": False, "current": 0, "total": 0, "done": False, "error": None}
progress_lock = threading.Lock()


def _load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _run_analysis_job():
    try:
        if not os.path.exists(LOGS_PATH):
            raise FileNotFoundError(f"{LOGS_PATH} not found")

        logs = [
            entry for entry in parse_log_file(LOGS_PATH)
            if entry["level"].upper() in ANALYZABLE_LEVELS
        ]

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
