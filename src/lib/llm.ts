// OpenAI-compatible LLM client used by the Next.js fallback path.
// This is what powers the AI due-diligence summary in Vercel-only deployments
// (where the Python ML service isn't available).
//
// Reads OPENAI_API_KEY from the environment. If not set, callers should fall
// back to the rule-based template in fallback-engine.ts.

import type {
  CompanyMetadata,
  FinancialRatios,
  FinancialRecordInput,
  RedFlag,
  RiskAssessmentResult,
} from "./types";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export function hasLlmKey(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? "").trim());
}

interface LlmInput {
  company: CompanyMetadata;
  overallScore: number;
  riskLevel: string;
  ratios: FinancialRatios;
  redFlags: RedFlag[];
}

function buildPrompt(input: LlmInput): string {
  const { company, overallScore, riskLevel, ratios, redFlags } = input;
  const topFlags = redFlags
    .slice(0, 10)
    .map((f) => `  ${f.severity.toUpperCase()} — ${f.title}`)
    .join("\n");

  return [
    "You are a forensic accounting analyst preparing a due-diligence brief for an investor in Dubai. Use only the figures provided. Do not claim the company is fraudulent — phrase concerns as risk indicators. Keep the brief under 220 words.",
    "",
    `Company: ${company.name}`,
    `Industry: ${company.industry || "unspecified"}`,
    `Location: ${company.location || "unspecified"}`,
    `Risk score: ${overallScore.toFixed(1)} / 100 (${riskLevel})`,
    "",
    "Key ratios:",
    `  Revenue growth: ${(ratios.revenueGrowth * 100).toFixed(1)}%`,
    `  Net profit margin: ${(ratios.netProfitMargin * 100).toFixed(1)}%`,
    `  OCF / Net income: ${ratios.ocfToNetIncome.toFixed(2)}`,
    `  Debt / Equity: ${ratios.debtToEquity.toFixed(2)}`,
    `  Receivables / Revenue: ${(ratios.receivablesToRevenue * 100).toFixed(1)}%`,
    `  Beneish M-score (proxy): ${ratios.beneishMScore.toFixed(2)}`,
    `  Altman Z-score (proxy): ${ratios.altmanZScore.toFixed(2)}`,
    "",
    "Detected red flags (severity — title):",
    topFlags || "  (none)",
    "",
    "Produce: (1) a one-sentence executive verdict, (2) two-to-three sentences on the most material red flags, (3) a closing sentence with recommended next steps.",
  ].join("\n");
}

export async function generateLlmSummary(
  input: LlmInput
): Promise<{ summary: string; provider: string } | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const prompt = buildPrompt(input);

  try {
    const res = await fetch(`${DEFAULT_BASE.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a careful forensic accounting analyst. Never claim a company is fraudulent — use risk-indicator language.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`LLM call returned ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return {
      summary: content,
      provider: `OpenAI-compatible API (${DEFAULT_MODEL})`,
    };
  } catch (err) {
    console.warn("LLM call failed:", err);
    return null;
  }
}

export async function maybeEnhanceWithLlm(
  result: RiskAssessmentResult
): Promise<RiskAssessmentResult> {
  // Only enhance when the result came from a fallback path (no real LLM yet).
  const isFallback =
    !result.modelInfo?.llmProvider ||
    /fallback|rule-based|no LLM/i.test(result.modelInfo.llmProvider);
  if (!isFallback) return result;

  const llm = await generateLlmSummary({
    company: result.company,
    overallScore: result.overallScore,
    riskLevel: result.riskLevel,
    ratios: result.ratios,
    redFlags: result.redFlags,
  });
  if (!llm) return result;

  return {
    ...result,
    llmSummary: llm.summary,
    modelInfo: { ...result.modelInfo, llmProvider: llm.provider },
  };
}

// ---------------------------------------------------------------------------
// Financial-statement extraction from raw document text (PDF/Excel/free text).
// Uses OpenAI JSON mode for robust structured extraction. Returns null when no
// key is configured or the call fails — callers then use the heuristic parser.
// ---------------------------------------------------------------------------

