# PilotMetrics
## AI-Powered Aviation Safety & Threat Analysis Platform

### Research collection: worldwide aviation occurrences since 2000

The research pipeline preserves official source records, raw evidence, publication dates,
and resumable checkpoints separately from the briefing `events` table.
See [the research plan and verified database findings](docs/RESEARCH_PLAN.md).

```powershell
uv run --with requests --with beautifulsoup4 python collect_research.py --source jtsb --end 2026-09-13 --state work/research-jtsb --max-jobs 10 --max-seconds 120
```

Supported adapters: `jtsb`, `araib-ko`, `araib`, and `ntsb` (CAROL currently returns HTTP 500;
failed work remains pending). Collection exports JSONL/SQL and does not upload automatically.
Use a separate state directory for a different date range. `research_schema.sql` adds the D1
research store. Source-record counts must not be interpreted as unique accident counts.

For the NTSB CAROL fallback, run `uv run --with requests python collect_ntsb_bulk.py`; it downloads
the official `avall.zip`, records a SHA-256 manifest, and lists the archive without inserting data.

PilotMetrics is an aviation safety platform designed to help pilots identify potential operational threats before and during flight.

It combines flight information, weather data, route information, operational constraints, and aviation safety knowledge to provide a concise and flight-specific threat briefing.

### ✈️ Key Features

*   **Flight-Specific Threat Analysis**: Identifies potential threats based on the specific flight, route, airport, weather, and operational conditions.
*   **AI-Powered Safety Briefing**: Converts complex operational information into a concise and actionable safety briefing.
*   **Weather & Aviation Data Analysis**: Integrates aviation weather and operational data to highlight conditions that may affect flight safety.
*   **Operational Threat Identification**: Helps identify potential risks such as weather hazards, airport constraints, runway conditions, navigation issues, fuel considerations, and other operational threats.
*   **Pilot-Centered Information**: Presents safety-critical information in a format designed for quick review during flight preparation.

### 🎯 Purpose

PilotMetrics is designed to support Threat and Error Management (TEM) and proactive safety decision-making by helping pilots recognize potential threats before they develop into operational problems.

The goal is not to replace pilot judgment, but to provide an additional layer of structured information that supports better situational awareness and crew decision-making.

### 🧠 Concept

`Data → Analysis → Threat Identification → Safety Briefing`

PilotMetrics transforms fragmented aviation data into meaningful operational intelligence for pilots.

### 🚀 Vision

The long-term vision of PilotMetrics is to develop an intelligent aviation safety assistant capable of continuously analyzing operational information and providing context-aware threat awareness throughout the flight.

### ⚠️ Disclaimer

PilotMetrics is an experimental aviation safety and decision-support project.

It is not intended to replace official flight documentation, ATC instructions, aircraft operating manuals, company procedures, NOTAMs, weather briefings, or the professional judgment of flight crew.

Pilots remain responsible for verifying all operational information and making final decisions in accordance with applicable regulations and company procedures.

---

## Technical Setup & Development

### Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m src.seed
uvicorn src.main:app --reload
```

Open `http://127.0.0.1:8000` and search `KE629`.

### API

`GET /api/briefing/{flight_number}`

The backend uses Aviationstack when `AVIATIONSTACK_API_KEY` is set. If the flight API or NOAA weather API is unavailable, the app falls back to local route data and route-based threat matching.

### GitHub Pages Static Site

The `docs/` folder contains a static GitHub Pages version that runs without FastAPI.

The public URL is: [https://outinletter.github.io/pilotbriefing/](https://outinletter.github.io/pilotbriefing/)

---
PilotMetrics — Turning Aviation Data into Operational Awareness.
