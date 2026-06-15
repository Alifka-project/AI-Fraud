// TypeScript fallback risk engine.
// Used when the Python FastAPI service is unreachable so the demo never breaks.
// Implements the same scoring philosophy as the Python service but with
// simpler, rule-based heuristics (no XGBoost / no Isolation Forest models).

import type {
  AnalysisRequest,
  FeatureImportance,
  FinancialRatios,
  FinancialRecordInput,
  RedFlag,
  RiskAssessmentResult,
} from "./types";
import { riskLevelFromScore } from "./utils";

function safeDiv(a: number, b: number, fallback: number = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  return a / b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeRatios(records: FinancialRecordInput[]): FinancialRatios {
  const sorted = [...records].sort((a, b) => a.year - b.year);
  const current = sorted[sorted.length - 1];
  const prior = sorted.length > 1 ? sorted[sorted.length - 2] : current;

  if (!current) {
    return {
      revenueGrowth: 0,
      netProfitMargin: 0,
      grossMargin: 0,
      currentRatio: 0,
      debtToEquity: 0,
      returnOnAssets: 0,
      returnOnEquity: 0,
      ocfToNetIncome: 0,
      receivablesToRevenue: 0,
      assetTurnover: 0,
      leverageRatio: 0,
      cashFlowQuality: 0,
      revenueVsCashFlowGrowth: 0,
      receivablesGrowthVsRevenueGrowth: 0,
      beneishMScore: 0,
      altmanZScore: 0,
    };
  }

  const revenueGrowth = safeDiv(current.revenue - prior.revenue, Math.abs(prior.revenue) || 1);
  const cashFlowGrowth = safeDiv(
    current.operatingCashFlow - prior.operatingCashFlow,
    Math.abs(prior.operatingCashFlow) || 1
  );
  const receivablesGrowth = safeDiv(
    current.receivables - prior.receivables,
    Math.abs(prior.receivables) || 1
  );

  const netProfitMargin = safeDiv(current.netIncome, current.revenue);
  const grossMargin = safeDiv(current.revenue - current.costOfGoodsSold, current.revenue);
  const currentLiabilitiesProxy = Math.max(current.totalLiabilities - current.debt, current.totalLiabilities * 0.4);
  const currentAssetsProxy = current.cash + current.receivables + Math.max(current.totalAssets * 0.15, 0);
  const currentRatio = safeDiv(currentAssetsProxy, currentLiabilitiesProxy, 0);
  const debtToEquity = safeDiv(current.debt, current.equity, 0);
  const returnOnAssets = safeDiv(current.netIncome, current.totalAssets);
  const returnOnEquity = safeDiv(current.netIncome, current.equity);
  const ocfToNetIncome = safeDiv(current.operatingCashFlow, current.netIncome, 0);
  const receivablesToRevenue = safeDiv(current.receivables, current.revenue);
  const assetTurnover = safeDiv(current.revenue, current.totalAssets);
  const leverageRatio = safeDiv(current.totalLiabilities, current.totalAssets);

  // Cash-flow quality: how much net income is backed by real operating cash.
  const cashFlowQuality = clamp(ocfToNetIncome, -2, 3);

  // Beneish-style proxy: blend of receivables-to-revenue surge, leverage growth,
  // and revenue/cash-flow divergence. Higher = more manipulation-like.
  const beneishMScore =
    -2.5 +
    0.92 * receivablesToRevenue +
    0.4 * leverageRatio +
    1.5 * Math.max(0, revenueGrowth - Math.max(cashFlowGrowth, 0)) +
    0.8 * Math.max(0, receivablesGrowth - revenueGrowth);

  // Altman Z-Score proxy (private firm variant approximation).
  const workingCapital = currentAssetsProxy - currentLiabilitiesProxy;
  const retainedEarningsProxy = current.equity * 0.6; // assume 60% retained
  const ebitProxy = current.netIncome + Math.max(current.debt * 0.06, 0);

  const altmanZScore =
    0.717 * safeDiv(workingCapital, current.totalAssets) +
    0.847 * safeDiv(retainedEarningsProxy, current.totalAssets) +
    3.107 * safeDiv(ebitProxy, current.totalAssets) +
    0.42 * safeDiv(current.equity, current.totalLiabilities) +
    0.998 * assetTurnover;

  return {
    revenueGrowth,
    netProfitMargin,
    grossMargin,
    currentRatio,
    debtToEquity,
    returnOnAssets,
    returnOnEquity,
    ocfToNetIncome,
    receivablesToRevenue,
    assetTurnover,
    leverageRatio,
    cashFlowQuality,
    revenueVsCashFlowGrowth: revenueGrowth - cashFlowGrowth,
    receivablesGrowthVsRevenueGrowth: receivablesGrowth - revenueGrowth,
    beneishMScore,
    altmanZScore,
  };
}

export function detectRedFlags(
  ratios: FinancialRatios,
  records: FinancialRecordInput[]
): RedFlag[] {
  const flags: RedFlag[] = [];
  const sorted = [...records].sort((a, b) => a.year - b.year);
  const current = sorted[sorted.length - 1];

  if (ratios.revenueGrowth > 0.1 && ratios.revenueVsCashFlowGrowth > 0.3) {
    flags.push({
      code: "REVENUE_CASH_DIVERGENCE",
      title: "Revenue grew while operating cash flow lagged badly",
      severity: "high",
      description:
        "Reported revenue is increasing significantly faster than operating cash flow. This is a classic earnings-quality red flag and often indicates aggressive revenue recognition or growth funded by uncollected receivables.",
      metric: "Revenue growth - OCF growth",
      metricValue: ratios.revenueVsCashFlowGrowth,
    });
  }

  if (current && current.netIncome > 0 && current.operatingCashFlow < 0) {
    flags.push({
      code: "POSITIVE_NI_NEGATIVE_OCF",
      title: "Positive net income but negative operating cash flow",
      severity: "critical",
      description:
        "The company reports profit while burning cash from operations. This decoupling of accrual earnings from real cash is one of the most reliable single indicators of statement manipulation.",
      metric: "Operating cash flow (AED)",
      metricValue: current.operatingCashFlow,
    });
  }

  if (ratios.receivablesGrowthVsRevenueGrowth > 0.2) {
    flags.push({
      code: "RECEIVABLES_OUTPACE_REVENUE",
      title: "Receivables growing faster than revenue",
      severity: "high",
      description:
        "Accounts receivable are expanding ahead of underlying sales — often a precursor to a write-off or evidence of recognising revenue that has not yet been collected.",
      metric: "Receivables growth - Revenue growth",
      metricValue: ratios.receivablesGrowthVsRevenueGrowth,
    });
  }

  if (ratios.debtToEquity > 2.5) {
    flags.push({
      code: "HIGH_LEVERAGE",
      title: "Debt-to-equity is unusually high",
      severity: ratios.debtToEquity > 4 ? "critical" : "high",
      description: `Debt-to-equity of ${ratios.debtToEquity.toFixed(2)}× implies the company is heavily creditor-financed and is more sensitive to interest-rate shocks or refinancing risk.`,
      metric: "Debt / Equity",
      metricValue: ratios.debtToEquity,
    });
  }

  if (ratios.currentRatio > 0 && ratios.currentRatio < 1) {
    flags.push({
      code: "LIQUIDITY_RISK",
      title: "Current ratio below safe threshold",
      severity: "medium",
      description:
        "Estimated current assets do not cover short-term liabilities, suggesting potential difficulty meeting near-term obligations.",
      metric: "Current ratio",
      metricValue: ratios.currentRatio,
    });
  }

  if (sorted.length >= 2) {
    const prior = sorted[sorted.length - 2];
    const priorMargin = safeDiv(prior.netIncome, prior.revenue);
    const change = ratios.netProfitMargin - priorMargin;
    if (Math.abs(change) > 0.08) {
      flags.push({
        code: "ABNORMAL_MARGIN_CHANGE",
        title:
          change > 0
            ? "Net profit margin jumped abnormally year-over-year"
            : "Net profit margin collapsed year-over-year",
        severity: "medium",
        description: `Net profit margin moved by ${(change * 100).toFixed(1)} percentage points versus the prior year. Step-changes that large are uncommon without a one-off item and should be explained in the management narrative.`,
        metric: "Net margin change",
        metricValue: change,
      });
    }
  }

  if (current) {
    const assetGrowth = sorted.length >= 2
      ? safeDiv(current.totalAssets - sorted[sorted.length - 2].totalAssets, sorted[sorted.length - 2].totalAssets)
      : 0;
    if (assetGrowth > ratios.revenueGrowth + 0.2 && ratios.revenueGrowth > 0) {
      flags.push({
        code: "ASSETS_OUTPACE_REVENUE",
        title: "Total assets growing faster than revenue",
        severity: "medium",
        description:
          "Asset base is expanding much faster than the revenue it generates — often a sign of inefficient capital deployment or asset inflation on the balance sheet.",
        metric: "Asset growth vs revenue growth",
        metricValue: assetGrowth - ratios.revenueGrowth,
      });
    }
  }

  if (ratios.cashFlowQuality < 0.5 && ratios.netProfitMargin > 0.05) {
    flags.push({
      code: "WEAK_CASH_FLOW_QUALITY",
      title: "Earnings not backed by operating cash",
      severity: "high",
      description:
        "Operating cash flow covers less than half of reported net income. Earnings quality is poor and may not be sustainable.",
      metric: "OCF / Net income",
      metricValue: ratios.ocfToNetIncome,
    });
  }

  if (current) {
    const missing: string[] = [];
    if (!current.operatingCashFlow) missing.push("operating cash flow");
    if (!current.receivables) missing.push("receivables");
    if (!current.debt) missing.push("debt");
    if (missing.length) {
      flags.push({
        code: "MISSING_FIELDS",
        title: `Key financial fields missing: ${missing.join(", ")}`,
        severity: "medium",
        description:
          "Critical figures are zero or absent. The analysis falls back to conservative defaults; request audited statements before proceeding.",
      });
    }
  }

  if (ratios.altmanZScore > 0 && ratios.altmanZScore < 1.23) {
    flags.push({
      code: "ALTMAN_DISTRESS",
      title: "Altman Z-score in the distress zone",
      severity: "high",
      description: `Altman Z-score of ${ratios.altmanZScore.toFixed(2)} is below the 1.23 distress threshold for private firms.`,
      metric: "Altman Z-Score",
      metricValue: ratios.altmanZScore,
    });
  }

  if (ratios.beneishMScore > -1.78) {
    flags.push({
      code: "BENEISH_FLAG",
      title: "Beneish-style indicator elevated",
      severity: ratios.beneishMScore > -1.0 ? "high" : "medium",
      description: `Beneish M-Score proxy of ${ratios.beneishMScore.toFixed(2)} is above the -1.78 threshold, suggesting heightened statement-manipulation risk.`,
      metric: "Beneish M-Score (proxy)",
      metricValue: ratios.beneishMScore,
    });
  }

  return flags;
}

function manipulationScoreFromRatios(ratios: FinancialRatios, flags: RedFlag[]): number {
  let s = 0;
  s += clamp(Math.max(0, ratios.revenueVsCashFlowGrowth) * 60, 0, 30);
  s += clamp(Math.max(0, ratios.receivablesGrowthVsRevenueGrowth) * 50, 0, 25);
  s += clamp(Math.max(0, ratios.beneishMScore + 2.0) * 18, 0, 25);
  s += flags.filter((f) => f.severity === "critical").length * 8;
  s += flags.filter((f) => f.severity === "high").length * 5;
  return clamp(s, 0, 100);
}

function liquidityScoreFromRatios(ratios: FinancialRatios): number {
  let s = 0;
  if (ratios.currentRatio < 1) s += (1 - ratios.currentRatio) * 40;
  if (ratios.debtToEquity > 1.5) s += clamp((ratios.debtToEquity - 1.5) * 20, 0, 40);
  if (ratios.cashFlowQuality < 1) s += (1 - ratios.cashFlowQuality) * 25;
  if (ratios.altmanZScore < 1.81) s += clamp((1.81 - ratios.altmanZScore) * 12, 0, 25);
  return clamp(s, 0, 100);
}

function mlScoreFromRatios(ratios: FinancialRatios, flags: RedFlag[]): number {
  // Deterministic logistic-style heuristic so the demo is reproducible.
  const z =
    -1.5 +
    1.2 * Math.max(0, ratios.revenueVsCashFlowGrowth) +
    1.4 * Math.max(0, ratios.receivablesGrowthVsRevenueGrowth) +
    0.9 * Math.max(0, ratios.beneishMScore + 1.5) +
    0.6 * Math.max(0, ratios.leverageRatio - 0.6) +
    0.5 * flags.filter((f) => f.severity === "critical").length +
    0.3 * flags.filter((f) => f.severity === "high").length;
  const probability = 1 / (1 + Math.exp(-z));
  return clamp(probability * 100, 0, 100);
}

function anomalyScoreFromRatios(ratios: FinancialRatios): number {
  // Distance from "healthy company" centroid in ratio space.
  const targets = {
    netProfitMargin: 0.1,
    cashFlowQuality: 1.2,
    debtToEquity: 0.8,
    receivablesToRevenue: 0.18,
    currentRatio: 1.6,
  };
  const dist =
    Math.abs(ratios.netProfitMargin - targets.netProfitMargin) * 60 +
    Math.abs(ratios.cashFlowQuality - targets.cashFlowQuality) * 18 +
    Math.abs(ratios.debtToEquity - targets.debtToEquity) * 12 +
    Math.abs(ratios.receivablesToRevenue - targets.receivablesToRevenue) * 90 +
    Math.abs(ratios.currentRatio - targets.currentRatio) * 10;
  return clamp(dist, 0, 100);
}

function buildFeatureImportance(
  ratios: FinancialRatios,
  flags: RedFlag[]
): FeatureImportance[] {
  const contributions: FeatureImportance[] = [
    {
      feature: "Revenue vs cash-flow growth divergence",
      importance: clamp(Math.abs(ratios.revenueVsCashFlowGrowth) * 100, 0, 100),
      direction: ratios.revenueVsCashFlowGrowth > 0 ? "increase_risk" : "decrease_risk",
      value: ratios.revenueVsCashFlowGrowth,
    },
    {
      feature: "Receivables growth vs revenue growth",
      importance: clamp(Math.abs(ratios.receivablesGrowthVsRevenueGrowth) * 100, 0, 100),
      direction:
        ratios.receivablesGrowthVsRevenueGrowth > 0 ? "increase_risk" : "decrease_risk",
      value: ratios.receivablesGrowthVsRevenueGrowth,
    },
    {
      feature: "Operating cash flow / net income",
      importance: clamp(Math.abs(1.2 - ratios.cashFlowQuality) * 35, 0, 100),
      direction: ratios.cashFlowQuality < 1 ? "increase_risk" : "decrease_risk",
      value: ratios.cashFlowQuality,
    },
    {
      feature: "Debt / Equity",
      importance: clamp(Math.abs(ratios.debtToEquity - 0.8) * 18, 0, 100),
      direction: ratios.debtToEquity > 1.5 ? "increase_risk" : "decrease_risk",
      value: ratios.debtToEquity,
    },
    {
      feature: "Receivables / Revenue",
      importance: clamp(Math.abs(ratios.receivablesToRevenue - 0.18) * 200, 0, 100),
      direction: ratios.receivablesToRevenue > 0.25 ? "increase_risk" : "decrease_risk",
      value: ratios.receivablesToRevenue,
    },
    {
      feature: "Net profit margin",
      importance: clamp(Math.abs(ratios.netProfitMargin - 0.1) * 200, 0, 100),
      direction: ratios.netProfitMargin < 0.02 ? "increase_risk" : "decrease_risk",
      value: ratios.netProfitMargin,
    },
    {
      feature: "Beneish M-Score (proxy)",
      importance: clamp(Math.abs(ratios.beneishMScore + 1.78) * 25, 0, 100),
      direction: ratios.beneishMScore > -1.78 ? "increase_risk" : "decrease_risk",
      value: ratios.beneishMScore,
    },
    {
      feature: "Altman Z-Score (proxy)",
      importance: clamp(Math.abs(ratios.altmanZScore - 2.6) * 25, 0, 100),
      direction: ratios.altmanZScore < 1.81 ? "increase_risk" : "decrease_risk",
      value: ratios.altmanZScore,
    },
    {
      feature: "Red-flag rule hits",
      importance: clamp(flags.length * 12, 0, 100),
      direction: "increase_risk",
      value: flags.length,
    },
  ];

  return contributions
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8);
}