export interface LlmExtractionResult {
  companyName: string | null;
  currency: string | null;
  records: FinancialRecordInput[];
  notes: string[];
}

const NUMERIC_FIELDS: (keyof FinancialRecordInput)[] = [
  "revenue",
  "netIncome",
  "totalAssets",
  "totalLiabilities",
  "equity",
  "cash",
  "operatingCashFlow",
  "receivables",
  "debt",
  "costOfGoodsSold",
  "expenses",
];

function coerceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[(),\s]/g, "").replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) {
      // Honour parentheses-as-negative if the original had them.
      return /\(/.test(value) ? -Math.abs(n) : n;
    }
  }
  return 0;
}

function normaliseExtractedRecords(raw: unknown): FinancialRecordInput[] {
  if (!Array.isArray(raw)) return [];
  const out: FinancialRecordInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const year = Math.round(coerceNumber(obj.year));
    if (!year || year < 1990 || year > 2100) continue;
    const record: FinancialRecordInput = {
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
    };
    for (const f of NUMERIC_FIELDS) {
      record[f] = coerceNumber(obj[f]);
    }
    // Costs are magnitudes regardless of how the statement signs them.
    record.costOfGoodsSold = Math.abs(record.costOfGoodsSold);
    record.expenses = Math.abs(record.expenses);
    out.push(record);
  }
  return out.sort((a, b) => a.year - b.year);
}

export async function extractFinancialsWithLlm(
  documentText: string
): Promise<LlmExtractionResult | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  // Cap input to control token usage; the headline figures of a financial
  // statement almost always appear in the first pages.
  const text = documentText.slice(0, 18000);

  const systemPrompt =
    "You are a precise financial-statement data-extraction engine. You read the raw text of a company's financial statements (income statement, balance sheet, cash-flow statement) and return STRICT JSON. Never invent figures — use 0 for any value you cannot find. Output absolute currency units: if the statement says values are in thousands or millions, multiply accordingly. Use negative numbers for losses and cash outflows (including figures shown in parentheses).";

  const userPrompt = [
    "Extract every fiscal year present in the document. Return JSON with this exact shape:",
    "{",
    '  "companyName": string | null,',
    '  "currency": string | null,',
    '  "records": [',
    "    {",
    '      "year": number,',
    '      "revenue": number,',
    '      "netIncome": number,',
    '      "totalAssets": number,',
    '      "totalLiabilities": number,',
    '      "equity": number,',
    '      "cash": number,',
    '      "operatingCashFlow": number,',
    '      "receivables": number,',
    '      "debt": number,',
    '      "costOfGoodsSold": number,',
    '      "expenses": number',
    "    }",
    "  ],",
    '  "notes": string[]',
    "}",
    "",
    "Field guidance:",
    "- revenue = total sales / turnover / total revenue.",
    "- netIncome = net profit / profit for the year (negative if a loss).",
    "- operatingCashFlow = net cash from operating activities (negative if outflow).",
    "- receivables = trade/accounts receivable.",
    "- debt = total borrowings / loans (short + long term).",
    "- costOfGoodsSold = cost of sales / cost of revenue.",
    "- expenses = operating expenses / SG&A (exclude COGS).",
    "- equity = total shareholders' / owners' equity.",
    "Put any assumptions or unit conversions you made into notes[].",
    "",
    "DOCUMENT TEXT:",
    "```",
    text,
    "```",
  ].join("\n");

  try {
    const res = await fetch(`${DEFAULT_BASE.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.warn(`LLM extraction returned ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Some models wrap JSON in prose; try to recover the JSON object.
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }

    const records = normaliseExtractedRecords(parsed.records);
    if (records.length === 0) return null;

    return {
      companyName:
        typeof parsed.companyName === "string" ? parsed.companyName : null,
      currency: typeof parsed.currency === "string" ? parsed.currency : null,
      records,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === "string")
        : [],
    };
  } catch (err) {
    console.warn("LLM extraction failed:", err);
    return null;
  }
}
