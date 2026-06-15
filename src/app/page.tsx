import Link from "next/link";
import {
  Shield,
  ChartBar,
  FileSearch,
  Brain,
  AlertTriangle,
  FileText,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  Lock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/site/section-heading";

const FEATURES = [
  {
    icon: Brain,
    title: "ML Fraud Detection",
    description:
      "XGBoost classifier trained on Beneish/Altman-inspired features identifies statement-manipulation patterns.",
  },
  {
    icon: AlertTriangle,
    title: "Anomaly Detection",
    description:
      "Isolation Forest catches abnormal financial behaviour even when no labelled fraud exists.",
  },
  {
    icon: FileSearch,
    title: "Forensic Ratios",
    description:
      "16+ ratios — margins, leverage, cash-flow quality, receivables-to-revenue, growth divergence.",
  },
  {
    icon: ChartBar,
    title: "Explainable AI",
    description:
      "Per-feature importance with SHAP-style attributions so investors understand why a score is high.",
  },
  {
    icon: Sparkles,
    title: "LLM Due-Diligence",
    description:
      "AI-generated executive narrative summarising red flags and recommended follow-up documents.",
  },
  {
    icon: FileText,
    title: "Investor-Ready Reports",
    description:
      "Downloadable PDF due-diligence report with company profile, score, red flags, and disclaimer.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Upload financials",
    description:
      "CSV or Excel of revenue, net income, assets, liabilities, equity, cash flow, receivables, and debt.",
  },
  {
    step: "02",
    title: "AI risk engine runs",
    description:
      "16 ratios → XGBoost fraud probability + Isolation Forest anomaly score + LLM consistency check.",
  },
  {
    step: "03",
    title: "Dashboard + PDF report",
    description:
      "Risk score, red flags, charts, explainability, due-diligence checklist — ready for the investment committee.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-navy opacity-95" aria-hidden />
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,rgba(45,212,191,0.4),transparent_40%),radial-gradient(circle_at_70%_80%,rgba(14,165,233,0.3),transparent_50%)]" aria-hidden />
        <div className="container relative py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Lock className="h-3.5 w-3.5" />
              AI-assisted due diligence · Dubai, UAE
            </div>
            <h1 className="mt-6 text-4xl md:text-6xl font-bold tracking-tight text-white">
              Stop investing in numbers you can&apos;t verify.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-navy-50/90 leading-relaxed">
              InvestorShield UAE turns a company&apos;s financial statements into a transparent
              fraud-risk score — combining machine learning, forensic accounting ratios, and an
              LLM consistency review — so investors, lenders, and procurement teams in Dubai can
              make confident go/no-go decisions in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" variant="secondary" className="bg-teal-500 hover:bg-teal-600">
                <Link href="/upload">
                  Start Company Risk Analysis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/methodology">How it works</Link>
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-white/90">
              <Stat value="0–100" label="Risk score range" />
              <Stat value="4" label="Risk tiers" />
              <Stat value="16+" label="Forensic ratios" />
              <Stat value="3" label="AI models in pipeline" />
            </div>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="container py-20">
        <SectionHeading
          centered
          eyebrow="Capabilities"
          title="A complete fraud-risk pipeline, not just a chart."
          description="Each analysis blends three independent AI signals with rule-based forensic accounting indicators, then explains every contribution to the final score."
        />

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="group hover:shadow-elevated transition-shadow">
              <CardContent className="p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-navy-900 to-teal-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-navy-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-navy-50/60 py-20">
        <div className="container">
          <SectionHeading
            centered
            eyebrow="Workflow"
            title="From financial statement to decision in three steps."
          />
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map(({ step, title, description }) => (
              <Card key={step} className="relative overflow-hidden">
                <div className="absolute -top-6 -right-6 text-7xl font-black text-navy-50">
                  {step}
                </div>
                <CardContent className="relative p-8">
                  <h3 className="text-xl font-bold text-navy-900">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <SectionHeading
              eyebrow="Why InvestorShield"
              title="Built for the Dubai investment market."
              description="UAE SMEs frequently raise capital with self-reported financials. InvestorShield gives investors a fast, defensible, AI-grounded second opinion before they commit AED."
            />
            <ul className="mt-6 space-y-3">
              {[
                "Trained on synthetic Dubai SME profiles across logistics, real estate, fintech, consulting, construction, e-commerce, and trading.",
                "Risk score is a weighted blend of manipulation, liquidity, ML, anomaly, document, and external signals — none of it a black box.",
                "Generates an investor-ready PDF with company profile, score, red flags, and follow-up document checklist.",
                "Includes an explicit academic disclaimer — does not make legal fraud claims.",
              ].map((point) => (
                <li key={point} className="flex gap-3 text-sm text-navy-900">
                  <CheckCircle2 className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8" variant="primary">
              <Link href="/upload">
                Try a sample company
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="relative">
            <Card className="shadow-elevated">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Sample
                    </p>
                    <p className="text-sm font-semibold text-navy-900">
                      Palm Crest Properties LLC
                    </p>
                  </div>
                  <div className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                    HIGH RISK · 74
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <Mini value="74" label="Score" tone="orange" />
                  <Mini value="0.71" label="ML p(fraud)" tone="orange" />
                  <Mini value="0.62" label="Anomaly" tone="orange" />
                </div>
                <div className="mt-6 space-y-2 text-xs text-muted-foreground">
                  <Row label="Revenue growth" value="+30.8% YoY" />
                  <Row label="Operating cash flow" value="–AED 2.8M (negative)" />
                  <Row label="Receivables / Revenue" value="56.9%" tone="bad" />
                  <Row label="Debt / Equity" value="3.58×" tone="bad" />
                </div>
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <TrendingUp className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                  Revenue growing while cash flow turned negative — classic receivables-driven
                  manipulation pattern.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container pb-20">
        <div className="rounded-2xl gradient-navy p-10 md:p-16 text-white shadow-elevated">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-3xl md:text-4xl font-bold tracking-tight">
                Run a full fraud-risk analysis in under 60 seconds.
              </h3>
              <p className="mt-3 text-navy-50/90">
                Upload your own CSV, or pick a pre-loaded Dubai SME sample. The dashboard and the
                downloadable PDF report are generated end-to-end.
              </p>
            </div>
            <div className="flex md:justify-end gap-3">
              <Button asChild size="lg" variant="secondary" className="bg-teal-500 hover:bg-teal-600">
                <Link href="/upload">
                  Start Analysis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/methodology">Methodology</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-widest text-white/70 mt-1">{label}</p>
    </div>
  );
}

function Mini({ value, label, tone }: { value: string; label: string; tone: "orange" | "red" | "green" }) {
  const t =
    tone === "orange"
      ? "bg-orange-50 text-orange-800"
      : tone === "red"
        ? "bg-red-50 text-red-800"
        : "bg-emerald-50 text-emerald-800";
  return (
    <div className={`rounded-lg px-3 py-2.5 ${t}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-widest">{label}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={tone === "bad" ? "text-red-600 font-medium" : "text-navy-900 font-medium"}>
        {value}
      </span>
    </div>
  );
}
