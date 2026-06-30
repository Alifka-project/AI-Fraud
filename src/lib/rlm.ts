// ---------------------------------------------------------------------------
// Recursive Language Model (RLM) engine for long financial filings.
//
// A single LLM call degrades on very long context ("context rot") and, for a
// 28-page 10-Q, can't even fit the notes + MD&A + risk factors alongside the
// statements. The RLM instead treats the document as something to be
// *recursively decomposed*:
//
//   1. DECOMPOSE  the filing into sections (Items, Notes, MD&A, statements).
//   2. RECURSE    on each section — if a section is still too large for one
//                 leaf call, split it again (bounded by maxDepth).
//   3. ANALYSE    each leaf chunk with the language model (or a deterministic
//                 forensic scanner when no API key is configured).
//   4. REDUCE     partial findings bottom-up. When there are too many partials
//                 to combine in one step, reduce them in batches — recursively
//                 — until a single synthesis remains.
//
// Every node is recorded in a trace so the recursion is fully explainable in
// the dashboard. The engine never throws: the LLM is best-effort and the
// deterministic path always produces a usable result.
// ---------------------------------------------------------------------------

import { callOpenAIChat, hasLlmKey, llmModelName, parseLlmJson } from "./llm";
import { riskLevelFromScore } from "./utils";
import type {
  RedFlag,
  RiskAssessmentResult,
  RlmNode,
  RlmQualitativeFlag,
  RlmResult,
  RlmSectionDigest,
  RlmTrace,
} from "./types";

// Same component weights used by the quantitative scoring engines.
const COMPONENT_WEIGHTS = {
  manipulation: 0.3,
  liquidity: 0.2,
  mlModel: 0.2,
  anomaly: 0.1,
  document: 0.15,
  external: 0.05,
} as const;

type Severity = RlmQualitativeFlag["severity"];

interface Findings {
  flags: RlmQualitativeFlag[];
  digest: string;
  sectionDigests: RlmSectionDigest[];
}

interface RlmOptions {
  leafChars: number; // max chars analysed in a single leaf call
  maxDepth: number; // recursion depth cap
  batch: number; // partials combined per reduction step
  concurrency: number; // parallel node analyses
  maxLlmCalls: number; // hard cap on LLM calls (cost/latency guard)
}

const DEFAULTS: RlmOptions = {
  leafChars: 6000,
  maxDepth: 3,
  batch: 5,
  concurrency: 4,
  maxLlmCalls: 14,
};

