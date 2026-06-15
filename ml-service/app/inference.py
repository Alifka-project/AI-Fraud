"""Inference pipeline: load (or fall back) trained models, run all signals,
produce the full ``RiskAssessmentResult`` consumed by the frontend."""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import joblib
import numpy as np

from .feature_engine import (
    FEATURE_COLUMNS,
    compute_ratios,
    ratios_to_feature_vector,
    records_to_dataframe,
)
from .llm import generate_summary
from .red_flags import detect_red_flags
from .scoring import (
    aggregate,
    document_score,
    external_score,
    heuristic_anomaly_score,
    heuristic_ml_probability,
    liquidity_score,
    manipulation_score,
    risk_level_from_score,
)
from .schemas import (
    AnalysisRequest,
    ComponentScores,
    FeatureImportance,
    FinancialRatios,
    ModelInfo,
    RedFlag,
    RiskAssessmentResult,
)


MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
FRAUD_MODEL_PATH = MODELS_DIR / "fraud_model.joblib"
ANOMALY_MODEL_PATH = MODELS_DIR / "anomaly_model.joblib"


class ModelHolder:
    """Lazy-load models so the service starts even when artifacts are absent."""

    def __init__(self) -> None:
        self._fraud = None
        self._anomaly = None
        self._explainer = None
        self.fraud_label = "Heuristic logistic (no trained model)"
        self.anomaly_label = "Centroid-distance heuristic (no trained model)"
        self.explainer_label = "Weighted feature contributions (no SHAP)"
        self._loaded = False

    def load(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        if FRAUD_MODEL_PATH.exists():
            try:
                bundle = joblib.load(FRAUD_MODEL_PATH)
                self._fraud = bundle.get("model") or bundle  # support dict or bare estimator
                if isinstance(bundle, dict):
                    self.fraud_label = bundle.get("name", "Trained classifier (joblib)")
                else:
                    self.fraud_label = type(self._fraud).__name__
                try:
                    import shap  # type: ignore

                    self._explainer = shap.TreeExplainer(self._fraud)
                    self.explainer_label = "SHAP TreeExplainer"
                except Exception:
                    self.explainer_label = "Feature importance (model.feature_importances_)"
            except Exception as exc:  # noqa: BLE001
                print(f"[WARN] Failed to load fraud model: {exc}")
                self._fraud = None

        if ANOMALY_MODEL_PATH.exists():
            try:
                bundle = joblib.load(ANOMALY_MODEL_PATH)
                self._anomaly = bundle.get("model") or bundle
                self.anomaly_label = (
                    bundle.get("name", "Isolation Forest (joblib)")
                    if isinstance(bundle, dict)
                    else type(self._anomaly).__name__
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[WARN] Failed to load anomaly model: {exc}")
                self._anomaly = None

    @property
    def fraud(self):
        self.load()
        return self._fraud

    @property
    def anomaly(self):
        self.load()
        return self._anomaly

    @property
    def explainer(self):
        self.load()
        return self._explainer


_HOLDER = ModelHolder()


def _ml_probability(ratios: FinancialRatios, flags: List[RedFlag]) -> float:
    model = _HOLDER.fraud
    if model is None:
        return heuristic_ml_probability(ratios, flags)
    x = ratios_to_feature_vector(ratios).reshape(1, -1)
    try:
        proba = model.predict_proba(x)[0]
        # Assume class 1 == manipulation/fraud-like.
        return float(proba[1] if len(proba) > 1 else proba[0])
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] ML predict failed: {exc}. Using heuristic.")
        return heuristic_ml_probability(ratios, flags)


def _anomaly_value(ratios: FinancialRatios) -> float:
    model = _HOLDER.anomaly
    if model is None:
        return heuristic_anomaly_score(ratios)
    x = ratios_to_feature_vector(ratios).reshape(1, -1)
    try:
        # Isolation Forest: score_samples > 0 ≈ normal, < 0 ≈ anomalous.
        raw = float(model.score_samples(x)[0])
        # Map to [0, 1] where 1 = highly anomalous.
        scaled = 1 / (1 + math.exp(2.5 * raw))
        return max(0.0, min(1.0, scaled))
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] Anomaly model failed: {exc}. Using heuristic.")
        return heuristic_anomaly_score(ratios)


