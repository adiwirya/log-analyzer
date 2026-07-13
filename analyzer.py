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
