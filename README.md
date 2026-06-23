# InvestorShield UAE

**AI-Powered Financial Statement Fraud Detection and Company Scam-Risk Assessment Platform for Dubai Investors.**

InvestorShield UAE is an academic, production-ready MVP that lets investors, lenders, and procurement teams upload a company&apos;s financial statements and receive an explainable fraud-risk assessment. It blends a Next.js dashboard, a Python FastAPI ML microservice, an XGBoost classifier, an Isolation Forest anomaly detector, a rule-based forensic engine, and an LLM-or-rule-based due-diligence summary into a single end-to-end product.

> **Academic disclaimer.** Risk scores produced by this platform are statistical and do **not** represent a legal determination of fraud. Findings must be validated against audited statements, bank records, and regulatory filings.

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Quick start](#quick-start)
5. [Running the frontend](#running-the-frontend)
6. [Running the ML service](#running-the-ml-service)
7. [Training the models](#training-the-models)
8. [Generating sample data](#generating-sample-data)
9. [Environment variables](#environment-variables)
10. [Deployment](#deployment)
11. [Demo guide](#demo-guide)
12. [Testing checklist](#testing-checklist)
13. [Known limitations](#known-limitations)

---

## Features

- **PDF / Excel / CSV upload** — drop a PDF financial statement and the platform extracts the figures automatically (AI-powered with a rule-based fallback), then lets you review and correct them in an editable table before analysis. Excel and CSV are parsed in-process (Node), so it all works on Vercel without the Python service.
- **Real multi-page filings** — the parser targets the income statement, balance sheet, and cash-flow statement inside long documents (e.g. a 28-page SEC 10-Q), handles "in millions/thousands" scaling, multi-column reporting periods, and auto-detects the reporting currency (USD/AED/EUR/…). Validated end-to-end on a real Apple Inc. 10-Q (extracts revenue, net income, OCF, assets, equity, debt to the exact figure).
- **Recursive Language Model (RLM)** — instead of truncating a long filing, the platform *recursively decomposes* it into sections (Notes, MD&A, Risk Factors, Legal Proceedings), analyses each leaf (recursing further when a section is too big), and recursively *reduces* the partial findings into one due-diligence synthesis. It surfaces qualitative red flags the numbers can't show — going concern, restatements, related-party dealings, covenant breaches, auditor changes, material litigation — and folds them into the document-risk component and overall score. Works with an OpenAI-compatible model **or** a deterministic forensic analyzer (no key needed); the recursion trace is shown on the dashboard for full explainability. See [`src/lib/rlm.ts`](src/lib/rlm.ts).
- **End-to-end pipeline** — upload PDF/CSV/Excel → extract → verify → ratios → ML signals → red flags → dashboard → PDF report.
- **0–100 risk score** mapped to four tiers: Low, Medium, High, Critical.
- **16+ forensic ratios** with Beneish-style and Altman-style indicators.
- **XGBoost classifier** with Logistic Regression and Random Forest baselines.
- **Isolation Forest anomaly detector** for unsupervised outlier detection.
- **SHAP feature importance** when the SHAP library is present, with a deterministic fallback.
- **LLM due-diligence summary** via any OpenAI-compatible endpoint, with a rule-based fallback so the demo always works.
- **Investor-ready PDF report** generated client-side with jsPDF.
- **Five pre-loaded Dubai SME samples** spanning logistics, trading, real estate, fintech, and investment holding profiles.
- **Graceful degradation** — the Next.js app ships with a TypeScript fallback engine that mirrors the Python scoring so the UI works even without the ML service running.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Next.js 14 (App Router) — Vercel-ready                                         │
│ ┌──────────────────────────────┐                                              │
│ │ Pages: /, /upload, /dashboard │ ──► /api/analyze ─┐                          │
│ │ /report, /methodology         │     /api/upload   │  HTTP                    │
│ └──────────────────────────────┘     /api/report   │                          │
│                                                    ▼                          │
│ src/lib/fallback-engine.ts (TS) ◄── when ML service is unreachable             │
└────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI ML microservice (Python 3.11)                                          │
│ ┌─────────────────────────────────────────────────────────────────────────┐    │
│ │ /analyze · /upload-analyze · /health · /generate-report                  │    │
│ ├─────────────────────────────────────────────────────────────────────────┤    │
│ │ feature_engine.py · red_flags.py · scoring.py · llm.py · inference.py    │    │
│ ├─────────────────────────────────────────────────────────────────────────┤    │
│ │ XGBoost classifier · Isolation Forest · SHAP · OpenAI-compatible LLM      │    │
│ └─────────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                                       OpenAI-compatible LLM (optional)
```

## Project structure

```
.
├── prisma/                  # Prisma schema for UserAnalysis, UploadedCompany, …
├── public/                  # Static assets
├── src/
│   ├── app/                 # Next.js App Router pages (/, /upload, /dashboard, /report, /methodology)
│   ├── app/api/             # Next.js API routes (/api/analyze, /api/upload, /api/report, /api/health)
│   ├── components/          # shadcn-style UI + dashboard widgets
│   └── lib/                 # types, csv-parser, fallback-engine, ml-client, pdf-report, samples
├── ml-service/
│   ├── app/                 # FastAPI app + feature engine + scoring + LLM + inference
│   ├── scripts/             # generate_sample_data, train_model, anomaly_model, inference CLI
│   ├── data/                # generated datasets (gitignored)
│   ├── models/              # trained joblib artefacts (gitignored)
│   └── requirements.txt
├── .env.example
├── package.json
├── tailwind.config.ts
└── README.md
```

## Quick start

```bash
# 1. Clone & install Next.js dependencies
npm install                  # runs `prisma generate` automatically

# 2. Copy environment file (all values are optional for the MVP)
cp .env.example .env

# 3. Start the Next.js frontend (works alone via the TypeScript fallback engine)
npm run dev
# → http://localhost:3000
```

> **DB note:** the MVP runs statelessly via API routes + `localStorage`, so the
> database is optional. Prisma models are scaffolded for the next phase. To
> enable persistence later, set `DATABASE_URL` to a Postgres URL (or switch the
> `provider` to `sqlite` in `prisma/schema.prisma` and use `file:./dev.db`) and
> run `npx prisma db push`.

Pick a sample company on `/upload`, click **Run AI risk analysis**, and the dashboard renders.

To enable the real Python ML pipeline, run the ML service in another terminal:

```bash
cd ml-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/health
```

The Next.js frontend will automatically use the Python service when it&apos;s reachable, and silently fall back to the in-process TypeScript engine when it is not.

## Running the frontend

```bash
npm install
npm run dev                 # development with hot-reload
npm run build && npm start  # production build
```

> **Local build on a synced folder (iCloud/Dropbox/OneDrive):** file-sync daemons
> can race with Next.js's many small build writes and cause intermittent
> `ENOENT … _ssgManifest.js` / `pages-manifest.json` errors. This only affects
> local builds in a synced directory — **Vercel is unaffected**. Work around it by
> writing the build output outside the synced folder:
> ```bash
> NEXT_DIST_DIR=/tmp/ishield_next npm run build
> NEXT_DIST_DIR=/tmp/ishield_next npm start
> ```
> (`next dev` is not affected.)

Frontend env vars (see `.env.example`):
- `DATABASE_URL` (defaults to `file:./dev.db` SQLite)
- `ML_SERVICE_URL` (defaults to `http://localhost:8000`)
- `OPENAI_API_KEY` (optional)

## Running the ML service

```bash
cd ml-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Endpoints:

| Method | Path                | Description                                                   |
| ------ | ------------------- | ------------------------------------------------------------- |
| GET    | `/health`           | Service + OpenAI-key status                                   |
| POST   | `/analyze`          | Accepts JSON `AnalysisRequest`, returns the full assessment   |
| POST   | `/upload-analyze`   | Accepts `multipart/form-data` with a CSV/Excel + company JSON |
| POST   | `/generate-report`  | Normalised PDF-ready JSON payload                             |

OpenAPI docs: `http://localhost:8000/docs`

## Training the models

The repository ships **without** model artefacts; the Python service falls back to deterministic heuristics until you train one. Two-step process:

```bash
cd ml-service
source venv/bin/activate

# 1. Generate 1,500 synthetic Dubai SMEs (mix of normal + manipulation patterns)
python -m scripts.generate_sample_data --rows 1500

# 2. Train Logistic Regression + Random Forest + XGBoost, save the best by ROC-AUC
python -m scripts.train_model

# 3. Train the Isolation Forest anomaly detector
python -m scripts.anomaly_model
```

Both saves land in `ml-service/models/`. Restart the FastAPI service to pick them up.

## Generating sample data

`generate_sample_data.py` writes a CSV with one row per company-year, including a `label` column (`1` = injected manipulation pattern, `0` = healthy). Patterns include revenue/cash divergence, positive net income with negative OCF, exploding receivables, and leverage spirals.

```bash
python -m scripts.generate_sample_data --rows 800 --out data/sample_companies.csv
```

## Environment variables

All env vars are **optional** — the platform works out of the box with the
TypeScript fallback engine and a rule-based summary.

| Variable             | Required | Description                                                          |
| -------------------- | -------- | -------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | No       | Enables the real LLM due-diligence summary.                          |
| `OPENAI_MODEL`       | No       | Defaults to `gpt-4o-mini`.                                           |
| `OPENAI_BASE_URL`    | No       | Custom OpenAI-compatible endpoint (Azure, Together, Groq, …).        |
| `ML_SERVICE_URL`     | No       | Deployed Python ML service URL. If unset, TS fallback engine is used.|
| `DATABASE_URL`       | No       | Optional Postgres URL for future persistence (MVP runs stateless).   |
| `NEXT_PUBLIC_APP_URL`| No       | Public URL for absolute links.                                       |

## Deployment

### Frontend on Vercel (single-click)

1. Push the repo to GitHub.
2. In Vercel: **Add New → Project → Import from your GitHub repo**.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: `npm run build` (already the default).
5. Add environment variables (Project Settings → Environment Variables):
   - **`OPENAI_API_KEY`** → your `sk-...` key (enables LLM summaries).
   - `OPENAI_MODEL` → e.g. `gpt-4o-mini` (optional).
   - `ML_SERVICE_URL` → public URL of your Python service, if deployed.
   - `DATABASE_URL` → only if you wire up Prisma queries later.
6. Click **Deploy**. First build takes ~90 seconds.

Vercel will use the `vercel.json` already in the repo to set per-function
timeouts (analyze/upload: 30s, report: 15s, health: 10s).
4. Deploy.

### Python ML service on Render / Railway / Fly / Azure App Service

A minimal Render `web service` config:

```yaml
services:
  - type: web
    name: investorshield-ml
    runtime: python
    rootDir: ml-service
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: OPENAI_API_KEY
        sync: false
```

Same idea on Railway / Fly: point the start command at `uvicorn app.main:app --host 0.0.0.0 --port $PORT` and mount `ml-service/` as the working directory.

### Self-hosted

```bash
docker run --rm -p 8000:8000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -v $(pwd)/ml-service:/app -w /app \
  python:3.11-slim sh -c "pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

## Demo guide

1. Start both servers (`npm run dev` and `uvicorn app.main:app --reload`).
2. Open `http://localhost:3000`.
3. On the landing page, click **Start Company Risk Analysis**.
4. On `/upload`, click any of the five quick-start sample companies — e.g. **Mirage Capital Holdings** (Critical).
5. Click **Run AI risk analysis**. The dashboard opens.
6. Walk through:
   - Risk score gauge + risk badge
   - Component scores breakdown (manipulation / liquidity / ML / anomaly / document / external)
   - Latest revenue, net income, OCF, total assets cards
   - Three charts: revenue trio, balance sheet, receivables/debt/cash
   - Ratio table with healthy / watch / concern tags
   - SHAP-style feature importance bar chart (red = increases risk, teal = decreases)
   - Red-flag list, sorted by severity
   - AI due-diligence summary (LLM or rule-based fallback)
7. Click **View report** → walk through the printable layout.
8. Click **Download PDF**. The investor-ready PDF lands in the user&apos;s downloads.
9. (Optional) Upload your own CSV using the **Download template** button on `/upload`.

## Testing checklist

- [ ] `npm install` completes without errors.
- [ ] `npm run dev` boots and `/` renders.
- [ ] Pick the **Stellar Logistics** sample → dashboard shows `LOW` risk badge.
- [ ] Pick the **Mirage Capital** sample → dashboard shows `CRITICAL` risk badge and at least 4 red flags.
- [ ] Download the sample CSV template, upload it as-is → dashboard renders without errors.
- [ ] Visit `/report` after an analysis → PDF download produces a multi-page document.
- [ ] Stop the ML service → analysis still works via the TypeScript fallback engine (banner is not shown but the dashboard renders).
- [ ] Start the ML service, set `OPENAI_API_KEY` → `LLM Provider` in the dashboard footer reads `OpenAI-compatible API (...)`.
- [ ] `python -m scripts.generate_sample_data --rows 200` writes a CSV.
- [ ] `python -m scripts.train_model` saves `models/fraud_model.joblib` and prints ROC-AUC > 0.85.
- [ ] `python -m scripts.anomaly_model` saves `models/anomaly_model.joblib`.
- [ ] `curl localhost:8000/health` returns JSON.

## Known limitations

- The classifier is trained on **synthetic** Dubai SME data — not real audited filings.
- Beneish M-Score and Altman Z-Score use private-firm **proxy** formulas.
- PDF extraction reads **text-based** PDFs (digital statements). Scanned/image-only PDFs need OCR, which is not enabled in this MVP — upload those as CSV/Excel, or use a text PDF. Always review the extracted figures in the editable table before analysis.
- External verification (trade-licence, KYB, registry lookups) is a placeholder weight.
- The LLM summary depends on the configured model — a thin OpenAI-compatible HTTP call is used to keep the dependency surface small.
- The dashboard stores the latest analysis in `localStorage` so it survives page refreshes; there is no multi-session history UI in the MVP.

## Academic disclaimer

This software is an academic project. It is provided strictly for educational, research, and demonstration purposes. The risk scores, red flags, and AI-generated narratives are statistical outputs from machine-learning and rule-based models, and **do not represent a legal determination of fraud** or financial advice. Independent professional due diligence — including audited statements, regulatory filings, and qualified legal counsel — is required before acting on any output produced by InvestorShield UAE.
