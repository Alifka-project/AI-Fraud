# Testing Checklist — InvestorShield UAE

Run through this before any submission or demo. Roughly 15 minutes if everything works.

---

## 1. Frontend smoke

- [ ] `npm install` completes without errors.
- [ ] `npm run dev` boots and `/` renders the landing page with the navy hero.
- [ ] The Navbar shows: Home, Upload, Dashboard, Report, Methodology, Start Analysis.
- [ ] Landing page sections render: Features, Workflow, Trust strip, Final CTA.
- [ ] Footer disclaimer is visible.

## 2. Sample-company flow (no ML service)

- [ ] `/upload` shows all five sample companies in the right panel.
- [ ] Click **Stellar Logistics LLC** — three years of data appear in the parsed-financial table.
- [ ] Click **Run AI risk analysis** — page transitions to `/dashboard`.
- [ ] Dashboard renders without errors:
  - [ ] Risk gauge shows a number ≤ 30, badge says **LOW**.
  - [ ] Six component scores visible.
  - [ ] Three charts render (revenue trio, balance sheet, receivables/debt/cash).
  - [ ] Ratio table populated with healthy / watch / concern badges.
  - [ ] Feature importance chart renders (teal/red bars).
  - [ ] At least one rule-based AI summary line appears.
- [ ] Click **View report** — letterhead page renders with PDF download button.

## 3. Critical-risk path

- [ ] On `/upload`, click **Mirage Capital Holdings**.
- [ ] Run analysis. Dashboard shows:
  - [ ] Score ≥ 75, badge **CRITICAL** (deep red).
  - [ ] At least 4 red flags listed.
  - [ ] Operating cash flow card highlighted red.
  - [ ] Feature importance chart shows revenue-vs-OCF or receivables-vs-revenue as a top driver.

## 4. CSV upload

- [ ] On `/upload`, click **Download template** — `investorshield-sample-template.csv` saves.
- [ ] Open the CSV, leave it unchanged, and re-upload it via **Choose file**.
- [ ] Parsing succeeds and the table shows three years.
- [ ] Fill in a company name and run analysis.

## 5. PDF report

- [ ] On `/report`, click **Download PDF**.
- [ ] PDF opens. Verify:
  - [ ] Header bar with navy background and the score badge.
  - [ ] Company profile table.
  - [ ] Risk score breakdown table with all six components and overall row.
  - [ ] Key financial ratios table.
  - [ ] Financial history table.
  - [ ] Red flags table (or "No red flags" line).
  - [ ] AI due-diligence summary block.
  - [ ] Recommended follow-up documents list.
  - [ ] Disclaimer block at the bottom.
  - [ ] Page footer "InvestorShield UAE · Page N of M" on every page.

## 6. ML service smoke

- [ ] `cd ml-service && pip install -r requirements.txt` succeeds.
- [ ] `uvicorn app.main:app --reload --port 8000` boots.
- [ ] `curl http://localhost:8000/health` returns `{"status": "ok", ...}`.
- [ ] `curl http://localhost:8000/docs` returns Swagger HTML.
- [ ] In another terminal, hit the frontend `/api/health` — it returns `mlService: "ok"`.

## 7. ML service integration

- [ ] With ML service running, pick **Palm Crest Properties LLC** sample and run analysis.
- [ ] Dashboard shows a model info pill that does **not** contain "(no trained model)" — when models are trained.
- [ ] Without trained models, the pill says `Heuristic logistic (no trained model)` — still expected.

## 8. Training scripts

- [ ] `python -m scripts.generate_sample_data --rows 200 --out data/test.csv` writes a CSV.
- [ ] `python -m scripts.train_model --data data/test.csv` finishes and prints ROC-AUC numbers.
- [ ] `ml-service/models/fraud_model.joblib` exists.
- [ ] `python -m scripts.anomaly_model --data data/test.csv` finishes.
- [ ] `ml-service/models/anomaly_model.joblib` exists.
- [ ] Restart the ML service. Run an analysis from the frontend. The classifier pill on the dashboard should now show `XGBoost` (or `Random Forest`).

## 9. LLM integration (optional)

- [ ] Export `OPENAI_API_KEY=sk-...` and restart the ML service.
- [ ] Run an analysis from the frontend.
- [ ] AI summary card on the dashboard shows the LLM-generated narrative.
- [ ] Model info pill reads `OpenAI-compatible API (gpt-4o-mini)`.

## 10. Type safety / build

- [ ] `npm run build` finishes with zero TypeScript errors.
- [ ] `npm start` boots a production build at `http://localhost:3000`.

## 11. Methodology + accessibility

- [ ] `/methodology` page renders with all four pipeline cards, six-component scoring grid, ratio engine breakdown, ML/Anomaly/LLM cards, red-flag rules grid, limitations grid.
- [ ] Tab through `/upload` — all inputs reachable by keyboard.
- [ ] Screen-reader labels on buttons (icons have visible text labels).

## 12. Cleanup

- [ ] No console errors in browser DevTools across the five pages.
- [ ] `npm run lint` reports no errors (warnings acceptable).
