"""Rule-based red-flag detection layered on top of the ratio engine."""

from __future__ import annotations

from typing import List

import pandas as pd

from .schemas import FinancialRatios, RedFlag


def detect_red_flags(df: pd.DataFrame, ratios: FinancialRatios) -> List[RedFlag]:
    flags: List[RedFlag] = []
    if df.empty:
        return flags
    current = df.iloc[-1]

    if ratios.revenue_growth > 0.1 and ratios.revenue_vs_cash_flow_growth > 0.3:
        flags.append(
            RedFlag(
                code="REVENUE_CASH_DIVERGENCE",
                title="Revenue grew while operating cash flow lagged badly",
                severity="high",
                description=(
                    "Reported revenue is increasing significantly faster than operating "
                    "cash flow. A classic earnings-quality red flag and often indicative "
                    "of aggressive revenue recognition or growth funded by uncollected "
                    "receivables."
                ),
                metric="Revenue growth - OCF growth",
                metric_value=ratios.revenue_vs_cash_flow_growth,
            )
        )

    if current.net_income > 0 and current.operating_cash_flow < 0:
        flags.append(
            RedFlag(
                code="POSITIVE_NI_NEGATIVE_OCF",
                title="Positive net income but negative operating cash flow",
                severity="critical",
                description=(
                    "The company reports profit while burning cash from operations. "
                    "This decoupling of accrual earnings from real cash is one of the "
                    "most reliable single indicators of statement manipulation."
                ),
                metric="Operating cash flow (AED)",
                metric_value=float(current.operating_cash_flow),
            )
        )

    if ratios.receivables_growth_vs_revenue_growth > 0.2:
        flags.append(
            RedFlag(
                code="RECEIVABLES_OUTPACE_REVENUE",
                title="Receivables growing faster than revenue",
                severity="high",
                description=(
                    "Accounts receivable are expanding ahead of underlying sales — often "
                    "a precursor to a write-off or evidence of recognising revenue that "
                    "has not yet been collected."
                ),
                metric="Receivables growth - Revenue growth",
                metric_value=ratios.receivables_growth_vs_revenue_growth,
            )
        )

    if ratios.debt_to_equity > 2.5:
        flags.append(
            RedFlag(
                code="HIGH_LEVERAGE",
                title="Debt-to-equity is unusually high",
                severity="critical" if ratios.debt_to_equity > 4 else "high",
                description=(
                    f"Debt-to-equity of {ratios.debt_to_equity:.2f}× implies the company is "
                    "heavily creditor-financed and is more sensitive to interest-rate "
                    "shocks or refinancing risk."
                ),
                metric="Debt / Equity",
                metric_value=ratios.debt_to_equity,
            )
        )

    if 0 < ratios.current_ratio < 1:
        flags.append(
            RedFlag(
                code="LIQUIDITY_RISK",
                title="Current ratio below safe threshold",
                severity="medium",
                description=(
                    "Estimated current assets do not cover short-term liabilities, "
                    "suggesting potential difficulty meeting near-term obligations."
                ),
                metric="Current ratio",
                metric_value=ratios.current_ratio,
            )
        )

    if len(df) >= 2:
        prior = df.iloc[-2]
        prior_margin = prior.net_income / prior.revenue if prior.revenue else 0
        change = ratios.net_profit_margin - prior_margin
        if abs(change) > 0.08:
            flags.append(
                RedFlag(
                    code="ABNORMAL_MARGIN_CHANGE",
                    title=(
                        "Net profit margin jumped abnormally year-over-year"
                        if change > 0
                        else "Net profit margin collapsed year-over-year"
                    ),
                    severity="medium",
                    description=(
                        f"Net profit margin moved by {change * 100:.1f} percentage points versus "
                        "the prior year. Step-changes that large are uncommon without a "
                        "one-off item and should be explained in the management narrative."
                    ),
                    metric="Net margin change",
                    metric_value=change,
                )
            )

    if len(df) >= 2:
        prior = df.iloc[-2]
        asset_growth = (current.total_assets - prior.total_assets) / max(prior.total_assets, 1)
        if asset_growth > ratios.revenue_growth + 0.2 and ratios.revenue_growth > 0:
            flags.append(
                RedFlag(
                    code="ASSETS_OUTPACE_REVENUE",
                    title="Total assets growing faster than revenue",
                    severity="medium",
                    description=(
                        "Asset base is expanding much faster than the revenue it generates "
                        "— often a sign of inefficient capital deployment or asset inflation "
                        "on the balance sheet."
                    ),
                    metric="Asset growth - Revenue growth",
                    metric_value=asset_growth - ratios.revenue_growth,
                )
            )

    if ratios.cash_flow_quality < 0.5 and ratios.net_profit_margin > 0.05:
        flags.append(
            RedFlag(
                code="WEAK_CASH_FLOW_QUALITY",
                title="Earnings not backed by operating cash",
                severity="high",
                description=(
                    "Operating cash flow covers less than half of reported net income. "
                    "Earnings quality is poor and may not be sustainable."
                ),
                metric="OCF / Net income",
                metric_value=ratios.ocf_to_net_income,
            )
        )

    missing = []
    if not current.operating_cash_flow:
        missing.append("operating cash flow")
    if not current.receivables:
        missing.append("receivables")
    if not current.debt:
        missing.append("debt")
    if missing:
        flags.append(
            RedFlag(
                code="MISSING_FIELDS",
                title=f"Key financial fields missing: {', '.join(missing)}",
                severity="medium",
                description=(
                    "Critical figures are zero or absent. The analysis falls back to "
                    "conservative defaults; request audited statements before proceeding."
                ),
            )
        )

    if 0 < ratios.altman_z_score < 1.23:
        flags.append(
            RedFlag(
                code="ALTMAN_DISTRESS",
                title="Altman Z-score in the distress zone",
                severity="high",
                description=(
                    f"Altman Z-score of {ratios.altman_z_score:.2f} is below the 1.23 distress "
                    "threshold for private firms."
                ),
                metric="Altman Z-Score",
                metric_value=ratios.altman_z_score,
            )
        )

    if ratios.beneish_m_score > -1.78:
        flags.append(
            RedFlag(
                code="BENEISH_FLAG",
                title="Beneish-style indicator elevated",
                severity="high" if ratios.beneish_m_score > -1.0 else "medium",
                description=(
                    f"Beneish M-Score proxy of {ratios.beneish_m_score:.2f} is above the "
                    "-1.78 threshold, suggesting heightened statement-manipulation risk."
                ),
                metric="Beneish M-Score (proxy)",
                metric_value=ratios.beneish_m_score,
            )
        )

    return flags
