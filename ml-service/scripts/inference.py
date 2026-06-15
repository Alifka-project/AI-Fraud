"""Standalone inference CLI - useful for academic demos and debugging.

Usage:
    python -m ml_service.scripts.inference --file data/sample_companies.csv \
        --company-id CO_00001
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.inference import run_analysis  # noqa: E402
from app.schemas import AnalysisRequest, CompanyMetadata, FinancialRecordInput  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=str, required=True, help="CSV with financial rows.")
    parser.add_argument("--company-id", type=str, default=None)
    parser.add_argument("--company-name", type=str, default=None)
    args = parser.parse_args()

    df = pd.read_csv(args.file)
    if args.company_id:
        df = df[df["company_id"] == args.company_id]
        if df.empty:
            raise SystemExit(f"No rows for company_id={args.company_id}")
    name = args.company_name or args.company_id or "CLI Company"

    records = [
        FinancialRecordInput(
            year=int(r["year"]),
            revenue=float(r.get("revenue", 0)),
            net_income=float(r.get("net_income", 0)),
            total_assets=float(r.get("total_assets", 0)),
            total_liabilities=float(r.get("total_liabilities", 0)),
            equity=float(r.get("equity", 0)),
            cash=float(r.get("cash", 0)),
            operating_cash_flow=float(r.get("operating_cash_flow", 0)),
            receivables=float(r.get("receivables", 0)),
            debt=float(r.get("debt", 0)),
            cost_of_goods_sold=float(r.get("cost_of_goods_sold", 0)),
            expenses=float(r.get("expenses", 0)),
        )
        for _, r in df.iterrows()
    ]

    payload = AnalysisRequest(
        company=CompanyMetadata(name=name, industry=df.get("sector", pd.Series()).iloc[0] if "sector" in df else None),
        records=records,
    )
    result = run_analysis(payload)
    print(json.dumps(result.model_dump(by_alias=True), indent=2, default=str))


if __name__ == "__main__":
    main()