function ruleBasedSummary(
  company: AnalysisRequest["company"],
  level: string,
  ratios: FinancialRatios,
  flags: RedFlag[]
): string {
  const lines: string[] = [];
  lines.push(
    `${company.name} has been assessed at a ${level.toLowerCase()} fraud-risk level based on its reported financial statements.`
  );

  if (ratios.revenueVsCashFlowGrowth > 0.3) {
    lines.push(
      "Top concern: reported revenue is growing materially faster than operating cash flow, which historically correlates with aggressive revenue recognition."
    );
  } else if (ratios.cashFlowQuality > 1) {
    lines.push(
      "Earnings quality is healthy — operating cash flow comfortably exceeds reported net income, which is a positive signal."
    );
  }

  if (ratios.debtToEquity > 2.5) {
    lines.push(
      `Capital structure is heavily leveraged at ${ratios.debtToEquity.toFixed(2)}× debt-to-equity, increasing sensitivity to refinancing risk.`
    );
  }
  if (ratios.altmanZScore < 1.23 && ratios.altmanZScore > 0) {
    lines.push(
      `Altman Z-score of ${ratios.altmanZScore.toFixed(2)} sits in the distress zone, signalling elevated probability of financial distress.`
    );
  }

  const critical = flags.filter((f) => f.severity === "critical");
  const high = flags.filter((f) => f.severity === "high");
  if (critical.length) {
    lines.push(
      `Critical red flags detected: ${critical.map((f) => f.title).join("; ")}.`
    );
  }
  if (high.length) {
    lines.push(`High-severity flags include: ${high.map((f) => f.title).join("; ")}.`);
  }

  lines.push(
    "Recommendation: before progressing this opportunity, request audited financial statements, bank statements, VAT filings, trade licence, and ageing schedules for receivables. Validate cash flow against bank movements rather than relying on management-prepared figures."
  );

  return lines.join(" ");
}

