# Design — Local AI Error Log Analyzer (MVP Demo)

Date: 2026-07-13
Status: Approved for planning

## 1. Overview

Prototype offline aplikasi yang menganalisa dummy error log menggunakan local LLM (Ollama) dan menampilkan hasilnya (category, severity, root cause, recommendation) lewat web viewer minimalis.

Sumber requirement: PRD "Local AI Error Log Analyzer (MVP Demo)".

## 2. Key Decisions

| Area | Keputusan |
|---|---|
| AI engine | Ollama, model `qwen3:4b` (sudah ter-install di mesin user) |
| Dataset | Static `data/logs.json`, ~50 dummy entries, variasi: Database/SQL, Redis/Cache, Network/Timeout, PHP Application errors, Auth, API/HTTP |
| Storage | File-based saja (`logs.json`, `analysis_result.json`) — tidak ada database |
| Viewer | Simple web app (Flask) — bukan CLI-only, bukan static HTML tanpa server |
| Trigger analisa | Tombol "Run Analysis" di web app (bukan batch script terpisah) |
| Error handling (AI parse gagal) | Retry sekali, lalu fallback ke `UNKNOWN` dengan raw response disertakan |
| UI style | Minimalis, tanpa CSS framework, tapi informatif (ada summary stats) |
| Testing | Manual verification saja, tidak ada automated test suite |

## 3. Architecture

```
                    ┌─────────────────┐
                    │  data/logs.json │  (~50 dummy error entries)
                    └────────┬────────┘
                             │
                             v
                 ┌───────────────────────┐
                 │   Flask Web App        │
                 │  (app.py)               │
                 │                         │
                 │  GET  /            -> viewer page (table hasil, kalau ada)
                 │  POST /run-analysis -> start background thread
                 │  GET  /status       -> progress polling (JSON)
                 └───────────┬─────────────┘
                             │ background thread
                             v
                 ┌───────────────────────┐
                 │   analyzer.py          │
                 │  loop tiap log entry   │
                 │  -> build prompt       │
                 │  -> call Ollama        │
                 │  -> parse JSON         │
                 │  -> retry/fallback     │
                 └───────────┬─────────────┘
                             │
                             v
                 ┌───────────────────────┐
                 │   Ollama (qwen3:4b)    │
                 └───────────┬────────────┘
                             │
                             v
              ┌───────────────────────────┐
              │ data/analysis_result.json │
              └─────────────┬─────────────┘
                             │
                             v
                  Viewer table (re-poll -> render)
```

Analisa dijalankan lewat background thread supaya Flask tetap responsive selama loop panggil Ollama ke tiap 50 entries berjalan (bisa memakan waktu beberapa menit).

## 4. Components

- **`data/logs.json`** — static file, 50 pre-authored dummy error entries (`service`, `level`, `message`). Ditulis sekali, tidak digenerate ulang saat runtime.

- **`analyzer.py`** — pure logic module, tidak bergantung ke Flask:
  - `build_prompt(service, message)` — format prompt AI sesuai template PRD.
  - `call_ollama(prompt)` — panggil `ollama.chat()` dengan model `qwen3:4b`.
  - `parse_response(raw_text)` — extract & validasi JSON dari response; raise kalau gagal.
  - `analyze_entry(entry)` — orkestrasi satu entry: prompt → call → parse → retry sekali kalau gagal → fallback `UNKNOWN`.
  - `run_analysis(logs, progress_callback)` — loop semua entry, panggil `progress_callback(current, total)` tiap entry, return list hasil.

- **`app.py`** — Flask app, thin layer di atas `analyzer.py`:
  - `GET /` — render viewer page (tabel dari `analysis_result.json` kalau ada, kalau tidak: empty state + tombol "Run Analysis").
  - `POST /run-analysis` — spawn `threading.Thread` menjalankan `run_analysis()`, update progress dict module-level, tulis `analysis_result.json` saat selesai.
  - `GET /status` — return progress dict sebagai JSON (`{running, current, total, done, error}`).

- **`templates/index.html`** — single page: tombol, progress bar, summary stats bar, tabel hasil. Plain JS `fetch()` polling `/status` tiap ~1.5 detik selama `running`, lalu reload tabel saat `done`.

- **`data/analysis_result.json`** — output array, satu object per log entry (field input + field hasil AI).

## 5. Data Flow & UI Detail

1. User buka `/` — kalau `analysis_result.json` belum ada, tampil empty state + tombol "Run Analysis".
2. Klik tombol → `POST /run-analysis` → thread mulai, tombol berubah jadi progress bar ("12/50 dianalisa...").
3. JS polling `/status` tiap ~1.5 detik, update progress bar.
4. Saat `done: true` — JS fetch ulang data hasil, render:
   - **Summary bar**: total dianalisa, breakdown per severity (HIGH/MEDIUM/LOW dengan warna), breakdown per category.
   - **Tabel hasil**: Service | Level | Message (truncated) | Category | Severity (badge warna) | Root Cause | Recommendation (bullet list), diurutkan severity tertinggi dulu.
5. Tombol "Run Analysis" tetap ada untuk re-run.

Styling minimalis: satu file CSS kecil, tanpa framework (no Bootstrap/Tailwind).

## 6. Error Handling

- **Malformed/non-JSON AI response** — retry sekali dengan prompt sama. Kalau masih gagal: entry disimpan dengan `category: "UNKNOWN"`, `severity: "UNKNOWN"`, `root_cause: "Failed to parse AI response"`, raw response disertakan untuk debugging. Proses lanjut ke entry berikutnya.
- **Ollama tidak bisa diakses** — ditangkap di `run_analysis()`, proses dihentikan, progress dict diisi pesan error jelas ("Ollama tidak bisa diakses — pastikan `ollama serve` berjalan"), ditampilkan di UI (bukan generic 500).
- **`logs.json` tidak ditemukan/rusak** — app tetap start, viewer page tampilkan pesan error jelas, tombol "Run Analysis" disable.

## 7. Testing / Verification

Manual verification saja (sesuai skala & timeline demo 3 hari), tidak ada automated test suite:
- Jalankan `analyzer.py` langsung dari CLI dengan 2-3 sample log untuk pastikan prompt/parsing/retry-fallback jalan sebelum diintegrasikan ke Flask.
- End-to-end: jalankan `python app.py`, buka browser, klik "Run Analysis" di dataset 50 entries, pastikan progress bar update, hasil tampil, `analysis_result.json` tersimpan dengan format konsisten.
- Cek manual kasus "gagal parse" (misal matikan Ollama di tengah run) untuk pastikan fallback UNKNOWN & error message muncul benar.

## 8. Out of Scope (per PRD "Future Development")

- RAG knowledge base
- Database history
- Integrasi Loki/Grafana
- Auto incident summary
- Slack/Teams notification

## 9. Success Criteria

- Ollama (`qwen3:4b`) berhasil menganalisa seluruh 50 dummy error entries.
- Output AI konsisten dalam format JSON (category, severity, root_cause, recommendation) — dengan fallback `UNKNOWN` untuk kasus gagal parse.
- Web viewer menampilkan hasil secara jelas & informatif (summary stats + tabel detail).
