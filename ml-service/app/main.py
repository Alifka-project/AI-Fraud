"""FastAPI entrypoint for the InvestorShield UAE ML microservice."""

from __future__ import annotations

import io
import json
import os
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .feature_engine import RECORD_COLUMNS
from .inference import run_analysis
from .schemas import AnalysisRequest, CompanyMetadata, FinancialRecordInput, RiskAssessmentResult


app = FastAPI(
    title="InvestorShield UAE ML Service",
    version="1.0.0",
    description=(
        "Financial fraud-risk assessment microservice. Implements the feature engine, "
        "XGBoost classifier, Isolation Forest anomaly detector, and LLM-or-rule-based "
        "due-diligence summary used by the Next.js frontend."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "InvestorShield UAE ML Service",
        "openai_key_configured": bool(os.environ.get("OPENAI_API_KEY")),
    }


@app.post("/analyze", response_model=RiskAssessmentResult, response_model_by_alias=True)
def analyze(payload: AnalysisRequest):
    if not payload.records:
        raise HTTPException(status_code=400, detail="At least one financial record is required.")
    return run_analysis(payload)


FIELD_ALIASES = {
    "year": ["year", "fy", "fiscal_year", "period"],
    "revenue": ["revenue", "sales", "turnover", "total_revenue", "net_sales"],
    "net_income": ["net_income", "netincome", "profit", "net_profit", "earnings"],
    "total_assets": ["total_assets", "assets", "totalassets"],
    "total_liabilities": ["total_liabilities", "liabilities", "totalliabilities"],
    "equity": ["equity", "shareholders_equity", "stockholders_equity", "total_equity"],
    "cash": ["cash", "cash_and_equivalents", "cash_equivalents"],
    "operating_cash_flow": [
        "operating_cash_flow",
        "operatingcashflow",
        "ocf",
        "cash_from_operations",
        "cfo",
    ],
    "receivables": ["receivables", "accounts_receivable", "trade_receivables", "ar"],
    "debt": ["debt", "total_debt", "borrowings", "long_term_debt"],
    "cost_of_goods_sold": ["cogs", "cost_of_goods_sold", "cost_of_sales", "cost_of_revenue"],
    "expenses": ["expenses", "operating_expenses", "opex", "total_expenses"],
}


def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename: dict[str, str] = {}
    lowered = {c: str(c).strip().lower().replace(" ", "_").replace("-", "_") for c in df.columns}
    for canonical, aliases in FIELD_ALIASES.items():
        for orig, low in lowered.items():
            if low in aliases:
                rename[orig] = canonical
                break
    df = df.rename(columns=rename)
    for col in RECORD_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0
    df = df[RECORD_COLUMNS]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0).astype(int)
    for col in RECORD_COLUMNS[1:]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df = df[df["year"] > 0].sort_values("year").reset_index(drop=True)
    return df


@app.post("/upload-analyze", response_model=RiskAssessmentResult, response_model_by_alias=True)
async def upload_analyze(
    file: UploadFile = File(...),
    company: Optional[str] = Form(None),
):
    raw = await file.read()
    filename = (file.filename or "").lower()
    try:
        if filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(raw))
        elif filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw))
        else:
            # Try CSV by default.
            df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}")

    df = _normalise_columns(df)
    if df.empty:
        raise HTTPException(
            status_code=400, detail="No usable financial rows extracted from the file."
        )

    try:
        meta = json.loads(company) if company else {}
    except json.JSONDecodeError:
        meta = {}

    company_meta = CompanyMetadata(
        name=meta.get("name") or file.filename or "Uploaded Company",
        industry=meta.get("industry"),
        location=meta.get("location"),
        requested_amount=meta.get("requestedAmount") or meta.get("requested_amount"),
        notes=meta.get("notes"),
    )

    records = [FinancialRecordInput(**row) for row in df.to_dict(orient="records")]
    return run_analysis(AnalysisRequest(company=company_meta, records=records))


@app.post("/generate-report")
def generate_report(result: RiskAssessmentResult):
    return {
        "title": "InvestorShield UAE Due-Diligence Report",
        "generated_at": result.generated_at,
        "company": result.company.model_dump(by_alias=True),
        "overall_score": result.overall_score,
        "risk_level": result.risk_level,
        "component_scores": result.component_scores.model_dump(by_alias=True),
        "ratios": result.ratios.model_dump(by_alias=True),
        "red_flags": [f.model_dump(by_alias=True) for f in result.red_flags],
        "feature_importance": [f.model_dump(by_alias=True) for f in result.feature_importance],
        "llm_summary": result.llm_summary,
        "records": [r.model_dump(by_alias=True) for r in result.records],
        "model_info": result.model_info.model_dump(by_alias=True),
        "recommended_documents": [
            "Audited financial statements (last 3 years)",
            "Bank statements (last 12 months)",
            "VAT filings and tax clearance",
            "Customer contracts (top 5 by value)",
            "Trade licence and certificate of incorporation",
            "Ownership and beneficial-owner documents",
            "Sector-specific regulatory licences (if applicable)",
        ],
        "disclaimer": (
            "This report is an AI-assisted due-diligence assessment and does not represent a "
            "legal determination of fraud. Investors should rely on professional auditors, "
            "legal counsel, and verified primary documents before making any investment, "
            "lending, or procurement decision."
        ),
    }
