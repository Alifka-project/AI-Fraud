"""Financial ratio and forensic indicator engine.

Pure functions; no model loading happens here so this module can be imported
both from the FastAPI service and from training scripts.
"""

from __future__ import annotations

from typing import Iterable, List

import numpy as np
import pandas as pd

from .schemas import FinancialRatios


# Canonical column order used throughout the project.
RECORD_COLUMNS = [
    "year",
    "revenue",
    "net_income",
    "total_assets",
    "total_liabilities",
    "equity",
    "cash",
    "operating_cash_flow",
    "receivables",
    "debt",
    "cost_of_goods_sold",
    "expenses",
]


# Order of the engineered feature vector used by the ML model.
FEATURE_COLUMNS: List[str] = [
    "revenue_growth",
    "net_profit_margin",
    "gross_margin",
    "current_ratio",
    "debt_to_equity",
    "return_on_assets",
    "return_on_equity",
    "ocf_to_net_income",
    "receivables_to_revenue",
    "asset_turnover",
    "leverage_ratio",
    "cash_flow_quality",
    "revenue_vs_cash_flow_growth",
    "receivables_growth_vs_revenue_growth",
    "beneish_m_score",
    "altman_z_score",
]


def _safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    if not np.isfinite(a) or not np.isfinite(b) or b == 0:
        return fallback
    return float(a / b)


def _clamp(v: float, low: float, high: float) -> float:
    return float(max(low, min(high, v)))


def records_to_dataframe(records: Iterable[dict]) -> pd.DataFrame:
    df = pd.DataFrame(list(records))
    if df.empty:
        return pd.DataFrame(columns=RECORD_COLUMNS)
    for col in RECORD_COLUMNS:
        if col not in df.columns:
            df[col] = 0.0
    df = df[RECORD_COLUMNS]
    df["year"] = df["year"].astype(int)
    df = df.sort_values("year").reset_index(drop=True)
    return df


def compute_ratios(df: pd.DataFrame) -> FinancialRatios:
    """Compute the canonical 16-feature ratio vector from sorted yearly records."""

    if df.empty:
        return FinancialRatios(
            revenue_growth=0.0,
            net_profit_margin=0.0,
            gross_margin=0.0,
            current_ratio=0.0,
            debt_to_equity=0.0,
            return_on_assets=0.0,
            return_on_equity=0.0,
            ocf_to_net_income=0.0,
            receivables_to_revenue=0.0,
            asset_turnover=0.0,
            leverage_ratio=0.0,
            cash_flow_quality=0.0,
            revenue_vs_cash_flow_growth=0.0,
            receivables_growth_vs_revenue_growth=0.0,
            beneish_m_score=0.0,
            altman_z_score=0.0,
        )

    current = df.iloc[-1]
    prior = df.iloc[-2] if len(df) > 1 else current

    revenue_growth = _safe_div(current.revenue - prior.revenue, abs(prior.revenue) or 1)
    ocf_growth = _safe_div(
        current.operating_cash_flow - prior.operating_cash_flow,
        abs(prior.operating_cash_flow) or 1,
    )
    receivables_growth = _safe_div(
        current.receivables - prior.receivables, abs(prior.receivables) or 1
    )

    net_profit_margin = _safe_div(current.net_income, current.revenue)
    gross_margin = _safe_div(current.revenue - current.cost_of_goods_sold, current.revenue)
    current_liab_proxy = max(
        current.total_liabilities - current.debt,
        current.total_liabilities * 0.4,
    )
    current_assets_proxy = current.cash + current.receivables + max(current.total_assets * 0.15, 0)
    current_ratio = _safe_div(current_assets_proxy, current_liab_proxy)
    debt_to_equity = _safe_div(current.debt, current.equity)
    return_on_assets = _safe_div(current.net_income, current.total_assets)
    return_on_equity = _safe_div(current.net_income, current.equity)
    ocf_to_net_income = _safe_div(current.operating_cash_flow, current.net_income)
    receivables_to_revenue = _safe_div(current.receivables, current.revenue)
    asset_turnover = _safe_div(current.revenue, current.total_assets)
    leverage_ratio = _safe_div(current.total_liabilities, current.total_assets)

    cash_flow_quality = _clamp(ocf_to_net_income, -2, 3)

    beneish_m_score = (
        -2.5
        + 0.92 * receivables_to_revenue
        + 0.4 * leverage_ratio
        + 1.5 * max(0.0, revenue_growth - max(ocf_growth, 0.0))
        + 0.8 * max(0.0, receivables_growth - revenue_growth)
    )

    working_capital = current_assets_proxy - current_liab_proxy
    retained_earnings_proxy = current.equity * 0.6
    ebit_proxy = current.net_income + max(current.debt * 0.06, 0)

    altman_z_score = (
        0.717 * _safe_div(working_capital, current.total_assets)
        + 0.847 * _safe_div(retained_earnings_proxy, current.total_assets)
        + 3.107 * _safe_div(ebit_proxy, current.total_assets)
        + 0.42 * _safe_div(current.equity, current.total_liabilities)
        + 0.998 * asset_turnover
    )

    return FinancialRatios(
        revenue_growth=revenue_growth,
        net_profit_margin=net_profit_margin,
        gross_margin=gross_margin,
        current_ratio=current_ratio,
        debt_to_equity=debt_to_equity,
        return_on_assets=return_on_assets,
        return_on_equity=return_on_equity,
        ocf_to_net_income=ocf_to_net_income,
        receivables_to_revenue=receivables_to_revenue,
        asset_turnover=asset_turnover,
        leverage_ratio=leverage_ratio,
        cash_flow_quality=cash_flow_quality,
        revenue_vs_cash_flow_growth=revenue_growth - ocf_growth,
        receivables_growth_vs_revenue_growth=receivables_growth - revenue_growth,
        beneish_m_score=beneish_m_score,
        altman_z_score=altman_z_score,
    )


def ratios_to_feature_vector(ratios: FinancialRatios) -> np.ndarray:
    """Order-preserving 1-D numpy array matching FEATURE_COLUMNS."""
    return np.array([getattr(ratios, c) for c in FEATURE_COLUMNS], dtype=float)
