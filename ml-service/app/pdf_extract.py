"""PDF financial-statement extraction for the Python service (parity with the
Node/Vercel path).

Strategy:
  1. Extract text with pdfplumber.
  2. If OPENAI_API_KEY is set, ask the LLM to return structured records.
  3. Otherwise fall back to a heuristic label/number scanner.

The returned records use the same field names as ``FinancialRecordInput`` so the
existing inference pipeline can consume them directly.
"""

from __future__ import annotations

import io
import json
import os
import re
from typing import Dict, List, Optional, Tuple

import httpx

NUMERIC_FIELDS = [
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

# Label aliases for the heuristic scanner (most specific first).
LINE_ITEM_ALIASES: List[Tuple[str, List[str]]] = [
    ("cost_of_goods_sold", [r"cost of goods sold", r"cost of sales", r"cost of revenue", r"\bcogs\b"]),
    ("operating_cash_flow", [r"net cash (?:from|provided by|used in) operating", r"cash (?:flow )?from operations", r"operating cash flow", r"\bocf\b"]),
    ("revenue", [r"total revenue", r"net sales", r"\brevenue\b", r"\bturnover\b", r"total sales"]),
    ("net_income", [r"net income", r"net profit", r"profit for the (?:year|period)", r"(?:profit|loss) after tax", r"net earnings"]),
    ("total_assets", [r"total assets"]),
    ("total_liabilities", [r"total liabilities"]),
    ("equity", [r"total (?:shareholders|stockholders|owners)[’']? equity", r"total equity", r"shareholders[’']? equity"]),
    ("cash", [r"cash and cash equivalents", r"cash (?:&|and) equivalents", r"\bcash\b"]),
    ("receivables", [r"trade (?:and other )?receivables", r"accounts receivable", r"\breceivables\b"]),
    ("debt", [r"total (?:debt|borrowings)", r"interest[- ]bearing (?:loans|borrowings)", r"\bborrowings\b", r"long[- ]term debt"]),
    ("expenses", [r"operating expenses", r"total expenses", r"administrative expenses", r"\bopex\b"]),
]

UNIT_SCALES = [
    (re.compile(r"in '?000s?\b|in thousands|aed '?000|figures in thousands", re.I), 1_000),
    (re.compile(r"in millions|aed million|figures in millions", re.I), 1_000_000),
    (re.compile(r"in billions", re.I), 1_000_000_000),
]


def extract_pdf_text(raw: bytes) -> Tuple[str, int]:
    """Return (text, page_count). Empty text means no extractable layer."""
    try:
        import pdfplumber  # imported lazily so the service starts without it
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"pdfplumber not installed: {exc}")

    chunks: List[str] = []
    pages = 0
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        pages = len(pdf.pages)
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks), pages


def _detect_scale(text: str) -> int:
    head = text[:4000]
    for pattern, scale in UNIT_SCALES:
        if pattern.search(head):
            return scale
    return 1


def _detect_years(text: str) -> List[int]:
    """Years in statement-header (appearance) order, which equals column order."""
    lines = text.splitlines()
    year_line = None
    for line in lines:
        ys = re.findall(r"\b(?:19|20)\d{2}\b", line)
        if len(set(ys)) >= 2:
            year_line = line
            break
    source = year_line if year_line else text
    found = [int(y) for y in re.findall(r"\b(?:19|20)\d{2}\b", source)]
    found = [y for y in found if 1990 <= y <= 2100]

    ordered: List[int] = []
    seen = set()
    for y in found:
        if y not in seen:
            seen.add(y)
            ordered.append(y)
    if len(ordered) <= 4:
        return ordered
    top_four = set(sorted(ordered, reverse=True)[:4])
    return [y for y in ordered if y in top_four]


def _extract_numbers(line: str) -> List[float]:
    tokens = re.findall(r"\(?\s*-?(?:AED|USD|US\$|\$)?\s*\d[\d,]*(?:\.\d+)?\s*\)?", line, re.I)
    numbers: List[float] = []
    for tok in tokens:
        negative = "(" in tok
        cleaned = re.sub(r"[(),\s]", "", tok)
        cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
        if not cleaned or cleaned in {"-", "."}:
            continue
        try:
            n = float(cleaned)
        except ValueError:
            continue
        if n < 100 and float(n).is_integer() and "." not in cleaned:
            continue  # likely a note reference
        numbers.append(-abs(n) if negative else n)
    return numbers


