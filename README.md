# Disruption Desk

X-HEC Data & AI Lab, Day 2, team 12 ("Databricked"). A decision app for a fictionalized JetBlue flight-disruption case, built on synthetic data and hosted as a Databricks App (FastAPI serving a Vite + React build).

> Classroom project. Synthetic data on a fictionalized case. Not affiliated with or endorsed by JetBlue.

## The case

The VP of Customer Experience asks for a real-time operations dashboard; a vendor (Aero-Lytics) offers one that deploys quickly. Our diagnosis: the signals are late, revised and inconsistent at decision time, so a faster dashboard only shows wrong numbers sooner. The app fixes the signal first (point-in-time, keyed, unit-normalised, permitted), then predicts **next-hour disruption risk** per flight-hour so operations can act before the disruption.

- Target: `disruption_next_hour` (1 = disruption).
- Features: `x1` queue depth (flights), `x2` weather severity (0 to 1), `x3` turnaround buffer (minutes).
- Records: flight-hours keyed `segment:entity_id` (segment = region north / south / east / west), split by time into train, validation and blind.
- Champion: Logistic Regression, 0.917 validation balanced accuracy vs 0.500 for the dummy baseline.

## Who uses it

On first load the app asks **"Who are you working as?"** and shows that tenant's workspace. The choice is kept in `sessionStorage` (`jb-tenant`), so each new browser session asks again.

| Tenant | Pages | What it is for |
| --- | --- | --- |
| **Operations** (duty manager) | Ops desk (`/ops`) | Live "Next 30 minutes" console: ranked risk queue, search and filters, capacity, replay scrubber, per-row acknowledge, suggested action (a heuristic, not the model), flight-hour drawer with "what moves the risk" and what-if sliders, CSV export. Genie available as a bottom dock. |
| **CIO** | Ask Genie (`/ask`), Summary (`/cio`), Impact (`/impact`) | Money view: expected cost and value of acting per flight-hour and in total, scenario on editable assumptions, pilot gates, go / no-go decision. |
| **VP of Data** | Ask Genie (`/ask`), Data quality (`/repair`), Model evidence (`/models`) | Feed checks, funnel of kept vs quarantined records, lineage explorer for quarantined and repaired flight-hours, model registry (runs, ROC, calibration, coefficients). |

Every tenant also has a collapsed **Pilot file** group with MEDDPICC (`/meddpicc`) and the experiment contract (`/experiment`).

## Architecture

```
Databricks SQL ──scripts/pull.py──▶ data_raw/*.json ──scripts/build_data.py──▶ web/src/data/bundle.json
                                                                                   │
                                                          web/ (Vite + React) ─────┘
                                                                │ vite build
                                                                ▼
                                                    app/static/ ◀── app/app.py (FastAPI)
                                                                     ├─ GET  /api/health
                                                                     ├─ POST /api/score   (model.joblib)
                                                                     ├─ POST /api/genie   (Databricks Genie)
                                                                     └─ GET  /*           (SPA)
```

- **Frontend** (`web/`): React 19, TypeScript, React Router, Zustand, TanStack Table, react-markdown. Charts are hand-written SVG. All numbers come from `bundle.json` or are computed from it.
- **Scoring**: `web/src/lib/scoring.ts` scores in the browser from the champion's intercept, coefficients and scaler stored in the bundle, so the UI reacts instantly and works without the server. When `/api/health` answers, the topbar shows "Champion model online" and the Ops what-if panel also cross-checks against `/api/score`.
- **Backend** (`app/app.py`): serves the prebuilt SPA (hashed assets cached as immutable) and three API routes. `/api/score` accepts `{"rows":[{"x1":..,"x2":..,"x3":..}]}` (max 500 rows) and returns `{"p":[...]}`.
- **Genie**: `/api/genie` forwards the question to a Databricks Genie space using the signed-in user's token (`x-forwarded-access-token`). Since the shared space's instructions can't be edited, the server adds a table glossary, the app's "now" and the tenant's role to each question, and retries once if Genie answers without querying data. A profile switch starts a blank conversation.

## Data pipeline

The bundle is committed, so you only need this to refresh the data.

