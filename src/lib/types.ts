// Shared TypeScript types used across the InvestorShield UAE frontend.

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FinancialRecordInput {
  year: number;
  revenue: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  cash: number;
  operatingCashFlow: number;
  receivables: number;
  debt: number;
  costOfGoodsSold: number;
  expenses: number;
}

export interface CompanyMetadata {
  name: string;
  industry?: string;
  location?: string;
  requestedAmount?: number;
  notes?: string;
  currency?: string;
}

export interface AnalysisRequest {
  company: CompanyMetadata;
  records: FinancialRecordInput[];
  rlm?: RlmResult;
}

export interface UploadExtractionResponse {
  records: FinancialRecordInput[];
  warnings: string[];
  extraction: {
    method: "csv" | "xlsx" | "pdf-llm" | "pdf-heuristic";
    confidence: "high" | "medium" | "low";
    pages?: number;
    detectedCompanyName?: string | null;
    detectedCurrency?: string | null;
  };
  rlm?: RlmResult;
}

// ---------------------------------------------------------------------------
// Recursive Language Model (RLM) types.
//
// The RLM recursively decomposes a full filing into sections, analyses each
// (recursing further when a section is itself too large), then recursively
// reduces the partial findings into a single due-diligence synthesis. The
// trace exposes the recursion for explainability.
// ---------------------------------------------------------------------------

export type RlmNodeKind = "root" | "section" | "chunk" | "reduce";

export interface RlmNode {
  id: string;
  parentId: string | null;
  depth: number;
  kind: RlmNodeKind;
  label: string;
  chars: number;
  digest?: string;
}

export interface RlmTrace {
  provider: string;
  totalCalls: number;
  maxDepth: number;
  sectionsAnalyzed: number;
  charsProcessed: number;
  llmCalls: number;
  nodes: RlmNode[];
}

export interface RlmQualitativeFlag {
  code: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  section: string;
  evidence: string;
}

export interface RlmSectionDigest {
  section: string;
  digest: string;
}

export interface RlmResult {
  summary: string;
  qualitativeFlags: RlmQualitativeFlag[];
  sectionDigests: RlmSectionDigest[];
  documentRiskScore: number; // 0-100 derived from qualitative findings
  trace: RlmTrace;
}

export interface RedFlag {
  code: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  metric?: string;
  metricValue?: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  direction: "increase_risk" | "decrease_risk";
  value?: number;
}

export interface FinancialRatios {
  revenueGrowth: number;
  netProfitMargin: number;
  grossMargin: number;
  currentRatio: number;
  debtToEquity: number;
  returnOnAssets: number;
  returnOnEquity: number;
  ocfToNetIncome: number;
  receivablesToRevenue: number;
  assetTurnover: number;
  leverageRatio: number;
  cashFlowQuality: number;
  revenueVsCashFlowGrowth: number;
  receivablesGrowthVsRevenueGrowth: number;
  beneishMScore: number;
  altmanZScore: number;
}

export interface RiskAssessmentResult {
  overallScore: number;
  riskLevel: RiskLevel;
  mlFraudProbability: number;
  anomalyScore: number;
  componentScores: {
    manipulation: number;
    liquidity: number;
    mlModel: number;
    anomaly: number;
    document: number;
    external: number;
  };
  ratios: FinancialRatios;
  redFlags: RedFlag[];
  featureImportance: FeatureImportance[];
  llmSummary: string;
  company: CompanyMetadata;
  records: FinancialRecordInput[];
  generatedAt: string;
  modelInfo: {
    classifier: string;
    anomalyDetector: string;
    llmProvider: string;
    explainability: string;
  };
  rlm?: RlmResult;
}
