"use client";

import Link from "next/link";
import { useAnalysis } from "@/lib/analysis-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/site/score-gauge";
import { RiskBadge } from "@/components/site/risk-badge";
import { ComponentScores } from "@/components/dashboard/component-scores";
import { RatiosTable } from "@/components/dashboard/ratios-table";
import { RedFlagList } from "@/components/dashboard/red-flag-list";
import { FeatureImportanceChart } from "@/components/dashboard/feature-importance";
import { RlmPanel } from "@/components/dashboard/rlm-panel";
import {
  RevenueIncomeChart,
  BalanceSheetChart,
  ReceivablesDebtChart,
} from "@/components/dashboard/financial-charts";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  ArrowRight,
  Brain,
  ChartBar,
  FileSearch,
  FileText,
  Sparkles,
  Upload,
  Activity,
  Building2,
  Banknote,
  AlertTriangle,
} from "lucide-react";

export default function DashboardPage() {
  const { result } = useAnalysis();

  if (!result) {
    return (
      <div className="container py-24 text-center">
        <ChartBar className="mx-auto h-12 w-12 text-teal-600" />
        <h2 className="mt-4 text-2xl font-bold text-navy-900">No analysis yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a financial statement or pick a sample company to see the risk dashboard.
        </p>
        <Button asChild className="mt-6" variant="primary" size="lg">
          <Link href="/upload">
            <Upload className="h-4 w-4" />
            Start Analysis
          </Link>
        </Button>
      </div>
    );
  }

  const latest = [...result.records].sort((a, b) => a.year - b.year).slice(-1)[0];
  const currency = result.company.currency || "AED";

  return (
    <div className="container py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-teal-600 font-semibold">
            Risk Dashboard
          </p>
          <h1 className="mt-1 text-3xl font-bold text-navy-900 flex items-center gap-3">
            {result.company.name}
            <RiskBadge level={result.riskLevel} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.company.industry ? `${result.company.industry} · ` : ""}
            {result.company.location ?? "Location not provided"} · Analysis generated{" "}
            {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/upload">
              <Upload className="h-4 w-4" /> New analysis
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link href="/report">
              <FileText className="h-4 w-4" /> View report
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Top row: score + components */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <ScoreGauge score={result.overallScore} />
              <RiskBadge level={result.riskLevel} size="lg" className="mt-4" />
              <p className="mt-3 text-sm text-muted-foreground max-w-xs leading-relaxed">
                Weighted score from manipulation, liquidity, ML, anomaly, document, and external
                signals.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <StatTile
                icon={Brain}
                label="ML p(fraud)"
                value={result.mlFraudProbability.toFixed(2)}
                accent="navy"
              />
              <StatTile
                icon={Activity}
                label="Anomaly"
                value={result.anomalyScore.toFixed(2)}
                accent="teal"
              />
              <StatTile
                icon={AlertTriangle}
                label="Red flags"
                value={result.redFlags.length.toString()}
                accent="orange"
              />
              <StatTile
                icon={FileSearch}
                label="Years analysed"
                value={result.records.length.toString()}
                accent="navy"
              />
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {latest ? (
            <>
              <FinancialCard
                icon={Banknote}
                label="Latest revenue"
                value={formatCurrency(latest.revenue, currency)}
                sub={`FY${latest.year}`}
              />
              <FinancialCard
                icon={ChartBar}
                label="Net income"
                value={formatCurrency(latest.netIncome, currency)}
                sub={formatPercent(result.ratios.netProfitMargin) + " margin"}
              />
              <FinancialCard
                icon={Activity}
                label="Operating cash flow"
                value={formatCurrency(latest.operatingCashFlow, currency)}
                sub={`OCF/NI ${result.ratios.ocfToNetIncome.toFixed(2)}×`}
                warn={latest.operatingCashFlow < 0}
              />
              <FinancialCard
                icon={Building2}
                label="Total assets"
                value={formatCurrency(latest.totalAssets, currency)}
                sub={`Leverage ${(result.ratios.leverageRatio * 100).toFixed(0)}%`}
              />
            </>
          ) : null}
          <div className="sm:col-span-2">
            <ComponentScores scores={result.componentScores} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue, net income, operating cash flow</CardTitle>
            <CardDescription>
              Watch for revenue rising while operating cash flow falls — the canonical
              earnings-quality red flag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueIncomeChart records={result.records} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Balance-sheet composition</CardTitle>
            <CardDescription>Assets, liabilities, and equity over time.</CardDescription>
          </CardHeader>
          <CardContent>
            <BalanceSheetChart records={result.records} currency={currency} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receivables, debt, cash</CardTitle>
            <CardDescription>
              Receivables outpacing revenue is a frequent precursor to write-offs or revenue
              reversals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReceivablesDebtChart records={result.records} currency={currency} />
          </CardContent>
        </Card>
      </div>

      {/* Ratios + explainability */}
      <div className="grid lg:grid-cols-2 gap-6">
        <RatiosTable ratios={result.ratios} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600" />
              Feature importance
            </CardTitle>
            <CardDescription>
              Which signals pushed the score up (red) or down (teal). SHAP-style attributions
              when the trained model is available; otherwise weighted heuristic contributions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureImportanceChart features={result.featureImportance} />
          </CardContent>
        </Card>
      </div>

      {/* Red flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            Red flags ({result.redFlags.length})
          </CardTitle>
          <CardDescription>
            Rule-based forensic indicators ordered by severity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RedFlagList flags={result.redFlags} />
        </CardContent>
      </Card>

      {/* Recursive Language Model document intelligence */}
      {result.rlm ? <RlmPanel rlm={result.rlm} /> : null}

      {/* LLM Summary */}
      <Card className="border-teal-200 bg-gradient-to-br from-white to-teal-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            AI due-diligence summary
          </CardTitle>
          <CardDescription>
            {result.modelInfo.llmProvider}. Always corroborate against audited statements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-navy-900 whitespace-pre-line">
            {result.llmSummary}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="muted">Classifier: {result.modelInfo.classifier}</Badge>
            <Badge variant="muted">Anomaly: {result.modelInfo.anomalyDetector}</Badge>
            <Badge variant="muted">Explainability: {result.modelInfo.explainability}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <strong>Academic disclaimer:</strong> InvestorShield UAE is an AI-assisted due-diligence
        tool. The risk score and red flags are statistical outputs and do not constitute a legal
        determination of fraud. Validate findings against audited statements, bank records, and
        regulatory filings before acting.
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: "navy" | "teal" | "orange";
}) {
  const accentClasses =
    accent === "navy"
      ? "bg-navy-50 text-navy-700"
      : accent === "teal"
        ? "bg-teal-50 text-teal-700"
        : "bg-orange-50 text-orange-700";
  return (
    <div className="rounded-lg border border-navy-100 bg-white p-3">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${accentClasses}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-lg font-bold text-navy-900">{value}</p>
    </div>
  );
}

function FinancialCard({
  icon: Icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-md ${warn ? "bg-red-50 text-red-700" : "bg-teal-50 text-teal-700"}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
        <p className={`mt-3 text-2xl font-bold ${warn ? "text-red-700" : "text-navy-900"}`}>
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
