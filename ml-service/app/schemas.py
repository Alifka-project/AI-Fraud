"""Pydantic schemas for the InvestorShield FastAPI service.

Field names are camelCase so the JSON response can be consumed directly by the
Next.js frontend without an additional transformation layer.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=camel)


class FinancialRecordInput(CamelModel):
    year: int
    revenue: float = 0.0
    net_income: float = 0.0
    total_assets: float = 0.0
    total_liabilities: float = 0.0
    equity: float = 0.0
    cash: float = 0.0
    operating_cash_flow: float = 0.0
    receivables: float = 0.0
    debt: float = 0.0
    cost_of_goods_sold: float = 0.0
    expenses: float = 0.0


class CompanyMetadata(CamelModel):
    name: str
    industry: Optional[str] = None
    location: Optional[str] = None
    requested_amount: Optional[float] = None
    notes: Optional[str] = None
    currency: Optional[str] = None


class AnalysisRequest(CamelModel):
    company: CompanyMetadata
    records: List[FinancialRecordInput]


class RedFlag(CamelModel):
    code: str
    title: str
    severity: Literal["low", "medium", "high", "critical"]
    description: str
    metric: Optional[str] = None
    metric_value: Optional[float] = None


class FinancialRatios(CamelModel):
    revenue_growth: float
    net_profit_margin: float
    gross_margin: float
    current_ratio: float
    debt_to_equity: float
    return_on_assets: float
    return_on_equity: float
    ocf_to_net_income: float
    receivables_to_revenue: float
    asset_turnover: float
    leverage_ratio: float
    cash_flow_quality: float
    revenue_vs_cash_flow_growth: float
    receivables_growth_vs_revenue_growth: float
    beneish_m_score: float
    altman_z_score: float


class FeatureImportance(CamelModel):
    feature: str
    importance: float
    direction: Literal["increase_risk", "decrease_risk"]
    value: Optional[float] = None


class ComponentScores(CamelModel):
    manipulation: float
    liquidity: float
    ml_model: float = Field(..., alias="mlModel")
    anomaly: float
    document: float
    external: float


class ModelInfo(CamelModel):
    classifier: str
    anomaly_detector: str
    llm_provider: str
    explainability: str


class RlmNode(CamelModel):
    id: str
    parent_id: Optional[str] = None
    depth: int
    kind: Literal["root", "section", "chunk", "reduce"]
    label: str
    chars: int
    digest: Optional[str] = None


class RlmTrace(CamelModel):
    provider: str
    total_calls: int
    max_depth: int
    sections_analyzed: int
    chars_processed: int
    llm_calls: int
    nodes: List[RlmNode]


class RlmQualitativeFlag(CamelModel):
    code: str
    title: str
    severity: Literal["low", "medium", "high", "critical"]
    section: str
    evidence: str


class RlmSectionDigest(CamelModel):
    section: str
    digest: str


class RlmResult(CamelModel):
    summary: str
    qualitative_flags: List[RlmQualitativeFlag]
    section_digests: List[RlmSectionDigest]
    document_risk_score: float
    trace: RlmTrace


class RiskAssessmentResult(CamelModel):
    overall_score: float
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    ml_fraud_probability: float
    anomaly_score: float
    component_scores: ComponentScores
    ratios: FinancialRatios
    red_flags: List[RedFlag]
    feature_importance: List[FeatureImportance]
    llm_summary: str
    company: CompanyMetadata
    records: List[FinancialRecordInput]
    generated_at: str
    model_info: ModelInfo
    rlm: Optional[RlmResult] = None
