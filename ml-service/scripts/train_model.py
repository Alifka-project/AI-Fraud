"""Train the InvestorShield fraud classifier.

Pipeline:
  1. Load the synthetic dataset produced by ``generate_sample_data.py``.
  2. Engineer the canonical 16-feature ratio vector per company.
  3. Train Logistic Regression, Random Forest, and XGBoost.
  4. Evaluate each on a held-out test split.
  5. Persist the best-by-ROC-AUC model to ``ml-service/models/fraud_model.joblib``.

Usage:
    python -m ml_service.scripts.train_model \
        --data data/sample_companies.csv \
        --out  models/fraud_model.joblib
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier  # type: ignore

    _HAS_XGB = True
except Exception:  # noqa: BLE001
    _HAS_XGB = False
    XGBClassifier = None  # type: ignore

# Import the shared feature engine.
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.feature_engine import FEATURE_COLUMNS, compute_ratios, records_to_dataframe  # noqa: E402


def build_feature_table(df: pd.DataFrame) -> Tuple[pd.DataFrame, np.ndarray]:
    """Compute one ratio row per company (using its latest available year)."""
    rows = []
    labels = []
    for company_id, group in df.groupby("company_id"):
        records = group[[
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
        ]].to_dict("records")
        ratios = compute_ratios(records_to_dataframe(records))
        rows.append({"company_id": company_id, **ratios.model_dump()})
        labels.append(int(group["label"].max()))
    feat_df = pd.DataFrame(rows).set_index("company_id")
    return feat_df[FEATURE_COLUMNS], np.array(labels, dtype=int)


def evaluate(name: str, model, X_test, y_test) -> Dict[str, float]:
    preds = model.predict(X_test)
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_test)[:, 1]
    else:
        proba = model.decision_function(X_test)
    metrics = {
        "accuracy": float(accuracy_score(y_test, preds)),
        "precision": float(precision_score(y_test, preds, zero_division=0)),
        "recall": float(recall_score(y_test, preds, zero_division=0)),
        "f1": float(f1_score(y_test, preds, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, proba)),
    }
    print(f"\n== {name} ==")
    print(json.dumps(metrics, indent=2))
    print(classification_report(y_test, preds, digits=3))
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        type=str,
        default=str(Path(__file__).resolve().parent.parent / "data" / "sample_companies.csv"),
    )
    parser.add_argument(
        "--out",
        type=str,
        default=str(Path(__file__).resolve().parent.parent / "models" / "fraud_model.joblib"),
    )
    parser.add_argument("--test-size", type=float, default=0.25)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        raise SystemExit(
            f"Dataset {data_path} not found. Run generate_sample_data.py first."
        )
    df = pd.read_csv(data_path)
    print(f"Loaded {len(df):,} rows for {df['company_id'].nunique()} companies from {data_path}")

    X, y = build_feature_table(df)
    print(f"Feature matrix: {X.shape}, positive rate: {y.mean():.2%}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )

    # Scaler is only needed for logistic regression; tree-based models ignore scale.
    scaler = StandardScaler().fit(X_train)
    X_train_scaled = scaler.transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    lr = LogisticRegression(max_iter=1000, class_weight="balanced")
    lr.fit(X_train_scaled, y_train)
    lr_metrics = evaluate("Logistic Regression (baseline)", lr, X_test_scaled, y_test)

    rf = RandomForestClassifier(
        n_estimators=400,
        max_depth=8,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=args.seed,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    rf_metrics = evaluate("Random Forest", rf, X_test, y_test)

    best_name = "Random Forest"
    best_model = rf
    best_metrics = rf_metrics

    if _HAS_XGB:
        xgb = XGBClassifier(
            n_estimators=500,
            learning_rate=0.05,
            max_depth=5,
            min_child_weight=3,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=1.0,
            objective="binary:logistic",
            eval_metric="auc",
            random_state=args.seed,
            n_jobs=-1,
            scale_pos_weight=float((y_train == 0).sum() / max((y_train == 1).sum(), 1)),
        )
        xgb.fit(X_train, y_train)
        xgb_metrics = evaluate("XGBoost", xgb, X_test, y_test)
        if xgb_metrics["roc_auc"] >= best_metrics["roc_auc"]:
            best_name = "XGBoost"
            best_model = xgb
            best_metrics = xgb_metrics
    else:
        xgb_metrics = None
        print("\nXGBoost not installed; skipping. Install with `pip install xgboost`.")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "name": best_name,
        "model": best_model,
        "features": FEATURE_COLUMNS,
        "metrics": best_metrics,
        "all_metrics": {
            "logistic_regression": lr_metrics,
            "random_forest": rf_metrics,
            "xgboost": xgb_metrics,
        },
    }
    joblib.dump(bundle, out_path)
    print(f"\nBest model: {best_name} (ROC-AUC {best_metrics['roc_auc']:.4f})")
    print(f"Saved to: {out_path}")


if __name__ == "__main__":
    main()