export function fallbackAnalyze(payload: AnalysisRequest): RiskAssessmentResult {
  const ratios = computeRatios(payload.records);
  const redFlags = detectRedFlags(ratios, payload.records);

  const manipulation = manipulationScoreFromRatios(ratios, redFlags);
  const liquidity = liquidityScoreFromRatios(ratios);
  const mlScore = mlScoreFromRatios(ratios, redFlags);
  const anomaly = anomalyScoreFromRatios(ratios);
  const document = clamp(40 + redFlags.length * 4, 0, 90); // mild doc-risk baseline
  const external = clamp(35 + (payload.company.notes ? 0 : 5), 0, 80);

  const overall =
    manipulation * 0.3 +
    liquidity * 0.2 +
    mlScore * 0.2 +
    anomaly * 0.1 +
    document * 0.15 +
    external * 0.05;

  const score = clamp(overall, 0, 100);
  const level = riskLevelFromScore(score);

  const featureImportance = buildFeatureImportance(ratios, redFlags);
  const summary = ruleBasedSummary(payload.company, level, ratios, redFlags);

  return {
    overallScore: Math.round(score * 10) / 10,
    riskLevel: level,
    mlFraudProbability: Math.round(mlScore) / 100,
    anomalyScore: Math.round(anomaly) / 100,
    componentScores: {
      manipulation: Math.round(manipulation * 10) / 10,
      liquidity: Math.round(liquidity * 10) / 10,
      mlModel: Math.round(mlScore * 10) / 10,
      anomaly: Math.round(anomaly * 10) / 10,
      document: Math.round(document * 10) / 10,
      external: Math.round(external * 10) / 10,
    },
    ratios,
    redFlags,
    featureImportance,
    llmSummary: summary,
    company: payload.company,
    records: payload.records,
    generatedAt: new Date().toISOString(),
    modelInfo: {
      classifier: "TypeScript rule-based logistic heuristic (fallback)",
      anomalyDetector: "Centroid-distance heuristic (fallback)",
      llmProvider: "Rule-based template (fallback)",
      explainability: "Weighted feature contributions (fallback)",
    },
  };
}