def heuristic_extract(text: str) -> Tuple[List[Dict], List[str]]:
    warnings: List[str] = []
    scale = _detect_scale(text)
    if scale > 1:
        warnings.append(f"Values detected in units of {scale:,}; scaled to absolute AED.")

    years = _detect_years(text)
    if not years:
        from datetime import datetime

        years = [datetime.utcnow().year - 1]
        warnings.append("No fiscal year detected; defaulted to one column. Set the correct year.")

    year_set = set(years)
    num_columns = len(years)
    by_year = {y: {"year": y, **{f: 0.0 for f in NUMERIC_FIELDS}} for y in years}

    # Position-based span extraction: find each label in the full text and read
    # the numbers between it and the next label (robust to single-line PDFs).
    hits = []  # (field, start, end)
    for field, patterns in LINE_ITEM_ALIASES:
        best = None
        for p in patterns:
            m = re.search(p, text, re.I)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), m.end())
        if best:
            hits.append((field, best[0], best[1]))
    hits.sort(key=lambda h: h[1])

    seen = set()
    for i, (field, _start, end) in enumerate(hits):
        if field in seen:
            continue
        span_end = hits[i + 1][1] if i + 1 < len(hits) else len(text)
        span = text[end:span_end]
        nums = _extract_numbers(span)
        without_years = [n for n in nums if int(n) not in year_set]
        if len(without_years) >= num_columns:
            nums = without_years
        if not nums:
            continue
        # Column order == header order: i-th number -> i-th detected year.
        for col, value in enumerate(nums[:num_columns]):
            by_year[years[col]][field] = value * scale
        seen.add(field)

    if not seen:
        warnings.append("No recognised financial line items found. Manual entry required.")
    elif len(seen) < 5:
        warnings.append(f"Only {len(seen)} line items recognised automatically; please review.")

    records = [by_year[y] for y in sorted(by_year)]
    for r in records:
        r["cost_of_goods_sold"] = abs(r["cost_of_goods_sold"])
        r["expenses"] = abs(r["expenses"])
    return records, warnings


def llm_extract(text: str) -> Optional[Tuple[List[Dict], Optional[str], List[str]]]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    snippet = text[:18000]

    system = (
        "You are a precise financial-statement data-extraction engine. Return STRICT JSON. "
        "Never invent figures — use 0 when not found. Output absolute currency units (scale "
        "thousands/millions accordingly). Use negatives for losses and cash outflows."
    )
    user = (
        "Extract every fiscal year. Return JSON: {\"companyName\": string|null, \"currency\": "
        "string|null, \"records\": [{\"year\": number, \"revenue\": number, \"net_income\": number, "
        "\"total_assets\": number, \"total_liabilities\": number, \"equity\": number, \"cash\": number, "
        "\"operating_cash_flow\": number, \"receivables\": number, \"debt\": number, "
        "\"cost_of_goods_sold\": number, \"expenses\": number}], \"notes\": string[]}\n\n"
        f"DOCUMENT TEXT:\n```\n{snippet}\n```"
    )

    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0,
                    "max_tokens": 1500,
                    "response_format": {"type": "json_object"},
                },
            )
            res.raise_for_status()
            content = res.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] LLM PDF extraction failed: {exc}")
        return None

    raw_records = parsed.get("records", [])
    records: List[Dict] = []
    for item in raw_records:
        try:
            year = int(round(float(item.get("year", 0))))
        except (TypeError, ValueError):
            continue
        if not (1990 <= year <= 2100):
            continue
        rec = {"year": year}
        for f in NUMERIC_FIELDS:
            try:
                rec[f] = float(item.get(f, 0) or 0)
            except (TypeError, ValueError):
                rec[f] = 0.0
        # Costs are magnitudes regardless of statement sign convention.
        rec["cost_of_goods_sold"] = abs(rec["cost_of_goods_sold"])
        rec["expenses"] = abs(rec["expenses"])
        records.append(rec)

    if not records:
        return None
    notes = parsed.get("notes", []) if isinstance(parsed.get("notes"), list) else []
    return records, parsed.get("companyName"), notes


def extract_financials_from_pdf(raw: bytes) -> Tuple[List[Dict], List[str], str, Optional[str]]:
    """Return (records, warnings, method, detected_company_name)."""
    text, _pages = extract_pdf_text(raw)
    if not text.strip():
        return [], ["No text layer found (scanned image?). OCR is not enabled."], "pdf-empty", None

    llm = llm_extract(text)
    if llm is not None:
        records, company, notes = llm
        warnings = [
            "Figures extracted by AI from the PDF — verify against the source before relying on them.",
            *notes,
        ]
        return records, warnings, "pdf-llm", company

    records, warnings = heuristic_extract(text)
    warnings.insert(0, "Figures extracted by a rule-based parser (no AI key). Review carefully.")
    return records, warnings, "pdf-heuristic", None
