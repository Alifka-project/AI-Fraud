"""Recursive Language Model (RLM) — Python port for the FastAPI service.

Mirrors src/lib/rlm.ts: recursively decompose a long filing into sections,
analyse each (recursing when a section is too large), then recursively reduce
the partial findings into one due-diligence synthesis. The Python service uses
the deterministic forensic analyzer (the Node edge layer carries the LLM RLM),
which keeps the heavy ML container dependency-free and fast.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

SEVERITY_WEIGHT = {"critical": 35, "high": 20, "medium": 10, "low": 4}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}

COMPONENT_WEIGHTS = {
    "manipulation": 0.30,
    "liquidity": 0.20,
    "ml_model": 0.20,
    "anomaly": 0.10,
    "document": 0.15,
    "external": 0.05,
}

# (code, title, severity, regex, guard_negation, exclude_regex)
QUALITATIVE_RULES = [
    ("GOING_CONCERN", "Going-concern doubt referenced", "critical",
     r"substantial doubt[\s\S]{0,140}going concern|going concern[\s\S]{0,80}(?:substantial doubt|material uncertaint)", False, None),
    ("RESTATEMENT", "Restatement / prior-period revision", "high",
     r"restat(?:e|ed|ement)|previously (?:issued|reported) financial statements", True, r"conform|reclassif|presentation|rounding|immaterial"),
    ("MATERIAL_WEAKNESS", "Internal-control weakness", "high",
     r"(?:identified|concluded|disclosed|determined|existence of|remediat(?:e|ing|ion of))(?:\s+\w+){0,6}\s+material weakness|material weakness(?:es)?\s+(?:exist|was identified|were identified|in our internal control|relating to)", True, None),
    ("AUDITOR_CHANGE", "Change of auditor", "high",
     r"(?:resignation|dismissal) of (?:the )?(?:independent )?(?:registered )?(?:public accounting firm|auditor)|(?:changed|replaced|dismissed) (?:its |our )?(?:independent )?auditor", True, None),
    ("COVENANT", "Debt covenant breach / waiver", "high",
     r"covenants?\s+(?:breach|violation|default|waiver)|(?:breach(?:ed|es)?|violat(?:ed|ion)|default(?:ed)?|waiv(?:ed|er))(?:\s+[\w’']+){0,4}\s+covenants?", True, None),
    ("RELATED_PARTY", "Related-party transactions", "high",
     r"related[- ]part(?:y|ies)\s+transactions?|transactions? with (?:a )?related part", False, None),
    ("IMPAIRMENT", "Impairment / write-down", "medium",
     r"impairment (?:charge|loss)|goodwill impairment|write[- ]?(?:down|off) of", True, None),
    ("LITIGATION", "Material litigation / legal proceedings", "medium",
     r"(?:subject to|pending|ongoing|party to|defendant in|facing|named in)\s+(?:various |certain |material )?(?:litigation|lawsuits?|legal proceedings?|claims and legal)|class action|antitrust (?:lawsuit|litigation|claim|matter)|received a subpoena|securities (?:fraud )?class", False, None),
    ("REVENUE_RECOGNITION", "Revenue-recognition complexity", "medium",
     r"bill[- ]and[- ]hold|channel stuffing|percentage[- ]of[- ]completion|side (?:letter|agreement)|aggressive revenue", False, None),
    ("LIQUIDITY_RISK", "Liquidity / funding pressure language", "medium",
     r"insufficient liquidity|may be unable to (?:meet|fund)|require additional (?:capital|financing) to|negative working capital", True, None),
    ("CONCENTRATION", "Customer / supplier concentration", "low",
     r"concentration of (?:credit risk|revenue)|one customer accounted for|single customer represented", False, None),
    ("SUBSEQUENT_EVENT", "Material subsequent events", "low",
     r"subsequent event", False, r"no (?:material )?subsequent|no events"),
    ("DEBT_MATURITY", "Near-term debt maturities", "low",
     r"matur(?:e|es|ing|ity|ities)\s+(?:within|in)\s+(?:one year|12 months|the next (?:12|twelve))", False, None),
]

NEGATION_RE = re.compile(
    r"\b(?:no|not|never|without|didn'?t|did not|do not|does not|are not|is not|aren'?t|isn'?t|none|nor|free (?:of|from)|absence of)\b",
    re.I,
)

SECTION_SPLIT = re.compile(
    r"(?=(?:Item\s+\d+[A-Z]?\.|Notes?\s+to\s+(?:the\s+)?(?:Condensed\s+)?(?:Consolidated\s+)?Financial\s+Statements|Note\s+\d+\s*[—–-]|CONDENSED\s+CONSOLIDATED\s+STATEMENTS?\s+OF|CONSOLIDATED\s+(?:BALANCE\s+SHEETS?|STATEMENTS?\s+OF)|Management['’]s\s+Discussion|Risk\s+Factors|Legal\s+Proceedings|Quantitative\s+and\s+Qualitative))",
    re.I,
)

LEAF_CHARS = 6000
MAX_DEPTH = 3
BATCH = 5
MAX_SECTIONS = 16


def _evidence(text: str, index: int) -> str:
    start = max(0, index - 70)
    end = min(len(text), index + 200)
    return re.sub(r"\s+", " ", text[start:end]).strip()[:240]


def _label_for(chunk: str) -> str:
    head = re.sub(r"\s+", " ", chunk[:90]).strip()
    m = re.match(
        r"(Item\s+\d+[A-Z]?\.[^.]*|Note\s+\d+[^.]*|Notes? to[^.]*|CONDENSED CONSOLIDATED STATEMENTS? OF [A-Z ]+|CONSOLIDATED [A-Z ]+|Management['’]s Discussion[^.]*|Risk Factors|Legal Proceedings|Quantitative and Qualitative[^.]*)",
        head, re.I,
    )
    return ((m.group(1) if m else head) or "Section")[:70].strip()


def _split_by_size(text: str, size: int) -> List[str]:
    if len(text) <= size:
        return [text]
    chunks, i = [], 0
    while i < len(text):
        end = min(i + size, len(text))
        if end < len(text):
            window = text[i:end]
            brk = max(window.rfind(". "), window.rfind("\n"))
            if brk > size * 0.6:
                end = i + brk + 1
        chunks.append(text[i:end].strip())
        i = end
    return [c for c in chunks if c]


def _sectionize(text: str) -> List[Tuple[str, str]]:
    parts = [p.strip() for p in SECTION_SPLIT.split(text) if len(p.strip()) > 40]
    if len(parts) <= 1:
        sections = [(f"Block {i+1}", t) for i, t in enumerate(_split_by_size(text, 6000))]
    else:
        sections = [(_label_for(t), t) for t in parts]
    if len(sections) > MAX_SECTIONS:
        head = sections[:MAX_SECTIONS - 1]
        tail = sections[MAX_SECTIONS - 1:]
        head.append(("Remaining disclosures", "\n\n".join(t for _, t in tail)))
        sections = head
    return sections


def _find_match(text: str, pattern: str, guard: bool, exclude: Optional[str]) -> Optional[int]:
    for m in re.finditer(pattern, text, re.I):
        before = text[max(0, m.start() - 48):m.start()]
        around = text[max(0, m.start() - 48):m.end() + 90]
        if guard and NEGATION_RE.search(before):
            continue
        if exclude and re.search(exclude, around, re.I):
            continue
        return m.start()
    return None


def _leaf(text: str, label: str) -> Dict:
    flags = []
    for code, title, severity, pattern, guard, exclude in QUALITATIVE_RULES:
        idx = _find_match(text, pattern, guard, exclude)
        if idx is not None:
            flags.append({
                "code": code, "title": title, "severity": severity,
                "section": label, "evidence": _evidence(text, idx),
            })
    digest = ("Flags: " + "; ".join(f["title"] for f in flags) + ".") if flags else \
        "No qualitative red-flag language detected in this section."
    return {"flags": flags, "digest": digest, "section_digests": [{"section": label, "digest": digest}]}


def _dedupe(flags: List[Dict]) -> List[Dict]:
    by_code: Dict[str, Dict] = {}
    for f in flags:
        ex = by_code.get(f["code"])
        if not ex:
            by_code[f["code"]] = dict(f)
        else:
            if SEVERITY_RANK[f["severity"]] < SEVERITY_RANK[ex["severity"]]:
                ex["severity"] = f["severity"]
            secs = set(ex["section"].split(", ") + [f["section"]])
            ex["section"] = ", ".join(list(secs)[:4])
            if not ex.get("evidence"):
                ex["evidence"] = f.get("evidence", "")
    return sorted(by_code.values(), key=lambda x: SEVERITY_RANK[x["severity"]])


class _Trace:
    def __init__(self):
        self.nodes: List[Dict] = []
        self.max_depth = 0
        self.sections_analyzed = 0
        self.chars_processed = 0

    def node(self, parent_id, depth, kind, label, chars) -> str:
        nid = f"n{len(self.nodes)}"
        self.nodes.append({"id": nid, "parent_id": parent_id, "depth": depth,
                           "kind": kind, "label": label, "chars": chars, "digest": None})
        self.max_depth = max(self.max_depth, depth)
        return nid

    def set_digest(self, nid, digest):
        for n in self.nodes:
            if n["id"] == nid:
                n["digest"] = (digest or "")[:220]
                return


def _deterministic_digest(children: List[Dict], label: str) -> str:
    flags = _dedupe([f for c in children for f in c["flags"]])
    if not flags:
        return f"{label}: no qualitative red flags."
    top = [f["title"] for f in flags[:4]]
    extra = f"; +{len(flags) - 4} more" if len(flags) > 4 else ""
    return f"{label}: {'; '.join(top)}{extra}."


def _narrative(flags: List[Dict], section_count: int) -> str:
    parts = [f"Recursive document review decomposed the filing into {section_count} section"
             f"{'' if section_count == 1 else 's'} and analysed each for qualitative due-diligence signals."]
    crit = [f["title"] for f in flags if f["severity"] == "critical"]
    high = [f["title"] for f in flags if f["severity"] == "high"]
    rest = [f["title"] for f in flags if f["severity"] in ("medium", "low")]
    if not flags:
        parts.append("No qualitative red-flag language (going concern, restatements, related-party dealings, covenant or control issues) was detected in the narrative sections.")
    else:
        if crit:
            parts.append("Critical disclosures: " + "; ".join(crit) + ".")
        if high:
            parts.append("High-severity disclosures: " + "; ".join(high) + ".")
        if rest:
            parts.append("Also noted: " + "; ".join(rest) + ".")
    parts.append("Corroborate every flagged disclosure against the audited statements, notes, and management representations before relying on it.")
    return " ".join(parts)


def _reduce(findings: List[Dict], label: str, depth: int, parent_id: str, trace: _Trace, section_count: int) -> Dict:
    flags = _dedupe([f for c in findings for f in c["flags"]])
    section_digests = [d for c in findings for d in c["section_digests"]]
    if len(findings) > BATCH:
        batches = [findings[i:i + BATCH] for i in range(0, len(findings), BATCH)]
        batch_results = []
        for i, b in enumerate(batches):
            nid = trace.node(parent_id, depth + 1, "reduce", f"{label} · merge {i+1}", 0)
            digest = _deterministic_digest(b, f"{label} merge {i+1}")
            trace.set_digest(nid, digest)
            batch_results.append({
                "flags": _dedupe([f for x in b for f in x["flags"]]),
                "digest": digest,
                "section_digests": [d for x in b for d in x["section_digests"]],
            })
        return _reduce(batch_results, label, depth, parent_id, trace, section_count)
    digest = _narrative(flags, section_count) if depth == 0 else _deterministic_digest(findings, label)
    return {"flags": flags, "digest": digest, "section_digests": section_digests}


def _analyze_node(text: str, label: str, depth: int, parent_id: str, trace: _Trace) -> Dict:
    trace.chars_processed += len(text)
    if len(text) <= LEAF_CHARS or depth >= MAX_DEPTH:
        nid = trace.node(parent_id, depth, "section" if depth <= 1 else "chunk", label, len(text))
        f = _leaf(text, label)
        trace.set_digest(nid, f["digest"])
        return f
    nid = trace.node(parent_id, depth, "section", label, len(text))
    subs = _split_by_size(text, LEAF_CHARS)
    children = [_analyze_node(s, f"{label} · part {i+1}", depth + 1, nid, trace) for i, s in enumerate(subs)]
    reduced = _reduce(children, label, depth, nid, trace, len(subs))
    trace.set_digest(nid, reduced["digest"])
    return reduced


def _document_score(flags: List[Dict]) -> float:
    raw = sum(SEVERITY_WEIGHT[f["severity"]] for f in flags)
    return float(max(0, min(100, 8 + raw)))


def run_recursive_diligence(full_text: str) -> Dict:
    text = (full_text or "").strip()
    trace = _Trace()
    root_id = trace.node(None, 0, "root", "Filing", len(text))
    sections = _sectionize(text)
    trace.sections_analyzed = len(sections)
    section_findings = [_analyze_node(t, label, 1, root_id, trace) for label, t in sections]
    merged = _reduce(section_findings, "Filing", 0, root_id, trace, len(sections))
    trace.set_digest(root_id, merged["digest"])

    flags = _dedupe(merged["flags"])
    seen, section_digests = set(), []
    for d in merged["section_digests"]:
        if d["section"] in seen:
            continue
        seen.add(d["section"])
        section_digests.append(d)

    return {
        "summary": merged["digest"],
        "qualitative_flags": flags,
        "section_digests": section_digests[:16],
        "document_risk_score": _document_score(flags),
        "trace": {
            "provider": "Deterministic recursive analyzer (Python service)",
            "total_calls": len(trace.nodes),
            "max_depth": trace.max_depth,
            "sections_analyzed": trace.sections_analyzed,
            "chars_processed": trace.chars_processed,
            "llm_calls": 0,
            "nodes": trace.nodes,
        },
    }


def merge_rlm_into_result(result, rlm: Dict):
    """Fold RLM findings into a RiskAssessmentResult (pydantic model) in place-ish,
    returning the mutated model. Mirrors mergeRlmIntoResult in rlm.ts."""
    from .schemas import RedFlag, RlmResult

    for f in rlm["qualitative_flags"]:
        result.red_flags.append(RedFlag(
            code=f"DOC_{f['code']}",
            title=f["title"],
            severity=f["severity"],
            description=(f'Disclosed in “{f["section"]}”: “{f["evidence"]}”' if f.get("evidence")
                        else f'Referenced in “{f["section"]}”.'),
        ))

    document = round(max(result.component_scores.document, rlm["document_risk_score"]) * 10) / 10
    result.component_scores.document = document
    cs = result.component_scores
    overall = (
        cs.manipulation * COMPONENT_WEIGHTS["manipulation"]
        + cs.liquidity * COMPONENT_WEIGHTS["liquidity"]
        + cs.ml_model * COMPONENT_WEIGHTS["ml_model"]
        + cs.anomaly * COMPONENT_WEIGHTS["anomaly"]
        + cs.document * COMPONENT_WEIGHTS["document"]
        + cs.external * COMPONENT_WEIGHTS["external"]
    )
    result.overall_score = round(max(0, min(100, overall)) * 10) / 10
    result.risk_level = (
        "LOW" if result.overall_score <= 30 else
        "MEDIUM" if result.overall_score <= 60 else
        "HIGH" if result.overall_score <= 80 else "CRITICAL"
    )
    result.llm_summary = f"{result.llm_summary}\n\nRecursive document review (RLM): {rlm['summary']}"
    result.model_info.explainability += " + RLM recursive document trace"
    result.rlm = RlmResult.model_validate(rlm)
    return result
