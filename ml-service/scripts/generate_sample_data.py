"""Generate a synthetic Dubai SME financial-statement dataset.

The dataset contains roughly half normal companies and half companies with
injected manipulation patterns. It is used to train the XGBoost classifier and
the Isolation Forest anomaly detector. All values are in AED.

Usage:
    python -m ml_service.scripts.generate_sample_data \
        --rows 1500 --out data/sample_companies.csv
"""

from __future__ import annotations

import argparse
import math
import random
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd


SECTORS = [
    "Real Estate",
    "Logistics",
    "Consulting",
    "E-Commerce",
    "Fintech",
    "Construction",
    "General Trading",
    "Manufacturing",
    "Hospitality",
    "Healthcare",
]


def _round_money(v: float) -> float:
    return float(round(max(v, 0), 0))


def _sample_normal_company(rng: random.Random) -> List[dict]:
    """Three years of plausible financial history for a healthy Dubai SME."""

    base_revenue = rng.uniform(5_000_000, 90_000_000)
    growth_path = [rng.uniform(0.03, 0.18) for _ in range(2)]
    net_margin = rng.uniform(0.04, 0.18)
    leverage_ratio = rng.uniform(0.25, 0.55)
    sector = rng.choice(SECTORS)

    records: List[dict] = []
    revenue = base_revenue
    assets = base_revenue * rng.uniform(0.6, 1.4)
    for year_offset, growth in enumerate([0.0] + growth_path):
        revenue *= 1 + growth
        liabilities = assets * leverage_ratio
        equity = assets - liabilities
        net_income = revenue * net_margin * rng.uniform(0.85, 1.15)
        # Healthy companies: OCF roughly tracks net income (often slightly higher).
        ocf = net_income * rng.uniform(0.85, 1.4)
        receivables = revenue * rng.uniform(0.08, 0.22)
        debt = liabilities * rng.uniform(0.4, 0.7)
        cash = max(net_income * rng.uniform(0.5, 1.8), revenue * 0.05)
        cogs = revenue * rng.uniform(0.55, 0.78)
        opex = revenue * rng.uniform(0.10, 0.22)
        records.append(
            {
                "year": 2022 + year_offset,
                "sector": sector,
                "revenue": _round_money(revenue),
                "net_income": _round_money(net_income),
                "total_assets": _round_money(assets),
                "total_liabilities": _round_money(liabilities),
                "equity": _round_money(equity),
                "cash": _round_money(cash),
                "operating_cash_flow": _round_money(ocf),
                "receivables": _round_money(receivables),
                "debt": _round_money(debt),
                "cost_of_goods_sold": _round_money(cogs),
                "expenses": _round_money(opex),
                "label": 0,
            }
        )
        assets *= 1 + growth * rng.uniform(0.4, 1.0)
        leverage_ratio = max(0.2, min(0.7, leverage_ratio + rng.uniform(-0.03, 0.03)))
    return records


def _sample_manipulation_company(rng: random.Random) -> List[dict]:
    """Three years of statements with an injected manipulation pattern.

    Patterns sampled:
      1. Revenue growth far outpaces operating cash flow.
      2. Net income positive but operating cash flow negative.
      3. Receivables grow much faster than revenue.
      4. Leverage spirals; equity barely moves while debt explodes.
    """

    base_revenue = rng.uniform(10_000_000, 120_000_000)
    growth_path = [rng.uniform(0.25, 0.65) for _ in range(2)]
    net_margin = rng.uniform(0.06, 0.22)
    leverage_ratio = rng.uniform(0.55, 0.85)
    sector = rng.choice(SECTORS)
    pattern = rng.choice(["divergence", "negative_ocf", "receivables", "leverage"])

    records: List[dict] = []
    revenue = base_revenue
    assets = base_revenue * rng.uniform(0.8, 1.8)
    receivables_pct = rng.uniform(0.18, 0.32)
    for year_offset, growth in enumerate([0.0] + growth_path):
        revenue *= 1 + growth
        liabilities = assets * leverage_ratio
        equity = assets - liabilities
        net_income = revenue * net_margin * rng.uniform(0.9, 1.2)

        if pattern == "divergence":
            ocf = net_income * rng.uniform(0.0, 0.55)
        elif pattern == "negative_ocf":
            ocf = -abs(net_income) * rng.uniform(0.3, 1.2)
        elif pattern == "receivables":
            ocf = net_income * rng.uniform(0.4, 0.8)
            receivables_pct = min(0.65, receivables_pct + rng.uniform(0.05, 0.12))
        else:  # leverage
            ocf = net_income * rng.uniform(0.5, 0.9)
            leverage_ratio = min(0.95, leverage_ratio + rng.uniform(0.04, 0.09))

        receivables = revenue * receivables_pct
        debt = liabilities * rng.uniform(0.6, 0.9)
        cash = max(revenue * rng.uniform(0.01, 0.06), 50_000)
        cogs = revenue * rng.uniform(0.55, 0.8)
        opex = revenue * rng.uniform(0.12, 0.25)

        records.append(
            {
                "year": 2022 + year_offset,
                "sector": sector,
                "revenue": _round_money(revenue),
                "net_income": _round_money(net_income),
                "total_assets": _round_money(assets),
                "total_liabilities": _round_money(liabilities),
                "equity": _round_money(equity),
                "cash": _round_money(cash),
                "operating_cash_flow": _round_money(ocf if ocf >= 0 else ocf),
                "receivables": _round_money(receivables),
                "debt": _round_money(debt),
                "cost_of_goods_sold": _round_money(cogs),
                "expenses": _round_money(opex),
                "label": 1,
            }
        )
        # Allow negative OCF values to survive rounding.
        if records[-1]["operating_cash_flow"] == 0 and ocf < 0:
            records[-1]["operating_cash_flow"] = float(round(ocf, 0))
        assets *= 1 + growth * rng.uniform(0.7, 1.4)
    return records


def build_dataset(n_companies: int, seed: int) -> pd.DataFrame:
    rng = random.Random(seed)
    np.random.seed(seed)
    rows: List[dict] = []
    for cid in range(n_companies):
        is_suspect = rng.random() < 0.45
        records = (
            _sample_manipulation_company(rng)
            if is_suspect
            else _sample_normal_company(rng)
        )
        for r in records:
            r["company_id"] = f"CO_{cid:05d}"
        rows.extend(records)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=500, help="Number of distinct companies.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=str,
        default=str(Path(__file__).resolve().parent.parent / "data" / "sample_companies.csv"),
    )
    args = parser.parse_args()

    df = build_dataset(args.rows, args.seed)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"Wrote {len(df):,} rows ({df['company_id'].nunique()} companies) to {out_path}")
    print(f"Manipulation rate: {df.groupby('company_id')['label'].max().mean():.1%}")


if __name__ == "__main__":
    main()
