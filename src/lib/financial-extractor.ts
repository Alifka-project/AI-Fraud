// Converts raw document text (extracted from a PDF or pasted) into structured
// financial records.
//
// Two strategies, tried in order:
//   1. LLM extraction (OpenAI JSON mode) — robust for arbitrary statement
//      layouts. Used when OPENAI_API_KEY is set.
//   2. Heuristic label/number extraction — a dependency-free fallback so the
//      pipeline still produces something to verify when no LLM is available.
//
// Because PDF extraction is never perfect, the upload page always shows the
// result in an editable table for the user to confirm before analysis.

import type { FinancialRecordInput } from "./types";
import { extractFinancialsWithLlm } from "./llm";

export type ExtractionMethod = "pdf-llm" | "pdf-heuristic" | "csv" | "xlsx";
export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractionResult {
  records: FinancialRecordInput[];
  warnings: string[];
  method: ExtractionMethod;
  confidence: ExtractionConfidence;
  companyName: string | null;
  currency: string | null;
}

// Field label aliases used by the heuristic scanner. Order matters: more
// specific labels first so "cost of sales" isn't swallowed by "sales".
const LINE_ITEM_ALIASES: Array<{
  field: keyof Omit<FinancialRecordInput, "year">;
  patterns: RegExp[];
}> = [
  {
    field: "costOfGoodsSold",
    patterns: [/cost of goods sold/i, /cost of sales/i, /cost of revenue/i, /\bcogs\b/i],
  },
  {
    field: "operatingCashFlow",
    patterns: [
      /net cash (?:from|provided by|used in) operating/i,
      /cash (?:flow )?from operations/i,
      /operating cash flow/i,
      /\bocf\b/i,
    ],
  },
  {
    field: "revenue",
    patterns: [/total revenue/i, /net sales/i, /\brevenue\b/i, /\bturnover\b/i, /total sales/i],
  },
  {
    field: "netIncome",
    patterns: [
      /net income/i,
      /net profit/i,
      /profit for the (?:year|period)/i,
      /(?:profit|loss) after tax/i,
      /net earnings/i,
    ],
  },
  {
    field: "totalAssets",
    patterns: [/total assets/i],
  },
  {
    field: "totalLiabilities",
    patterns: [/total liabilities/i],
  },
  {
    field: "equity",
    patterns: [
      /total (?:shareholders|stockholders|owners)['’]? equity/i,
      /total equity/i,
      /shareholders['’]? equity/i,
    ],
  },
  {
    field: "cash",
    patterns: [/cash and cash equivalents/i, /cash (?:&|and) equivalents/i, /\bcash\b/i],
  },
  {
    field: "receivables",
    patterns: [/trade (?:and other )?receivables/i, /accounts receivable/i, /\breceivables\b/i],
  },
  {
    field: "debt",
    patterns: [/total (?:debt|borrowings)/i, /interest[- ]bearing (?:loans|borrowings)/i, /\bborrowings\b/i, /long[- ]term debt/i],
  },
  {
    field: "expenses",
    patterns: [/operating expenses/i, /total expenses/i, /administrative expenses/i, /\bopex\b/i],
  },
];

const UNIT_SCALE: Array<{ pattern: RegExp; scale: number }> = [
  { pattern: /in '?000s?\b|in thousands|aed '?000|figures in thousands/i, scale: 1_000 },
  { pattern: /in millions|aed million|figures in millions/i, scale: 1_000_000 },
  { pattern: /in billions/i, scale: 1_000_000_000 },
];

function detectScale(text: string): number {
  const head = text.slice(0, 4000);
  for (const { pattern, scale } of UNIT_SCALE) {
    if (pattern.test(head)) return scale;
  }
  return 1;
}

/**
 * Detect fiscal years in the order they appear in the statement header. Column
 * order in financial tables follows the header order (usually most-recent
 * first), so preserving appearance order lets us map numbers to the right year.
 */
function detectYears(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const yearLine = lines.find((l) => {
    const ys = l.match(/\b(?:19|20)\d{2}\b/g);
    return ys && new Set(ys).size >= 2;
  });
  const source = yearLine ?? text;
  const found = (source.match(/\b(?:19|20)\d{2}\b/g) ?? [])
    .map((y) => Number(y))
    .filter((y) => y >= 1990 && y <= 2100);

  // Deduplicate while preserving appearance order.
  const ordered: number[] = [];
  const seen = new Set<number>();
  for (const y of found) {
    if (!seen.has(y)) {
      seen.add(y);
      ordered.push(y);
    }
  }
  if (ordered.length <= 4) return ordered;
  // Too many candidate years: keep the 4 most recent, still in appearance order.
  const topFour = new Set([...ordered].sort((a, b) => b - a).slice(0, 4));
  return ordered.filter((y) => topFour.has(y));
}

/** Pull money-like number tokens from a line, honouring parentheses negatives. */
function extractNumbers(line: string): number[] {
  // Strip a leading label so embedded note references are less likely to leak.
  const tokens = line.match(/\(?\s*-?(?:AED|USD|US\$|\$|د\.إ)?\s*\d[\d,]*(?:\.\d+)?\s*\)?/gi) ?? [];
  const numbers: number[] = [];
  for (const tok of tokens) {
    const negative = /\(/.test(tok);
    const cleaned = tok.replace(/[(),\s]/g, "").replace(/[^0-9.\-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") continue;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) continue;
    // Drop tiny integers that are almost certainly note references.
    if (n < 100 && Number.isInteger(n) && !/\./.test(cleaned)) continue;
    numbers.push(negative ? -Math.abs(n) : n);
  }
  return numbers;
}

export function heuristicExtract(text: string): {
  records: FinancialRecordInput[];
  warnings: string[];
  companyName: string | null;
} {
  const warnings: string[] = [];
  const scale = detectScale(text);
  if (scale > 1) {
    warnings.push(`Detected values stated in units of ${scale.toLocaleString()}; figures were scaled to absolute AED.`);
  }

  // `yearsInOrder` follows the statement's column order (appearance order).
  let yearsInOrder = detectYears(text);
  if (yearsInOrder.length === 0) {
    // No year detected — assume a single most-recent fiscal year placeholder.
    yearsInOrder = [new Date().getFullYear() - 1];
    warnings.push("No fiscal year detected in the document — defaulted to one column. Please set the correct year.");
  }
  const yearSet = new Set(yearsInOrder);

  // Build records keyed by year so positional column mapping is unambiguous.
  const byYear = new Map<number, FinancialRecordInput>();
  for (const year of yearsInOrder) {
    byYear.set(year, {
      year,
      revenue: 0,
      netIncome: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      equity: 0,
      cash: 0,
      operatingCashFlow: 0,
      receivables: 0,
      debt: 0,
      costOfGoodsSold: 0,
      expenses: 0,
    });
  }

  // PDF text extractors frequently collapse a statement onto one line with no
  // newlines, so a per-line scan fails. Instead we locate each label's position
  // in the full text and read the numbers that sit between it and the next
  // label — robust whether the text has line breaks or not.
  type LabelHit = { field: keyof Omit<FinancialRecordInput, "year">; start: number; end: number };
  const hits: LabelHit[] = [];
  for (const { field, patterns } of LINE_ITEM_ALIASES) {
    let best: { start: number; end: number } | null = null;
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      const m = re.exec(text);
      if (m && (best === null || m.index < best.start)) {
        best = { start: m.index, end: m.index + m[0].length };
      }
    }
    if (best) hits.push({ field, start: best.start, end: best.end });
  }

  // Sort by position so we can bound each label's number span by the next label.
  hits.sort((a, b) => a.start - b.start);
  const seen = new Set<string>();

  const numColumns = yearsInOrder.length;
  hits.forEach((hit, i) => {
    if (seen.has(hit.field)) return;
    const spanEnd = i + 1 < hits.length ? hits[i + 1].start : text.length;
    const span = text.slice(hit.end, spanEnd);
    let nums = extractNumbers(span);
    // Drop tokens that exactly equal a detected fiscal year (header bleed),
    // but only if doing so still leaves enough numbers for the columns.
    const withoutYears = nums.filter((n) => !yearSet.has(n));
    if (withoutYears.length >= numColumns) nums = withoutYears;
    if (nums.length === 0) return;

    // Column order == header (appearance) order, so the i-th number belongs to
    // the i-th detected year. Direct positional mapping — no reversal.
    nums.slice(0, numColumns).forEach((value, col) => {
      const year = yearsInOrder[col];
      const record = byYear.get(year);
      if (record) record[hit.field] = value * scale;
    });
    seen.add(hit.field);
  });

  if (seen.size === 0) {
    warnings.push("Could not locate any recognised financial line items. Please enter the figures manually below.");
  } else if (seen.size < 5) {
    warnings.push(`Only ${seen.size} financial line items were recognised automatically. Please review and complete the table below.`);
  }

  // Final records sorted ascending by year for clean display.
  const records = [...byYear.values()].sort((a, b) => a.year - b.year);

  // Costs are magnitudes: statements often print COGS/expenses in parentheses
  // (negative). The feature engine expects positive cost values.
  for (const r of records) {
    r.costOfGoodsSold = Math.abs(r.costOfGoodsSold);
    r.expenses = Math.abs(r.expenses);
  }

  // Try to detect a company name: take the text before the first statement
  // header, then capture a phrase ending in a corporate-form suffix.
  const companyName = (() => {
    const boundaries = [
      /financial statement/i,
      /statement of/i,
      /balance sheet/i,
      /income statement/i,
      /consolidated/i,
    ]
      .map((re) => {
        const m = re.exec(text);
        return m ? m.index : Number.POSITIVE_INFINITY;
      })
      .filter((n) => Number.isFinite(n));
    const headEnd = boundaries.length ? Math.min(...boundaries) : 200;
    const head = text.slice(0, Math.min(headEnd || 200, 200));
    const m = head.match(
      /([A-Z][\w&.,'’\- ]*?\b(?:LLC|FZE|FZ-LLC|FZCO|L\.L\.C\.?|Limited|Ltd\.?|PJSC|PSC|Holdings|Group)\b)/
    );
    return m ? m[1].trim().slice(0, 120) : null;
  })();

  return { records, warnings, companyName };
}

/**
 * Main entry point: text -> structured records. Prefers the LLM, falls back to
 * the heuristic scanner. Always returns at least an (editable) skeleton.
 */
export async function extractFinancialsFromText(
  text: string
): Promise<ExtractionResult> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return {
      records: [],
      warnings: [
        "No text layer found in the PDF. It may be a scanned image — OCR is not enabled in this MVP. Please upload a text-based PDF, CSV, or Excel file.",
      ],
      method: "pdf-heuristic",
      confidence: "low",
      companyName: null,
      currency: null,
    };
  }

  // 1. LLM extraction (preferred).
  const llm = await extractFinancialsWithLlm(trimmed);
  if (llm && llm.records.length > 0) {
    return {
      records: llm.records,
      warnings: [
        "Figures were extracted by AI from the PDF. Please verify each value against the source document before running the analysis.",
        ...llm.notes,
      ],
      method: "pdf-llm",
      confidence: "medium",
      companyName: llm.companyName,
      currency: llm.currency,
    };
  }

  // 2. Heuristic fallback.
  const h = heuristicExtract(trimmed);
  return {
    records: h.records,
    warnings: [
      "Figures were extracted using a rule-based parser (no AI key configured). Accuracy is limited — carefully review and correct the table below before analysis.",
      ...h.warnings,
    ],
    method: "pdf-heuristic",
    confidence: "low",
    companyName: h.companyName,
    currency: null,
  };
}
