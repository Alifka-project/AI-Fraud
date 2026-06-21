"use client";

import Link from "next/link";
import { useState } from "react";
import { useAnalysis } from "@/lib/analysis-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/site/risk-badge";
import { ScoreGauge } from "@/components/site/score-gauge";
import { generatePdfReport } from "@/lib/pdf-report";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import {
  Download,
  FileText,
  Printer,
  Building2,
  AlertTriangle,
  ListChecks,
  Sparkles,
  ChartBar,
  Shield,
  ArrowRight,
  Upload,
} from "lucide-react";

const RECOMMENDED_DOCS = [
  "Audited financial statements (last 3 years)",
  "Bank statements (last 12 months)",
  "VAT filings and tax clearance",
  "Customer contracts (top 5 by value)",
  "Trade licence and certificate of incorporation",
  "Ownership and beneficial-owner documents",
  "Sector-specific regulatory licences (if applicable)",
];

export default function ReportPage() {
  const { result } = useAnalysis();
  const [downloading, setDownloading] = useState(false);

  if (!result) {
    return (
      <div className="container py-24 text-center">
        <FileText className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-2xl font-bold text-navy-900">No report available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Run an analysis to generate a due-diligence report.
        </p>
        <Button asChild className="mt-6" variant="primary" size="lg">
          <Link href="/upload">
            <Upload className="h-4 w-4" /> Start Analysis
          </Link>
        </Button>
      </div>
    );
  }

  async function handleDownload() {
    if (!result) return;
    setDownloading(true);
    try {
      generatePdfReport(result);
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const latest = [...result.records].sort((a, b) => a.year - b.year).slice(-1)[0];
  const currency = result.company.currency || "AED";

  return (
    <div className="container py-10">
      {/* Top toolbar - hidden in print */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-teal-600 font-semibold">
            Due-Diligence Report
          </p>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold text-navy-900">
            {result.company.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePrint} variant="outline">
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button onClick={handleDownload} variant="primary" disabled={downloading}>
            <Download className="h-4 w-4" /> {downloading ? "Generating…" : "Download PDF"}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">
              Back to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Printable report content */}
      <article className="bg-white rounded-2xl border border-navy-100 shadow-soft print:shadow-none print:border-0">
        {/* Letterhead */}
        <header className="gradient-navy text-white p-8 rounded-t-2xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-teal-300" />
                <p className="text-sm uppercase tracking-widest text-teal-200">
                  InvestorShield UAE
                </p>
              </div>
              <h2 className="mt-3 text-3xl font-bold">Due-Diligence Report</h2>
              <p className="mt-1 text-sm text-navy-50/80">
                AI-assisted financial fraud-risk assessment
              </p>
              <p className="mt-4 text-xs text-navy-50/70">
                Report generated: {new Date(result.generatedAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <ScoreGauge score={result.overallScore} size={160} />
              <div className="mt-3">
                <RiskBadge level={result.riskLevel} size="md" />
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {/* Company profile */}
          <section>
            <SectionTitle icon={Building2} title="Company Profile" />
            <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
              <Row label="Company name" value={result.company.name} />
              <Row label="Industry" value={result.company.industry ?? "—"} />
              <Row label="Location" value={result.company.location ?? "—"} />
              <Row
                label="Requested investment"
                value={
                  result.company.requestedAmount
                    ? formatCurrency(result.company.requestedAmount, currency)
                    : "—"
                }
              />
              <Row label="Years analysed" value={String(result.records.length)} />
              <Row label="Latest fiscal year" value={latest ? String(latest.year) : "—"} />
              <Row label="Notes" value={result.company.notes ?? "—"} full />
            </div>
          </section>

          {/* Risk breakdown */}
          <section>
            <SectionTitle icon={ChartBar} title="Risk Score Breakdown" />
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { label: "Statement manipulation", value: result.componentScores.manipulation, weight: "30%" },
                { label: "Cash flow & liquidity", value: result.componentScores.liquidity, weight: "20%" },
                { label: "ML fraud probability", value: result.componentScores.mlModel, weight: "20%" },
                { label: "Anomaly detection", value: result.componentScores.anomaly, weight: "10%" },
                { label: "Document consistency", value: result.componentScores.document, weight: "15%" },
                { label: "External verification", value: result.componentScores.external, weight: "5%" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border border-navy-100 p-4"
                >
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {c.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-navy-900">
                    {c.value.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Weight: {c.weight}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Key ratios */}
          <section>
            <SectionTitle icon={ChartBar} title="Key Financial Ratios" />
            <div className="overflow-x-auto mt-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-100 text-xs uppercase tracking-wider text-navy-700">
                    <th className="py-2 pr-4 text-left font-semibold">Ratio</th>
                    <th className="py-2 pr-4 text-left font-semibold">Value</th>
                    <th className="py-2 pr-4 text-left font-semibold">Ratio</th>
                    <th className="py-2 pr-4 text-left font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      ["Revenue growth (YoY)", formatPercent(result.ratios.revenueGrowth)],
                      ["Current ratio", formatNumber(result.ratios.currentRatio)],
                    ],
                    [
                      ["Net profit margin", formatPercent(result.ratios.netProfitMargin)],
                      ["Debt / Equity", formatNumber(result.ratios.debtToEquity)],
                    ],
                    [
                      ["Gross margin", formatPercent(result.ratios.grossMargin)],
                      ["OCF / Net income", formatNumber(result.ratios.ocfToNetIncome)],
                    ],
                    [
                      ["Return on assets", formatPercent(result.ratios.returnOnAssets)],
                      ["Receivables / Revenue", formatPercent(result.ratios.receivablesToRevenue)],
                    ],
                    [
                      ["Return on equity", formatPercent(result.ratios.returnOnEquity)],
                      ["Asset turnover", formatNumber(result.ratios.assetTurnover)],
                    ],
                    [
                      ["Cash flow quality", formatNumber(result.ratios.cashFlowQuality)],
                      ["Leverage ratio", formatNumber(result.ratios.leverageRatio)],
                    ],
                    [
                      ["Beneish M-Score (proxy)", formatNumber(result.ratios.beneishMScore)],
                      ["Altman Z-Score (proxy)", formatNumber(result.ratios.altmanZScore)],
                    ],
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-navy-50">
                      <td className="py-2 pr-4 text-navy-700">{row[0][0]}</td>
                      <td className="py-2 pr-4 font-mono font-semibold text-navy-900">{row[0][1]}</td>
                      <td className="py-2 pr-4 text-navy-700">{row[1][0]}</td>
                      <td className="py-2 pr-4 font-mono font-semibold text-navy-900">{row[1][1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Red flags */}
          <section>
            <SectionTitle icon={AlertTriangle} title={`Red Flags (${result.redFlags.length})`} />
            {result.redFlags.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No automated red flags triggered.
              </p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {result.redFlags
                  .slice()
                  .sort((a, b) => {
                    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                    return order[a.severity] - order[b.severity];
                  })
                  .map((f, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-navy-100 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={
                            f.severity === "critical"
                              ? "rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5"
                              : f.severity === "high"
                                ? "rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5"
                                : f.severity === "medium"
                                  ? "rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5"
                                  : "rounded-full bg-navy-100 text-navy-700 text-[10px] font-bold px-2 py-0.5"
                          }
                        >
                          {f.severity.toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold text-navy-900">{f.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          {/* AI summary */}
          <section>
            <SectionTitle icon={Sparkles} title="AI Due-Diligence Summary" />
            <p className="mt-3 text-sm leading-relaxed text-navy-900 whitespace-pre-line">
              {result.llmSummary}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Generated by: {result.modelInfo.llmProvider}
            </p>
          </section>

          {/* Recommended documents */}
          <section>
            <SectionTitle icon={ListChecks} title="Recommended Follow-Up Documents" />
            <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
              {RECOMMENDED_DOCS.map((d, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-navy-100 p-3"
                >
                  <span className="text-teal-600 font-bold">{i + 1}.</span>
                  <span className="text-navy-900">{d}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Disclaimer */}
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-bold mb-1">Academic Disclaimer</p>
            <p>
              This report is an AI-assisted due-diligence assessment and does not represent a
              legal determination of fraud. The risk score and red flags are statistical outputs
              generated by machine-learning and rule-based models. Investors, lenders, and
              procurement teams should validate findings against audited financial statements,
              bank records, and regulatory filings before making any investment, lending, or
              procurement decision.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-navy-100 pb-2">
      <Icon className="h-5 w-5 text-teal-600" />
      <h3 className="text-lg font-bold text-navy-900">{title}</h3>
    </div>
  );
}

function Row({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-navy-900">{value}</p>
    </div>
  );
}
