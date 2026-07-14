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


def run_analysis(logs, model="qwen3:4b", progress_callback=None):
    results = []
    total = len(logs)
    for i, entry in enumerate(logs, start=1):
        result = analyze_entry(entry, model=model)
        results.append(result)
        if progress_callback:
            progress_callback(i, total)
    return results
