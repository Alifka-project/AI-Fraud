import Link from "next/link";
import {
  Calculator,
  Brain,
  Activity,
  Sparkles,
  ChartBar,
  Shield,
  CheckCircle2,
  Layers,
  Workflow,
  ArrowRight,
} from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How InvestorShield UAE scores fraud risk: financial ratio engine, Beneish M-Score, Altman Z-Score, XGBoost, Isolation Forest, SHAP, and LLM review.",
};

export default function MethodologyPage() {
  return (
    <div>
      {/* Hero */}
      <section className="gradient-navy text-white py-16">
        <div className="container">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-widest text-teal-200 font-semibold">
              Methodology
            </p>
            <h1 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">
              How InvestorShield UAE arrives at a risk score.
            </h1>
            <p className="mt-4 text-navy-50/90 text-lg leading-relaxed">
              Six signals — three of them learned by AI, three rule-based — are computed
              independently, then weighted into a transparent 0–100 score. Every feature
              contribution is exposed in the dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="container py-16">
        <SectionHeading
          eyebrow="End-to-end pipeline"
          title="From uploaded statement to investor-ready report."
        />
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: "1",
              icon: Layers,
              title: "Extract",
              body: "PDF (AI + rule-based), Excel, or CSV → normalised annual records (revenue, NI, assets, liabilities, equity, OCF, receivables, debt, COGS, expenses), reviewed in an editable table.",
            },
            {
              step: "2",
              icon: Calculator,
              title: "Feature engine",
              body: "16+ ratios computed in Python (or TypeScript fallback): margins, leverage, growth divergence, Beneish & Altman proxies.",
            },
            {
              step: "3",
              icon: Brain,
              title: "AI signals",
              body: "XGBoost fraud probability, Isolation Forest anomaly score, LLM document consistency review (or rule-based fallback).",
            },
            {
              step: "4",
              icon: ChartBar,
              title: "Score & report",
              body: "Weighted score → 0–100 risk score, level, red flags, SHAP-style explainability, downloadable PDF.",
            },
          ].map((s) => (
            <Card key={s.step}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy-900 text-white text-sm font-bold">
                    {s.step}
                  </span>
                  <s.icon className="h-5 w-5 text-teal-600" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-navy-900">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Scoring breakdown */}
      <section className="bg-navy-50/60 py-16">
        <div className="container">
          <SectionHeading
            eyebrow="Scoring engine"
            title="Six signals, six weights, one transparent number."
            description="Each component is computed independently and clamped to 0–100, then combined into the overall risk score using the weights below. None of the inputs are hidden — the dashboard exposes every contribution."
          />
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            {[
              {
                weight: "30%",
                title: "Statement manipulation",
                desc: "Beneish-style M-score proxy + accruals quality + revenue/cash divergence + receivables-vs-revenue growth.",
              },
              {
                weight: "20%",
                title: "Cash flow & liquidity",
                desc: "Current ratio, debt-to-equity, OCF coverage of net income, Altman Z-score (private-firm variant).",
              },
              {
                weight: "20%",
                title: "ML fraud probability",
                desc: "Gradient-boosted classifier (XGBoost) trained on synthetic Dubai SMEs labelled normal vs manipulation-suspect.",
              },
              {
                weight: "10%",
                title: "Anomaly detection",
                desc: "Unsupervised Isolation Forest catches companies whose ratios don't fit any familiar profile, with or without labels.",
              },
              {
                weight: "15%",
                title: "Document consistency",
                desc: "LLM/rule-based review of statement narrative vs numeric reality — flags inconsistencies and missing key fields.",
              },
              {
                weight: "5%",
                title: "External verification",
                desc: "Placeholder for trade-licence, KYB, and registry checks. Keeps a small slot reserved for the next development phase.",
              },
            ].map((c) => (
              <Card key={c.title}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-navy-900">{c.title}</h3>
                    <span className="rounded-full bg-teal-50 text-teal-700 text-xs font-bold px-2 py-0.5">
                      {c.weight}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Risk thresholds</CardTitle>
              <CardDescription>How the overall score maps to a risk level.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-4 gap-3 text-sm">
                <Threshold label="LOW" range="0 – 30" color="bg-emerald-500" />
                <Threshold label="MEDIUM" range="31 – 60" color="bg-amber-500" />
                <Threshold label="HIGH" range="61 – 80" color="bg-orange-500" />
                <Threshold label="CRITICAL" range="81 – 100" color="bg-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Detailed methodology cards */}
      <section className="container py-16">
        <SectionHeading
          eyebrow="Under the hood"
          title="Inside each AI component."
        />
        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-teal-600" />
                Financial ratio engine
              </CardTitle>
              <CardDescription>
                Pandas/NumPy module that produces a normalised feature vector per company-year.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {[
                  "Growth metrics: revenue, net income, operating cash flow, receivables, assets.",
                  "Profitability: net margin, gross margin, ROA, ROE.",
                  "Liquidity & leverage: current ratio, debt/equity, leverage ratio, OCF coverage.",
                  "Efficiency: asset turnover, receivables/revenue, working capital proxy.",
                  "Forensic indicators: Beneish-style M-score proxy, Altman Z-score (private-firm), cash-flow quality index.",
                  "Divergence flags: revenue growth minus OCF growth, receivables growth minus revenue growth.",
                ].map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                    <span className="text-navy-900">{p}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-teal-600" />
                ML fraud classifier
              </CardTitle>
              <CardDescription>
                Trained in <code>ml-service/train_model.py</code>. Saved to{" "}
                <code>models/fraud_model.joblib</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Baseline:</strong> Logistic Regression to anchor the metric, with class balancing.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Tree ensemble:</strong> Random Forest with stratified sampling.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Production:</strong> XGBoost gradient boosting — chosen for highest ROC-AUC.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Evaluation:</strong> accuracy, precision, recall, F1-score, ROC-AUC reported during training.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span><strong>Explainability:</strong> SHAP values when the <code>shap</code> library is installed, otherwise built-in feature importances.</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-teal-600" />
                Anomaly detector
              </CardTitle>
              <CardDescription>
                <code>ml-service/anomaly_model.py</code> trains an Isolation Forest on the normal
                population.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Useful when no clean fraud labels exist. The detector learns the &quot;shape&quot;
                of healthy Dubai SMEs across margins, leverage, and cash-flow indicators, then
                returns an anomaly score for any new company. The score is rescaled into 0–100
                where higher means more atypical.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600" />
                LLM consistency review
              </CardTitle>
              <CardDescription>
                Uses an OpenAI-compatible API when <code>OPENAI_API_KEY</code> is set; falls back
                to a rule-based template otherwise.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The LLM is prompted with the computed ratios, top features, and detected red
                flags, and asked to produce an investor-grade narrative summary. The fallback
                generator builds the same structure using the most concerning indicators so the
                demo works without internet access.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-teal-600" />
                Red-flag rules
              </CardTitle>
              <CardDescription>
                A small library of forensic rules runs alongside the ML signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {[
                  "Revenue increases while operating cash flow drops",
                  "Net income positive but operating cash flow negative",
                  "Receivables grow faster than revenue",
                  "Debt-to-equity unusually high (> 2.5×)",
                  "Current ratio below 1",
                  "Net profit margin moves abnormally year-over-year",
                  "Total assets grow faster than revenue",
                  "OCF/Net income below 0.5 with positive margin",
                  "Altman Z-score in the distress zone",
                  "Beneish M-score proxy above -1.78",
                  "Key financial fields missing",
                  "Earnings claim out of step with cash reality",
                ].map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                    <span className="text-navy-900">{p}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Limitations */}
      <section className="bg-navy-50/60 py-16">
        <div className="container">
          <SectionHeading
            eyebrow="Honesty section"
            title="Known limitations."
            description="The MVP is built for academic demonstration. The following constraints are documented in the README and presented to investors as part of the report."
          />
          <div className="mt-10 grid md:grid-cols-2 gap-4 text-sm">
            {[
              "ML model is trained on synthetically generated Dubai SME profiles, not real audited data.",
              "Beneish M-score and Altman Z-score use proxy formulas — public-firm variables are partially substituted with private-firm equivalents.",
              "PDF ingestion reads text-based statements (AI extraction with a rule-based fallback); scanned image-only PDFs require OCR, which is not yet enabled — use CSV/Excel for those.",
              "LLM narrative depends on prompt and model quality; the rule-based fallback ensures the demo works offline.",
              "External verification (trade licence, KYB) is currently a placeholder weight — integrations are out of scope for the MVP.",
              "Risk score is informational; it must not be used as the sole input to any investment, lending, or procurement decision.",
            ].map((l) => (
              <div
                key={l}
                className="flex gap-2 rounded-lg border border-navy-100 bg-white p-3"
              >
                <Shield className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                <p className="text-navy-900">{l}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg" variant="primary">
              <Link href="/upload">
                Try the platform <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Threshold({ label, range, color }: { label: string; range: string; color: string }) {
  return (
    <div className="rounded-lg border border-navy-100 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${color}`} />
        <span className="text-sm font-semibold text-navy-900">{label}</span>
      </div>
      <p className="mt-2 font-mono text-lg text-navy-900">{range}</p>
    </div>
  );
}