// Mutable run state shared across the recursion.
interface RunState {
  trace: RlmTrace;
  opts: RlmOptions;
  keyed: boolean;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 35,
  high: 20,
  medium: 10,
  low: 4,
};
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ---------------------------------------------------------------------------
// Deterministic forensic rules — qualitative fraud / due-diligence signals
// that live in the narrative sections of a filing (not in the numbers).
// ---------------------------------------------------------------------------
const QUALITATIVE_RULES: Array<{
  code: string;
  title: string;
  severity: Severity;
  re: RegExp;
  // When true, an occurrence is ignored if the preceding context is negated
  // (e.g. "did not identify any material weakness").
  guard?: boolean;
  // When set, an occurrence is ignored if its surrounding context matches —
  // used to drop benign boilerplate (e.g. "restated to conform to presentation").
  exclude?: RegExp;
}> = [
  { code: "GOING_CONCERN", title: "Going-concern doubt referenced", severity: "critical", re: /substantial doubt[\s\S]{0,140}going concern|going concern[\s\S]{0,80}(?:substantial doubt|material uncertaint)/i },
  { code: "RESTATEMENT", title: "Restatement / prior-period revision", severity: "high", re: /restat(?:e|ed|ement)|previously (?:issued|reported) financial statements/i, guard: true, exclude: /conform|reclassif|presentation|rounding|immaterial/i },
  // Affirmative identification only — excludes the SOX 302 certification
  // boilerplate ("All significant deficiencies and material weaknesses in the
  // design or operation of internal control…") present in every filing.
  { code: "MATERIAL_WEAKNESS", title: "Internal-control weakness", severity: "high", re: /(?:identified|concluded|disclosed|determined|existence of|remediat(?:e|ing|ion of))(?:\s+\w+){0,6}\s+material weakness|material weakness(?:es)?\s+(?:exist|was identified|were identified|in our internal control|relating to)/i, guard: true },
  { code: "AUDITOR_CHANGE", title: "Change of auditor", severity: "high", re: /(?:resignation|dismissal) of (?:the )?(?:independent )?(?:registered )?(?:public accounting firm|auditor)|(?:changed|replaced|dismissed) (?:its |our )?(?:independent )?auditor/i, guard: true },
  { code: "COVENANT", title: "Debt covenant breach / waiver", severity: "high", re: /covenants?\s+(?:breach|violation|default|waiver)|(?:breach(?:ed|es)?|violat(?:ed|ion)|default(?:ed)?|waiv(?:ed|er))(?:\s+[\w’']+){0,4}\s+covenants?/i, guard: true },
  { code: "RELATED_PARTY", title: "Related-party transactions", severity: "high", re: /related[- ]part(?:y|ies)\s+transactions?|transactions? with (?:a )?related part/i },
  { code: "IMPAIRMENT", title: "Impairment / write-down", severity: "medium", re: /impairment (?:charge|loss)|goodwill impairment|write[- ]?(?:down|off) of/i, guard: true },
  { code: "LITIGATION", title: "Material litigation / legal proceedings", severity: "medium", re: /(?:subject to|pending|ongoing|party to|defendant in|facing|named in)\s+(?:various |certain |material )?(?:litigation|lawsuits?|legal proceedings?|claims and legal)|class action|antitrust (?:lawsuit|litigation|claim|matter)|received a subpoena|securities (?:fraud )?class/i },
  { code: "REVENUE_RECOGNITION", title: "Revenue-recognition complexity", severity: "medium", re: /bill[- ]and[- ]hold|channel stuffing|percentage[- ]of[- ]completion|side (?:letter|agreement)|aggressive revenue/i },
  { code: "LIQUIDITY_RISK", title: "Liquidity / funding pressure language", severity: "medium", re: /insufficient liquidity|may be unable to (?:meet|fund)|require additional (?:capital|financing) to|negative working capital/i, guard: true },
  { code: "CONCENTRATION", title: "Customer / supplier concentration", severity: "low", re: /concentration of (?:credit risk|revenue)|one customer accounted for|single customer represented/i },
  { code: "SUBSEQUENT_EVENT", title: "Material subsequent events", severity: "low", re: /subsequent event/i, exclude: /no (?:material )?subsequent|no events/i },
  { code: "DEBT_MATURITY", title: "Near-term debt maturities", severity: "low", re: /matur(?:e|es|ing|ity|ities)\s+(?:within|in)\s+(?:one year|12 months|the next (?:12|twelve))/i },
];

const NEGATION_RE =
  /\b(?:no|not|never|without|didn'?t|did not|do not|does not|are not|is not|aren'?t|isn'?t|none|nor|free (?:of|from)|absence of)\b/i;

function evidenceAround(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + len + 110);
  return text
    .slice(start, end)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// ----------------------------- small utilities -----------------------------

function newNode(state: RunState, node: Omit<RlmNode, "id">): string {
  const id = `n${state.trace.nodes.length}`;
  state.trace.nodes.push({ id, ...node });
  state.trace.maxDepth = Math.max(state.trace.maxDepth, node.depth);
  return id;
}

function setDigest(state: RunState, id: string, digest: string) {
  const n = state.trace.nodes.find((x) => x.id === id);
  if (n) n.digest = digest.slice(0, 220);
}

function canUseLlm(state: RunState): boolean {
  return state.keyed && state.trace.llmCalls < state.opts.maxLlmCalls;
}

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function dedupeFlags(flags: RlmQualitativeFlag[]): RlmQualitativeFlag[] {
  const byCode = new Map<string, RlmQualitativeFlag>();
  for (const f of flags) {
    const existing = byCode.get(f.code);
    if (!existing) {
      byCode.set(f.code, { ...f });
    } else {
      if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[existing.severity]) {
        existing.severity = f.severity;
      }
      const sections = new Set(existing.section.split(", ").concat(f.section));
      existing.section = Array.from(sections).slice(0, 4).join(", ");
      if (!existing.evidence && f.evidence) existing.evidence = f.evidence;
    }
  }
  return Array.from(byCode.values()).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
}

function documentScoreFromFlags(flags: RlmQualitativeFlag[]): number {
  const raw = flags.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0);
  // Base of 8 so a clean filing isn't scored at zero document risk.
  return Math.max(0, Math.min(100, 8 + raw));
}

// ------------------------------- sectionize --------------------------------

interface Section {
  label: string;
  text: string;
}

const SECTION_SPLIT =
  /(?=(?:Item\s+\d+[A-Z]?\.|Notes?\s+to\s+(?:the\s+)?(?:Condensed\s+)?(?:Consolidated\s+)?Financial\s+Statements|Note\s+\d+\s*[—–-]|CONDENSED\s+CONSOLIDATED\s+STATEMENTS?\s+OF|CONSOLIDATED\s+(?:BALANCE\s+SHEETS?|STATEMENTS?\s+OF)|Management['’]s\s+Discussion|Risk\s+Factors|Legal\s+Proceedings|Quantitative\s+and\s+Qualitative))/gi;

function labelFor(chunk: string): string {
  const head = chunk.slice(0, 90).replace(/\s+/g, " ").trim();
  const m = head.match(
    /^(Item\s+\d+[A-Z]?\.[^.]*|Note\s+\d+[^.]*|Notes? to[^.]*|CONDENSED CONSOLIDATED STATEMENTS? OF [A-Z ]+|CONSOLIDATED [A-Z ]+|Management['’]s Discussion[^.]*|Risk Factors|Legal Proceedings|Quantitative and Qualitative[^.]*)/i
  );
  return (m ? m[1] : head).slice(0, 70).trim() || "Section";
}

export function sectionize(text: string, maxSections = 16): Section[] {
  const parts = text.split(SECTION_SPLIT).map((p) => p.trim()).filter((p) => p.length > 40);
  let sections: Section[];
  if (parts.length <= 1) {
    // No recognisable headers — fall back to fixed-size windows.
    sections = splitBySize(text, 6000).map((t, i) => ({ label: `Block ${i + 1}`, text: t }));
  } else {
    sections = parts.map((t) => ({ label: labelFor(t), text: t }));
  }
  // Bound the number of sections; merge the overflow tail into the last one.
  if (sections.length > maxSections) {
    const head = sections.slice(0, maxSections - 1);
    const tail = sections.slice(maxSections - 1);
    head.push({ label: "Remaining disclosures", text: tail.map((s) => s.text).join("\n\n") });
    sections = head;
  }
  return sections;
}

function splitBySize(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      // Prefer a sentence/paragraph boundary near the cut.
      const slice = text.slice(i, end);
      const brk = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (brk > size * 0.6) end = i + brk + 1;
    }
    chunks.push(text.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}

// ----------------------------- leaf analysis -------------------------------

function findRuleMatch(
  text: string,
  rule: (typeof QUALITATIVE_RULES)[number]
): number | null {
  const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 48), m.index);
    const around = text.slice(Math.max(0, m.index - 48), m.index + m[0].length + 90);
    if (rule.guard && NEGATION_RE.test(before)) continue; // negated → boilerplate
    if (rule.exclude && rule.exclude.test(around)) continue; // benign context
    return m.index;
  }
  return null;
}

function deterministicLeaf(text: string, label: string): Findings {
  const flags: RlmQualitativeFlag[] = [];
  for (const rule of QUALITATIVE_RULES) {
    const idx = findRuleMatch(text, rule);
    if (idx !== null) {
      flags.push({
        code: rule.code,
        title: rule.title,
        severity: rule.severity,
        section: label,
        evidence: evidenceAround(text, idx, 0),
      });
    }
  }
  const digest = flags.length
    ? `Flags: ${flags.map((f) => f.title).join("; ")}.`
    : "No qualitative red-flag language detected in this section.";
  return { flags, digest, sectionDigests: [{ section: label, digest }] };
}

async function llmLeaf(text: string, label: string, state: RunState): Promise<Findings | null> {
  if (!canUseLlm(state)) return null;
  state.trace.llmCalls += 1;
  const content = await callOpenAIChat(
    [
      {
        role: "system",
        content:
          "You are a forensic financial-statement analyst. You read ONE section of a company filing and surface qualitative due-diligence red flags (going concern, restatements, related-party deals, covenant breaches, auditor changes, litigation, impairments, revenue-recognition risk, liquidity pressure, control weaknesses). Quote short evidence. Return STRICT JSON. Use risk-indicator language; never assert fraud.",
      },
      {
        role: "user",
        content:
          `Section: ${label}\n\nReturn JSON {"flags":[{"code":string,"title":string,"severity":"low"|"medium"|"high"|"critical","evidence":string}],"digest":string}. ` +
          `digest = one sentence summarising this section's risk relevance (<=30 words). If nothing notable, return an empty flags array.\n\nSECTION TEXT:\n` +
          "```\n" +
          text.slice(0, 6500) +
          "\n```",
      },
    ],
    { json: true, maxTokens: 600, temperature: 0 }
  );
  const parsed = parseLlmJson<{
    flags?: Array<{ code?: string; title?: string; severity?: string; evidence?: string }>;
    digest?: string;
  }>(content);
  if (!parsed) return null;
  const flags: RlmQualitativeFlag[] = (parsed.flags ?? [])
    .filter((f) => f && (f.title || f.code))
    .map((f) => ({
      code: (f.code || f.title || "DOC_FLAG").toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 40),
      title: (f.title || f.code || "Document flag").slice(0, 120),
      severity: (["low", "medium", "high", "critical"].includes(String(f.severity))
        ? f.severity
        : "medium") as Severity,
      section: label,
      evidence: (f.evidence || "").replace(/\s+/g, " ").trim().slice(0, 240),
    }));
  const digest = (parsed.digest || (flags.length ? flags[0].title : "No notable risk language."))
    .toString()
    .slice(0, 220);
  return { flags, digest, sectionDigests: [{ section: label, digest }] };
}

async function analyzeLeaf(text: string, label: string, state: RunState): Promise<Findings> {
  const viaLlm = await llmLeaf(text, label, state);
  return viaLlm ?? deterministicLeaf(text, label);
}

// ------------------------------- reduction ---------------------------------

function deterministicDigest(children: Findings[], label: string): string {
  const flags = dedupeFlags(children.flatMap((c) => c.flags));
  if (!flags.length) return `${label}: no qualitative red flags.`;
  const top = flags.slice(0, 4).map((f) => f.title);
  return `${label}: ${top.join("; ")}${flags.length > 4 ? `; +${flags.length - 4} more` : ""}.`;
}

async function llmDigest(children: Findings[], label: string, state: RunState): Promise<string | null> {
  if (!canUseLlm(state)) return null;
  state.trace.llmCalls += 1;
  const childText = children
    .map((c, i) => `(${i + 1}) ${c.digest} | flags: ${c.flags.map((f) => `${f.severity}:${f.title}`).join(", ") || "none"}`)
    .join("\n")
    .slice(0, 5000);
  const content = await callOpenAIChat(
    [
      { role: "system", content: "You merge sub-section findings of a financial filing into one concise risk digest. Risk-indicator language only." },
      { role: "user", content: `Combine into ONE sentence (<=35 words) for "${label}":\n${childText}` },
    ],
    { maxTokens: 120, temperature: 0.1 }
  );
  return content ? content.replace(/\s+/g, " ").trim().slice(0, 220) : null;
}

async function synthDigest(children: Findings[], label: string, state: RunState): Promise<string> {
  return (await llmDigest(children, label, state)) ?? deterministicDigest(children, label);
}

function deterministicNarrative(flags: RlmQualitativeFlag[], sectionCount: number): string {
  const lines: string[] = [];
  lines.push(
    `Recursive document review decomposed the filing into ${sectionCount} section${sectionCount === 1 ? "" : "s"} and analysed each for qualitative due-diligence signals.`
  );
  const crit = flags.filter((f) => f.severity === "critical");
  const high = flags.filter((f) => f.severity === "high");
  const rest = flags.filter((f) => f.severity === "medium" || f.severity === "low");
  if (!flags.length) {
    lines.push("No qualitative red-flag language (going concern, restatements, related-party dealings, covenant or control issues) was detected in the narrative sections.");
  } else {
    if (crit.length) lines.push(`Critical disclosures: ${crit.map((f) => f.title).join("; ")}.`);
    if (high.length) lines.push(`High-severity disclosures: ${high.map((f) => f.title).join("; ")}.`);
    if (rest.length) lines.push(`Also noted: ${rest.map((f) => f.title).join("; ")}.`);
  }
  lines.push("Corroborate every flagged disclosure against the audited statements, notes, and management representations before relying on it.");
  return lines.join(" ");
}

async function synthNarrative(
  children: Findings[],
  flags: RlmQualitativeFlag[],
  sectionCount: number,
  state: RunState
): Promise<string> {
  if (canUseLlm(state)) {
    state.trace.llmCalls += 1;
    const flagText = flags.map((f) => `${f.severity.toUpperCase()} — ${f.title} (${f.section})`).join("\n").slice(0, 3500);
    const digestText = children.map((c) => `- ${c.digest}`).join("\n").slice(0, 3000);
    const content = await callOpenAIChat(
      [
        {
          role: "system",
          content:
            "You are a forensic analyst writing the qualitative half of an investor due-diligence brief from a recursively-analysed filing. Use risk-indicator language; never assert fraud. <=170 words.",
        },
        {
          role: "user",
          content:
            `Section digests:\n${digestText}\n\nConsolidated qualitative flags:\n${flagText || "none"}\n\n` +
            "Write: (1) one-sentence document-risk verdict, (2) the most material qualitative disclosures, (3) recommended follow-ups.",
        },
      ],
      { maxTokens: 400, temperature: 0.2 }
    );
    if (content) return content.trim();
  }
  return deterministicNarrative(flags, sectionCount);
}

async function reduceFindings(
  findings: Findings[],
  label: string,
  depth: number,
  parentId: string,
  state: RunState,
  sectionCount: number
): Promise<Findings> {
  const flags = dedupeFlags(findings.flatMap((f) => f.flags));
  const sectionDigests = findings.flatMap((f) => f.sectionDigests);

  // Too many partials to combine at once → recursive batch reduction.
  if (findings.length > state.opts.batch) {
    const batches: Findings[][] = [];
    for (let i = 0; i < findings.length; i += state.opts.batch) {
      batches.push(findings.slice(i, i + state.opts.batch));
    }
    const batchResults = await mapLimited(batches, state.opts.concurrency, async (batch, i) => {
      const id = newNode(state, {
        parentId,
        depth: depth + 1,
        kind: "reduce",
        label: `${label} · merge ${i + 1}`,
        chars: 0,
      });
      const digest = await synthDigest(batch, `${label} merge ${i + 1}`, state);
      setDigest(state, id, digest);
      return {
        flags: dedupeFlags(batch.flatMap((b) => b.flags)),
        digest,
        sectionDigests: batch.flatMap((b) => b.sectionDigests),
      };
    });
    return reduceFindings(batchResults, label, depth, parentId, state, sectionCount);
  }

  const digest =
    depth === 0
      ? await synthNarrative(findings, flags, sectionCount, state)
      : await synthDigest(findings, label, state);
  return { flags, digest, sectionDigests };
}

// ----------------------------- recursive node ------------------------------

async function analyzeNode(
  text: string,
  label: string,
  depth: number,
  parentId: string,
  state: RunState
): Promise<Findings> {
  state.trace.charsProcessed += text.length;

  if (text.length <= state.opts.leafChars || depth >= state.opts.maxDepth) {
    const id = newNode(state, {
      parentId,
      depth,
      kind: depth <= 1 ? "section" : "chunk",
      label,
      chars: text.length,
    });
    const f = await analyzeLeaf(text, label, state);
    setDigest(state, id, f.digest);
    return f;
  }

  // Section too large for one leaf → split and recurse.
  const id = newNode(state, { parentId, depth, kind: "section", label, chars: text.length });
  const subs = splitBySize(text, state.opts.leafChars);
  const childFindings = await mapLimited(subs, state.opts.concurrency, (sub, i) =>
    analyzeNode(sub, `${label} · part ${i + 1}`, depth + 1, id, state)
  );
  const reduced = await reduceFindings(childFindings, label, depth, id, state, subs.length);
  setDigest(state, id, reduced.digest);
  return reduced;
}

// -------------------------------- public API -------------------------------

export async function runRecursiveDiligence(
  fullText: string,
  options: Partial<RlmOptions> = {}
): Promise<RlmResult> {
  const opts = { ...DEFAULTS, ...options };
  const state: RunState = {
    opts,
    keyed: hasLlmKey(),
    trace: {
      provider: "",
      totalCalls: 0,
      llmCalls: 0,
      maxDepth: 0,
      sectionsAnalyzed: 0,
      charsProcessed: 0,
      nodes: [],
    },
  };

  const text = (fullText ?? "").trim();
  const rootId = newNode(state, {
    parentId: null,
    depth: 0,
    kind: "root",
    label: "Filing",
    chars: text.length,
  });

  const sections = sectionize(text);
  state.trace.sectionsAnalyzed = sections.length;

  const sectionFindings = await mapLimited(sections, opts.concurrency, (s) =>
    analyzeNode(s.text, s.label, 1, rootId, state)
  );

  const merged = await reduceFindings(
    sectionFindings,
    "Filing",
    0,
    rootId,
    state,
    sections.length
  );
  setDigest(state, rootId, merged.digest);

  state.trace.totalCalls = state.trace.nodes.length;
  state.trace.provider = state.trace.llmCalls
    ? `Recursive LM over ${llmModelName()} (${state.trace.llmCalls} model calls)`
    : "Deterministic recursive analyzer (no LLM key)";

  const flags = dedupeFlags(merged.flags);
  // Keep section digests compact and de-duplicated.
  const seenSections = new Set<string>();
  const sectionDigests = merged.sectionDigests.filter((d) => {
    if (seenSections.has(d.section)) return false;
    seenSections.add(d.section);
    return true;
  });

  return {
    summary: merged.digest,
    qualitativeFlags: flags,
    sectionDigests: sectionDigests.slice(0, 16),
    documentRiskScore: documentScoreFromFlags(flags),
    trace: state.trace,
  };
}

// ---------------------------------------------------------------------------
// Integration: fold RLM findings into a quantitative risk assessment so the
// recursive document review actually moves the score, not just the narrative.
// ---------------------------------------------------------------------------
export function mergeRlmIntoResult(
  result: RiskAssessmentResult,
  rlm: RlmResult
): RiskAssessmentResult {
  // 1. Qualitative findings become document-derived red flags.
  const docFlags: RedFlag[] = rlm.qualitativeFlags.map((f) => ({
    code: `DOC_${f.code}`,
    title: f.title,
    severity: f.severity,
    description: f.evidence
      ? `Disclosed in “${f.section}”: “${f.evidence}”`
      : `Referenced in “${f.section}”.`,
  }));
  const redFlags = [...result.redFlags, ...docFlags];

  // 2. Document-consistency component = the more conservative of the heuristic
  //    score and the RLM's qualitative document-risk score.
  const document =
    Math.round(Math.max(result.componentScores.document, rlm.documentRiskScore) * 10) / 10;
  const componentScores = { ...result.componentScores, document };

  // 3. Recompute the weighted overall score and risk level.
  const overall =
    componentScores.manipulation * COMPONENT_WEIGHTS.manipulation +
    componentScores.liquidity * COMPONENT_WEIGHTS.liquidity +
    componentScores.mlModel * COMPONENT_WEIGHTS.mlModel +
    componentScores.anomaly * COMPONENT_WEIGHTS.anomaly +
    componentScores.document * COMPONENT_WEIGHTS.document +
    componentScores.external * COMPONENT_WEIGHTS.external;
  const overallScore = Math.round(Math.max(0, Math.min(100, overall)) * 10) / 10;

  // 4. Compose the narrative: quantitative summary + recursive document review.
  const llmSummary = `${result.llmSummary}\n\nRecursive document review (RLM): ${rlm.summary}`;

  return {
    ...result,
    redFlags,
    componentScores,
    overallScore,
    riskLevel: riskLevelFromScore(overallScore),
    llmSummary,
    rlm,
    modelInfo: {
      ...result.modelInfo,
      explainability: `${result.modelInfo.explainability} + RLM recursive document trace`,
    },
  };
}
