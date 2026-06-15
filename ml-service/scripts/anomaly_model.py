"""Train the InvestorShield Isolation Forest anomaly detector.

The detector is fitted on the *normal* (label == 0) subset of the synthetic
dataset so that it learns the shape of healthy companies. At inference time we
use ``score_samples`` and map it into ``[0, 1]``.

Usage:
    python -m ml_service.scripts.anomaly_model \
        --data data/sample_companies.csv \
        --out  models/anomaly_model.joblib
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.feature_engine import FEATURE_COLUMNS  # noqa: E402
from scripts.train_model import build_feature_table  # noqa: E402


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
        default=str(
            Path(__file__).resolve().parent.parent / "models" / "anomaly_model.joblib"
        ),
    )
    parser.add_argument("--contamination", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    print(f"Loaded {len(df):,} rows for {df['company_id'].nunique()} companies.")

    X, y = build_feature_table(df)
    normal_X = X[y == 0]
    print(f"Training Isolation Forest on {len(normal_X)} normal companies.")

    model = IsolationForest(
        n_estimators=300,
        contamination=args.contamination,
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(normal_X)

    # Quick sanity check across the full set.
    scores_normal = model.score_samples(X[y == 0])
    scores_suspect = model.score_samples(X[y == 1])
    print(
        f"Avg score (normal): {scores_normal.mean():.3f}  "
        f"Avg score (suspect): {scores_suspect.mean():.3f}  "
        f"(higher = more normal)"
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "name": "Isolation Forest",
            "model": model,
            "features": FEATURE_COLUMNS,
            "trained_on": int((y == 0).sum()),
            "contamination": args.contamination,
        },
        out_path,
    )
    print(f"Saved anomaly model to: {out_path}")


if __name__ == "__main__":
    main()