def _feature_importance(
    ratios: FinancialRatios, flags: List[RedFlag]
) -> List[FeatureImportance]:
    # Default heuristic contributions used if SHAP isn't available.
    default = [
        FeatureImportance(
            feature="Revenue vs cash-flow growth divergence",
            importance=min(abs(ratios.revenue_vs_cash_flow_growth) * 100, 100),
            direction="increase_risk" if ratios.revenue_vs_cash_flow_growth > 0 else "decrease_risk",
            value=ratios.revenue_vs_cash_flow_growth,
        ),
        FeatureImportance(
            feature="Receivables growth vs revenue growth",
            importance=min(abs(ratios.receivables_growth_vs_revenue_growth) * 100, 100),
            direction=(
                "increase_risk"
                if ratios.receivables_growth_vs_revenue_growth > 0
                else "decrease_risk"
            ),
            value=ratios.receivables_growth_vs_revenue_growth,
        ),
        FeatureImportance(
            feature="Operating cash flow / net income",
            importance=min(abs(1.2 - ratios.cash_flow_quality) * 35, 100),
            direction="increase_risk" if ratios.cash_flow_quality < 1 else "decrease_risk",
            value=ratios.cash_flow_quality,
        ),
        FeatureImportance(
            feature="Debt / Equity",
            importance=min(abs(ratios.debt_to_equity - 0.8) * 18, 100),
            direction="increase_risk" if ratios.debt_to_equity > 1.5 else "decrease_risk",
            value=ratios.debt_to_equity,
        ),
        FeatureImportance(
            feature="Receivables / Revenue",
            importance=min(abs(ratios.receivables_to_revenue - 0.18) * 200, 100),
            direction=(
                "increase_risk" if ratios.receivables_to_revenue > 0.25 else "decrease_risk"
            ),
            value=ratios.receivables_to_revenue,
        ),
        FeatureImportance(
            feature="Net profit margin",
            importance=min(abs(ratios.net_profit_margin - 0.1) * 200, 100),
            direction="increase_risk" if ratios.net_profit_margin < 0.02 else "decrease_risk",
            value=ratios.net_profit_margin,
        ),
        FeatureImportance(
            feature="Beneish M-Score (proxy)",
            importance=min(abs(ratios.beneish_m_score + 1.78) * 25, 100),
            direction="increase_risk" if ratios.beneish_m_score > -1.78 else "decrease_risk",
            value=ratios.beneish_m_score,
        ),
        FeatureImportance(
            feature="Altman Z-Score (proxy)",
            importance=min(abs(ratios.altman_z_score - 2.6) * 25, 100),
            direction="increase_risk" if ratios.altman_z_score < 1.81 else "decrease_risk",
            value=ratios.altman_z_score,
        ),
        FeatureImportance(
            feature="Red-flag rule hits",
            importance=min(len(flags) * 12, 100),
            direction="increase_risk",
            value=float(len(flags)),
        ),
    ]
    default.sort(key=lambda f: f.importance, reverse=True)

    # Override with real SHAP values when available.
    explainer = _HOLDER.explainer
    model = _HOLDER.fraud
    if explainer is None or model is None:
        return default[:8]

    try:
        x = ratios_to_feature_vector(ratios).reshape(1, -1)
        shap_values = explainer.shap_values(x)
        # For binary models, shap_values is sometimes returned per-class; normalise.
        if isinstance(shap_values, list):
            shap_values = shap_values[-1]
        shap_row = np.asarray(shap_values).reshape(-1)
        items: List[Tuple[str, float, float]] = []
        for name, value, contrib in zip(
            FEATURE_COLUMNS, ratios_to_feature_vector(ratios), shap_row
        ):
            items.append((name, float(value), float(contrib)))
        items.sort(key=lambda t: abs(t[2]), reverse=True)
        top = items[:8]
        max_mag = max((abs(c) for _, _, c in top), default=1.0)
        return [
            FeatureImportance(
                feature=name.replace("_", " ").capitalize(),
                importance=min(abs(contrib) / max_mag * 100, 100),
                direction="increase_risk" if contrib > 0 else "decrease_risk",
                value=value,
            )
            for name, value, contrib in top
        ]
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] SHAP computation failed: {exc}. Using heuristic importances.")
        return default[:8]


def run_analysis(payload: AnalysisRequest) -> RiskAssessmentResult:
    records = [r.model_dump() for r in payload.records]
    df = records_to_dataframe(records)
    ratios = compute_ratios(df)
    flags = detect_red_flags(df, ratios)

    ml_prob = _ml_probability(ratios, flags)
    anomaly = _anomaly_value(ratios)

    components = ComponentScores(
        manipulation=manipulation_score(ratios, flags),
        liquidity=liquidity_score(ratios),
        ml_model=round(ml_prob * 100, 1),
        anomaly=round(anomaly * 100, 1),
        document=document_score(flags, ratios),
        external=external_score(bool(payload.company.notes)),
    )

    overall = round(aggregate(components), 1)
    level = risk_level_from_score(overall)

    summary, provider = generate_summary(payload.company, overall, level, ratios, flags)

    return RiskAssessmentResult(
        overall_score=overall,
        risk_level=level,
        ml_fraud_probability=round(ml_prob, 4),
        anomaly_score=round(anomaly, 4),
        component_scores=components,
        ratios=ratios,
        red_flags=flags,
        feature_importance=_feature_importance(ratios, flags),
        llm_summary=summary,
        company=payload.company,
        records=payload.records,
        generated_at=datetime.now(timezone.utc).isoformat(),
        model_info=ModelInfo(
            classifier=_HOLDER.fraud_label,
            anomaly_detector=_HOLDER.anomaly_label,
            llm_provider=provider,
            explainability=_HOLDER.explainer_label,
        ),
    )
