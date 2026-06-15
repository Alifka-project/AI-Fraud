"""Risk scoring engine.

The overall risk score is a weighted blend of six signals:

    manipulation .... 30%
    liquidity ....... 20%
    ml_model ........ 20%
    anomaly ......... 10%
    document ........ 15%
    external ........  5%

Each component is clamped to [0, 100] before the weighted sum.
"""

from __future__ import annotations

from typing import List, Tuple

import numpy as np

from .schemas import ComponentScores, FinancialRatios, RedFlag


COMPONENT_WEIGHTS = {
    "manipulation": 0.30,
    "liquidity": 0.20,
    "ml_model": 0.20,
    "anomaly": 0.10,
    "document": 0.15,
    "external": 0.05,
}


def _clamp(v: float, low: float = 0.0, high: float = 100.0) -> float:
    return float(max(low, min(high, v)))


def manipulation_score(ratios: FinancialRatios, flags: List[RedFlag]) -> float:
    s = 0.0
    s += _clamp(max(0.0, ratios.revenue_vs_cash_flow_growth) * 60, 0, 30)
    s += _clamp(max(0.0, ratios.receivables_growth_vs_revenue_growth) * 50, 0, 25)
    s += _clamp(max(0.0, ratios.beneish_m_score + 2.0) * 18, 0, 25)
    s += sum(8 for f in flags if f.severity == "critical")
    s += sum(5 for f in flags if f.severity == "high")
    return _clamp(s)


def liquidity_score(ratios: FinancialRatios) -> float:
    s = 0.0
    if ratios.current_ratio < 1:
        s += (1 - ratios.current_ratio) * 40
    if ratios.debt_to_equity > 1.5:
        s += _clamp((ratios.debt_to_equity - 1.5) * 20, 0, 40)
    if ratios.cash_flow_quality < 1:
        s += (1 - ratios.cash_flow_quality) * 25
    if ratios.altman_z_score < 1.81:
        s += _clamp((1.81 - ratios.altman_z_score) * 12, 0, 25)
    return _clamp(s)


def document_score(flags: List[RedFlag], ratios: FinancialRatios) -> float:
    # Document/consistency proxy: any red flag bumps document risk because the
    # narrative will need to explain the inconsistency.
    s = 40.0
    s += len(flags) * 4
    if abs(ratios.revenue_vs_cash_flow_growth) > 0.3:
        s += 10
    if any(f.code == "MISSING_FIELDS" for f in flags):
        s += 15
    return _clamp(s)


def external_score(has_notes: bool) -> float:
    # Placeholder. Lower if the analyst supplied notes (mild reduction).
    base = 40.0
    return _clamp(base - (5 if has_notes else 0))


def aggregate(components: ComponentScores) -> float:
    return _clamp(
        components.manipulation * COMPONENT_WEIGHTS["manipulation"]
        + components.liquidity * COMPONENT_WEIGHTS["liquidity"]
        + components.ml_model * COMPONENT_WEIGHTS["ml_model"]
        + components.anomaly * COMPONENT_WEIGHTS["anomaly"]
        + components.document * COMPONENT_WEIGHTS["document"]
        + components.external * COMPONENT_WEIGHTS["external"]
    )


def risk_level_from_score(score: float) -> str:
    if score <= 30:
        return "LOW"
    if score <= 60:
        return "MEDIUM"
    if score <= 80:
        return "HIGH"
    return "CRITICAL"


def heuristic_ml_probability(ratios: FinancialRatios, flags: List[RedFlag]) -> float:
    """Used when the trained XGBoost model isn't available.

    Deterministic logistic-style function over the same feature space the model
    would consume, so the demo behaves consistently with or without the model.
    """
    z = (
        -1.5
        + 1.2 * max(0.0, ratios.revenue_vs_cash_flow_growth)
        + 1.4 * max(0.0, ratios.receivables_growth_vs_revenue_growth)
        + 0.9 * max(0.0, ratios.beneish_m_score + 1.5)
        + 0.6 * max(0.0, ratios.leverage_ratio - 0.6)
        + 0.5 * sum(1 for f in flags if f.severity == "critical")
        + 0.3 * sum(1 for f in flags if f.severity == "high")
    )
    return float(1 / (1 + np.exp(-z)))


def heuristic_anomaly_score(ratios: FinancialRatios) -> float:
    """Centroid-distance proxy returned in [0, 1]."""
    targets = {
        "net_profit_margin": 0.10,
        "cash_flow_quality": 1.2,
        "debt_to_equity": 0.8,
        "receivables_to_revenue": 0.18,
        "current_ratio": 1.6,
    }
    dist = (
        abs(ratios.net_profit_margin - targets["net_profit_margin"]) * 60
        + abs(ratios.cash_flow_quality - targets["cash_flow_quality"]) * 18
        + abs(ratios.debt_to_equity - targets["debt_to_equity"]) * 12
        + abs(ratios.receivables_to_revenue - targets["receivables_to_revenue"]) * 90
        + abs(ratios.current_ratio - targets["current_ratio"]) * 10
    )
    return float(_clamp(dist) / 100.0)
