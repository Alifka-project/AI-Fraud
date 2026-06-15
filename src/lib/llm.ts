// OpenAI-compatible LLM client used by the Next.js fallback path.
// This is what powers the AI due-diligence summary in Vercel-only deployments
// (where the Python ML service isn't available).
//
// Reads OPENAI_API_KEY from the environment. If not set, callers should fall
// back to the rule-based template in fallback-engine.ts.

import type {
  CompanyMetadata,
  FinancialRatios,
  RedFlag,
  RiskAssessmentResult,
} from "./types";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const DEFAULT_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

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
