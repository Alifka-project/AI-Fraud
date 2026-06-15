"""LLM integration with deterministic rule-based fallback.

If ``OPENAI_API_KEY`` is set in the environment we call the OpenAI chat completions
endpoint via plain HTTP (no SDK lock-in). Any compatible endpoint can be configured
via ``OPENAI_BASE_URL`` (e.g. Azure OpenAI, Together, Groq).

When the API isn't available, ``rule_based_summary`` produces an investor-grade
narrative built directly from the ratios and detected red flags so the demo
always works.
"""

from __future__ import annotations

import json
import os
from typing import List, Tuple

import httpx

from .schemas import CompanyMetadata, FinancialRatios, RedFlag

DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_BASE = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")


def rule_based_summary(
    company: CompanyMetadata,
    risk_level: str,
    ratios: FinancialRatios,
    flags: List[RedFlag],
) -> str:
    parts: List[str] = []
    parts.append(
        f"{company.name} has been assessed at a {risk_level.lower()} fraud-risk level based on "
        "its reported financial statements."
    )

    if ratios.revenue_vs_cash_flow_growth > 0.3:
        parts.append(
            "Top concern: reported revenue is growing materially faster than operating cash "
            "flow, which historically correlates with aggressive revenue recognition."
        )
    elif ratios.cash_flow_quality > 1:
        parts.append(
            "Earnings quality is healthy — operating cash flow comfortably exceeds reported "
            "net income, which is a positive signal."
        )

    if ratios.debt_to_equity > 2.5:
        parts.append(
            f"Capital structure is heavily leveraged at {ratios.debt_to_equity:.2f}× debt-to-equity, "
            "increasing sensitivity to refinancing risk."
        )
    if 0 < ratios.altman_z_score < 1.23:
        parts.append(
            f"Altman Z-score of {ratios.altman_z_score:.2f} sits in the distress zone, "
            "signalling elevated probability of financial distress."
        )

    critical = [f for f in flags if f.severity == "critical"]
    high = [f for f in flags if f.severity == "high"]
    if critical:
        titles = "; ".join(f.title for f in critical)
        parts.append(f"Critical red flags detected: {titles}.")
    if high:
        titles = "; ".join(f.title for f in high)
        parts.append(f"High-severity flags include: {titles}.")

    parts.append(
        "Recommendation: before progressing this opportunity, request audited financial "
        "statements, bank statements, VAT filings, trade licence, and ageing schedules for "
        "receivables. Validate cash flow against bank movements rather than relying on "
        "management-prepared figures."
    )
    return " ".join(parts)


def _llm_prompt(
    company: CompanyMetadata,
    overall_score: float,
    risk_level: str,
    ratios: FinancialRatios,
    flags: List[RedFlag],
) -> str:
    return (
        "You are a forensic accounting analyst preparing a due-diligence brief for an investor "
        "in Dubai. Use only the figures provided. Do not claim the company is fraudulent — "
        "phrase concerns as risk indicators. Keep the brief under 220 words.\n\n"
        f"Company: {company.name}\n"
        f"Industry: {company.industry or 'unspecified'}\n"
        f"Location: {company.location or 'unspecified'}\n"
        f"Risk score: {overall_score:.1f} / 100 ({risk_level})\n\n"
        "Key ratios:\n"
        f"  Revenue growth: {ratios.revenue_growth*100:.1f}%\n"
        f"  Net profit margin: {ratios.net_profit_margin*100:.1f}%\n"
        f"  OCF / Net income: {ratios.ocf_to_net_income:.2f}\n"
        f"  Debt / Equity: {ratios.debt_to_equity:.2f}\n"
        f"  Receivables / Revenue: {ratios.receivables_to_revenue*100:.1f}%\n"
        f"  Beneish M-score (proxy): {ratios.beneish_m_score:.2f}\n"
        f"  Altman Z-score (proxy): {ratios.altman_z_score:.2f}\n\n"
        "Detected red flags (severity — title):\n"
        + "\n".join(f"  {f.severity.upper()} — {f.title}" for f in flags[:10])
        + "\n\nProduce: (1) a one-sentence executive verdict, (2) two-to-three sentences on "
        "the most material red flags, (3) a closing sentence with recommended next steps."
    )


def generate_summary(
    company: CompanyMetadata,
    overall_score: float,
    risk_level: str,
    ratios: FinancialRatios,
    flags: List[RedFlag],
) -> Tuple[str, str]:
    """Returns (summary_text, provider_name)."""

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return (
            rule_based_summary(company, risk_level, ratios, flags),
            "Rule-based template (no LLM key set)",
        )

    prompt = _llm_prompt(company, overall_score, risk_level, ratios, flags)
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.post(
                f"{DEFAULT_BASE.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": DEFAULT_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a careful forensic accounting analyst. Never claim "
                                "a company is fraudulent — use risk-indicator language."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 400,
                },
            )
            res.raise_for_status()
            data = res.json()
            content = data["choices"][0]["message"]["content"].strip()
            return content, f"OpenAI-compatible API ({DEFAULT_MODEL})"
    except Exception as exc:
        # Never block the analysis pipeline on LLM failures.
        fallback = rule_based_summary(company, risk_level, ratios, flags)
        return (
            f"{fallback}\n\n[LLM call failed, used rule-based fallback. Reason: {exc}]",
            "Rule-based template (LLM call failed)",
        )
