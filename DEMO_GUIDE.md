# Demo Guide — InvestorShield UAE

Use this script for live academic demonstrations. Total time: **~10 minutes**.

---

## 0. Pre-demo checklist (do this 5 minutes before)

```bash
# Terminal 1 — start the ML service
cd ml-service
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — start the frontend
npm run dev
```

Open browser tabs:

1. `http://localhost:3000` (Landing)
2. `http://localhost:8000/docs` (OpenAPI docs, optional for the technical audience)

Optionally export `OPENAI_API_KEY` in Terminal 1 to enable the real LLM summary.

---

## 1. The pitch (90 seconds)

> "UAE SMEs often pitch investors with self-reported financials. Even if those numbers are technically correct, they can hide manipulation patterns — revenue recognised before cash arrives, leverage spirals, receivables outpacing sales. InvestorShield UAE is an AI-powered platform that turns those statements into a transparent fraud-risk score in under a minute. The goal isn&apos;t to replace auditors; it&apos;s to give investors a defensible second opinion before they commit AED."

Show the landing page. Highlight the hero stats: 0–100 risk score, 4 tiers, 16+ ratios, 3 AI models.

---

## 2. Pick a low-risk sample (60 seconds)

Click **Start Company Risk Analysis** → on `/upload`, click **Stellar Logistics LLC** in the right-hand sample panel.

- The CSV/Excel preview table populates instantly with three years of statements.
- Click **Run AI risk analysis**.

On the dashboard:

- Risk gauge ≈ low double digits, **LOW RISK** badge.
- Component scores roughly: manipulation 15-25, liquidity 10-20, ML 10-25, anomaly 10-25.
- Few or no red flags.
- AI summary: "Earnings quality is healthy — operating cash flow comfortably exceeds reported net income…"

**Talking point:** "This is what a clean Jebel Ali freight forwarder looks like. Margins steady, OCF tracks net income, leverage conservative. Investors can move on with normal diligence."

---

## 3. Pick a critical-risk sample (90 seconds)

Click **New analysis** → pick **Mirage Capital Holdings** → run analysis.

- Risk gauge ≈ 80+ (Critical), red badge.
- Component breakdown: manipulation, ML, anomaly all in the red.
- 4–6 red flags ordered by severity.
- AI summary mentions positive net income + negative OCF + receivables explosion.

**Talking points:**

1. "Look at the revenue/cash chart — revenue tripled, but operating cash flow turned deeply negative. That single divergence is the canonical fraud red flag."
2. "Look at the receivables/debt/cash chart — receivables ballooned from AED 12M to AED 72M while cash collapsed."
3. "On the right, the feature importance chart shows the model agrees: revenue-vs-cash divergence and receivables-vs-revenue growth are the top contributors."
4. "And the LLM-generated due-diligence summary articulates exactly that, in language ready for an investment-committee memo."

---

## 4. Show the report and PDF (60 seconds)

Click **View report**.

- Investor-letterhead layout with company profile, score, ratios, red flags, AI summary, recommended follow-up documents, and the disclaimer.
- Click **Download PDF**. A multi-page PDF lands in the downloads folder.

**Talking point:** "This is what investors actually want to take to a committee. Not the dashboard — the PDF."

---

## 5. Show the methodology page (60 seconds)

Click **Methodology** in the nav.

- Walk through the four-step pipeline.
- Walk through the six-component scoring breakdown — emphasise that none of the weights are hidden.
- Read out one or two of the red-flag rules so the audience sees how forensic accounting heuristics are baked in alongside ML.

**Talking point:** "This is deliberately *not* a black-box scoring model. Every weight, every ratio, every red-flag rule is documented. That&apos;s a hard requirement for the kind of investor who would actually use this."

---

## 6. (Optional) Upload your own CSV (90 seconds)

If the audience is technical:

1. Back to `/upload` → click **Download template** → opens a CSV with the headers.
2. Edit a row to make revenue spike while OCF collapses.
3. Re-upload → analysis runs → dashboard reflects the change.

Or open `http://localhost:8000/docs`, hit `/analyze` with a hand-crafted JSON payload via "Try it out", and watch the same dashboard repopulate.

---

## 7. Honest limitations (30 seconds)

Always close on this:

> "The classifier is trained on synthetic data, the Beneish/Altman variants are proxies, and the LLM summary is informational. Production deployment would require audited training data and a partnership with a UAE registry. That&apos;s explicitly called out in the report disclaimer — the platform never claims a company is fraudulent."

---

## 8. Questions

Common ones and how to answer:

| Q                                                            | A                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What if the ML service goes down?                            | The Next.js app ships with a TypeScript fallback engine implementing the same scoring philosophy. The demo continues to work — just without XGBoost/Isolation Forest models. |
| How was the model trained?                                   | Synthetic dataset (`scripts/generate_sample_data.py`) of ~1500 Dubai SMEs with injected manipulation patterns. Logistic Regression, Random Forest, and XGBoost are benchmarked; the best ROC-AUC wins. |
| What about regulatory compliance?                            | The platform is positioned as AI-assisted due diligence; the disclaimer is on every report and dashboard, and there is no language that constitutes a legal fraud determination. |
| Could this work without an internet connection?              | Yes — without `OPENAI_API_KEY`, the LLM summary is generated by a deterministic rule-based template. The ML service runs entirely on-device once trained.                      |
| What happens if a column is missing from the upload?         | The CSV parser warns the user, defaults the missing field to zero, and the engine raises a `MISSING_FIELDS` red flag.                                                          |
