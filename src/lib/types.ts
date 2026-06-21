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
}

export interface AnalysisRequest {
  company: CompanyMetadata;
  records: FinancialRecordInput[];
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
}
