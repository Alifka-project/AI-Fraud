# Deployment Guide — InvestorShield UAE

This guide walks through deploying the two halves of InvestorShield UAE:

1. The **Next.js frontend + API routes** on Vercel.
2. The **Python FastAPI ML microservice** on Render, Railway, Fly.io, or Azure App Service.

Both halves can be deployed independently — the frontend falls back to the in-process TypeScript engine if the Python service is unreachable, so you can ship the frontend first and add the ML service later.

---

## 1. Deploy the Next.js frontend on Vercel

### 1.1 Prepare the repo

```bash
git init
git add .
git commit -m "Initial InvestorShield UAE commit"
```

Push to a GitHub/GitLab/Bitbucket repo.

### 1.2 Choose a database

- **Demo:** keep `DATABASE_URL=file:./dev.db`. Vercel won&apos;t persist this between builds, so any DB writes from the demo will reset on each deploy — fine for a presentation.
- **Production:** create a Postgres database (Vercel Postgres, Neon, Supabase, or Render Postgres) and copy the connection string. Then in `prisma/schema.prisma`, change:

  ```prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  ```

### 1.3 Import on Vercel

1. Go to https://vercel.com/new and import the repo.
2. Framework Preset: **Next.js** (auto-detected).
3. Build & Output: defaults are fine.
4. Environment variables:
   - `DATABASE_URL` → either SQLite path or Postgres URL.
   - `ML_SERVICE_URL` → the public URL of the Python service (set after step 2 below if it doesn&apos;t exist yet).
   - `OPENAI_API_KEY` → optional.
   - `OPENAI_MODEL` → optional, e.g. `gpt-4o-mini`.
5. Click **Deploy**.

After the first deploy, run a one-off Prisma push from a local machine that has the production `DATABASE_URL` exported:

```bash
DATABASE_URL=... npx prisma db push
```

---

## 2. Deploy the Python ML service

Pick whichever PaaS you prefer — the service is a plain `uvicorn` app reading from `ml-service/`.

### 2.1 Render (recommended for academic demos)

Create a `render.yaml` at repo root (optional, also configurable in the dashboard):

```yaml
services:
  - type: web
    name: investorshield-ml
    runtime: python
    rootDir: ml-service
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: OPENAI_MODEL
        value: gpt-4o-mini
```

Steps:

1. Push the repo to GitHub.
2. On https://dashboard.render.com → **New → Blueprint** (or **New → Web Service**).
3. Pick the repo, accept the Python detection.
4. Confirm the build command is `pip install -r requirements.txt` and the start command is `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Wait for first deploy. The service URL looks like `https://investorshield-ml.onrender.com`.
6. Copy that URL into the Vercel project as `ML_SERVICE_URL`.

> **Free-tier note:** Render free services cold-start after ~15 min of inactivity. Expect the first analysis after a quiet period to take ~30s while the dyno warms.

### 2.2 Railway

1. https://railway.app → New Project → Deploy from GitHub.
2. Set **Root Directory** to `ml-service`.
3. Add a **Service Variable** for `OPENAI_API_KEY`.
4. In settings, set **Start Command** to:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Generate a public domain → copy into Vercel as `ML_SERVICE_URL`.

### 2.3 Fly.io

```bash
cd ml-service
fly launch          # accept defaults, no DB
fly secrets set OPENAI_API_KEY=sk-...
fly deploy
```

Update Vercel `ML_SERVICE_URL` with the `https://<app>.fly.dev` URL.

### 2.4 Azure App Service

```bash
cd ml-service
az webapp up \
  --runtime "PYTHON:3.11" \
  --name investorshield-ml \
  --resource-group rg-investorshield \
  --location uaenorth
az webapp config appsettings set \
  --name investorshield-ml \
  --resource-group rg-investorshield \
  --settings OPENAI_API_KEY=sk-... \
             SCM_DO_BUILD_DURING_DEPLOYMENT=true
az webapp config set \
  --name investorshield-ml \
  --resource-group rg-investorshield \
  --startup-file "uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

### 2.5 Local-only demo

For an academic presentation, you can just run both servers on the presenter&apos;s laptop:

```bash
# Terminal 1
cd ml-service && source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2
npm run dev
```

---

## 3. Smoke test after deploy

Once both halves are live:

1. `curl https://<ml-service>/health` → should return `{ "status": "ok", ... }`.
2. Open `https://<frontend>/api/health` → should return `{ "app": "ok", "mlService": "ok", ... }`.
3. Open the frontend, pick a sample, run an analysis.
4. Look at the model info pills at the bottom of the dashboard:
   - `Classifier:` should NOT say "(no trained model)" if you uploaded model artefacts.
   - `LLM Provider:` should say "OpenAI-compatible API (...)" if you wired the key.

## 4. Optional: bundle trained models

The training scripts write `joblib` artefacts that are gitignored by default. To deploy with trained models:

```bash
# Locally
python -m scripts.generate_sample_data --rows 1500
python -m scripts.train_model
python -m scripts.anomaly_model

# Override .gitignore for the two files
git add -f ml-service/models/fraud_model.joblib ml-service/models/anomaly_model.joblib
git commit -m "Bundle trained model artefacts"
git push
```

Render / Railway / Fly will then ship them automatically.

## 5. Production hardening checklist

- [ ] Switch `DATABASE_URL` to a managed Postgres.
- [ ] Restrict the ML service CORS allow-list to your frontend domain.
- [ ] Add basic auth or a shared header between Next.js → FastAPI.
- [ ] Move `OPENAI_API_KEY` to a secret manager (Vercel Encrypted Env, Render Secrets, Doppler, AWS Secrets Manager).
- [ ] Add request logging on the FastAPI side (`uvicorn --access-log`).
- [ ] Add a paid LLM model only after costs and rate limits are estimated.
- [ ] Add observability (Sentry on the frontend, OpenTelemetry on the ML side).