1. `scripts/pull.py` runs SQL through the Databricks CLI (`scripts/sql.py`, profile `DEFAULT`) against the team schema `xhec26.jetblue_d2_team_12` and the raw Day 2 schema, and writes `data_raw/*.json`. Training labels are pulled for the train split only; `resolved_outcome_hint` is never pulled.
2. `scripts/build_data.py` builds `web/src/data/bundle.json`. It refits the champion on the train split and **asserts** its validation and blind risks equal the logged MLflow risks (1e-9), refits the other candidates and checks their metrics against the logged comparison, and assembles the funnel, quality findings, lineage and raw-data measurements.

```bash
python3 scripts/pull.py
```

```bash
python3 scripts/build_data.py
```

## Repository layout

```
app/                 Databricks App: app.py, app.yaml, requirements.txt, model.joblib, static/ (build output, committed)
web/                 React app (src/views, src/components, src/lib, src/styles, src/data/bundle.json)
web/BRIEF.md         Build brief, pass by pass: case facts, design system and honesty rules
scripts/             Data pull and bundle build
data_raw/            Raw JSON pulled from Databricks
deploy.sh            Manual deploy with the Databricks CLI
.github/workflows/   CI deploy on push to main
```

## Run locally

Requires [Bun](https://bun.sh) and Python 3.

```bash
cd web && bun install
```

```bash
cd web && bun run dev
```

This serves the UI on http://localhost:5191 and proxies `/api` to `127.0.0.1:8765`. Without a backend the app still works and scores in the browser. To run the backend as well:

```bash
cd app && pip install -r requirements.txt && DATABRICKS_APP_PORT=8765 python app.py
```

`/api/genie` additionally needs Databricks credentials the SDK can find (for example a CLI profile) and access to the Genie space.

Typecheck and build (the build writes `app/static/`):

```bash
cd web && bun run build
```

## Deploy

**Automatic.** Every push to `main` runs `.github/workflows/deploy.yml`: install, `tsc --noEmit`, `vite build`, `databricks sync app` to `/Workspace/Shared/jetblue-decision-team12`, then `databricks apps deploy`. It needs the repo variable `DATABRICKS_HOST` and the repo secret `DATABRICKS_TOKEN`.

**Manual.** With Databricks CLI 0.250 or newer and a logged-in profile:

```bash
PROFILE=DEFAULT ./deploy.sh
```

It creates the app `jetblue-decision-team12` if needed, syncs and deploys `app/`, grants `CAN_USE` to all workspace users and prints the app URL. Build the web app first: the script stops if `app/static/index.html` is missing.

### Configuration

| Name | Where | Purpose |
| --- | --- | --- |
| `GENIE_SPACE_ID` | `app/app.yaml`, from the app resource `genie-space` | Genie space to query. Falls back to the default in `app.py`. |
| `DATABRICKS_APP_PORT` | set by Databricks Apps | Port for uvicorn (default 8000). |
| `DATABRICKS_HOST`, `DATABRICKS_TOKEN` | GitHub repo variable and secret | CI deploy. |

## Honesty rules

The jury checks these, and the app follows them:

- The model predicts next-hour disruption risk. It does not show that an intervention prevents a disruption. Every cost or "delays avoided" figure is a **Scenario** on editable assumptions (intervention $500, disruption $5,000, prevent rate 30% by default).
- Validation figures are the only performance figures. Blind outcomes are unknown and never shown as known.
- Customer numbers (10+ min latency, about 14 delays per week, 50% target) are tagged **From discovery**, not measured. They are kept separate from our measured late revisions (216 rows, median 24 h after decision time).
- `resolved_outcome_hint` is used only as a leakage test.

## Known limitations

- The Genie grounding in `app.py` fixes the app's "now" at 2026-09-03 08:49 UTC to match the blind window, and the money formula it gives Genie uses the default assumptions, not the values set in the UI.
- `model.joblib` and the MLflow run id are committed artifacts; no script in this repo regenerates them.
- `scripts/sql.py` hard-codes a SQL warehouse id and the `DEFAULT` CLI profile.
- `web/src/views/Diagnosis.tsx` is no longer routed (diagnosis moved to the slide deck).
