// Vision / OCR extraction for scanned or layout-complex PDFs.
//
// Modern GPT-4o models accept a PDF directly as a `file` content part — OpenAI
// rasterises each page and runs vision + OCR internally. This means scanned
// (image-only) PDFs work on Vercel with no native canvas/Tesseract dependency,
// and it is the most accurate path for complex statement layouts.
//
// Used by the upload route as a fallback when text extraction yields nothing or
// produces low-confidence (failing-reconciliation) figures.

import { callOpenAIChat, hasLlmKey, parseLlmJson } from "./llm";
import type { FinancialRecordInput } from "./types";

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_PDF_BYTES = 8 * 1024 * 1024; // keep the base64 payload within sane limits

export interface VisionExtraction {
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

function coerce(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const neg = /\(/.test(value);
    const n = Number(value.replace(/[(),\s]/g, "").replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return neg ? -Math.abs(n) : n;
  }
  return 0;
}

function normalise(raw: unknown): FinancialRecordInput[] {
  if (!Array.isArray(raw)) return [];
  const out: FinancialRecordInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const year = Math.round(coerce(o.year));
    if (!year || year < 1990 || year > 2100) continue;
    const rec: FinancialRecordInput = {
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
    for (const f of NUMERIC_FIELDS) rec[f] = coerce(o[f]);
    rec.costOfGoodsSold = Math.abs(rec.costOfGoodsSold);
    rec.expenses = Math.abs(rec.expenses);
    out.push(rec);
  }
  return out.sort((a, b) => a.year - b.year);
}

export function visionAvailable(): boolean {
  return hasLlmKey();
}

/** Extract financials from a PDF buffer using the OpenAI vision model. */
export async function extractFinancialsWithVision(
  buffer: ArrayBuffer
): Promise<VisionExtraction | null> {
  if (!hasLlmKey()) return null;
  if (buffer.byteLength > MAX_PDF_BYTES) {
    console.warn(`Vision extraction skipped: PDF too large (${buffer.byteLength} bytes).`);
    return null;
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:application/pdf;base64,${base64}`;

  const instruction = [
    "You are a precise financial-statement data-extraction engine reading a company filing (it may be a scanned image).",
    "Read the income statement, balance sheet, and cash-flow statement. Output ABSOLUTE currency units: if a statement is 'in millions' multiply by 1,000,000; 'in thousands' by 1,000 (an 'except shares in thousands' note applies only to share counts — ignore it). Parentheses mean negative.",
    "Return STRICT JSON with this shape:",
    '{"companyName": string|null, "currency": string|null, "records": [{"year": number, "revenue": number, "netIncome": number, "totalAssets": number, "totalLiabilities": number, "equity": number, "cash": number, "operatingCashFlow": number, "receivables": number, "debt": number, "costOfGoodsSold": number, "expenses": number}], "notes": string[]}',
    "Produce ONE record per reporting period (column), at most the 2 most recent. year = period-end calendar year (offset the older one by -1 if both share a year). Use TOTAL/subtotal lines. debt = SUM of all borrowings (short + long term + term debt + commercial paper + notes payable). cash = cash and cash equivalents only. receivables = trade/accounts receivable (not vendor non-trade). costOfGoodsSold and expenses are positive. Balance sheet must satisfy assets = liabilities + equity — re-read if it doesn't.",
  ].join("\n");

  const content = await callOpenAIChat(
    [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "file", file: { filename: "filing.pdf", file_data: dataUrl } },
        ],
      },
    ],
    { json: true, model: VISION_MODEL, maxTokens: 1600, temperature: 0, timeoutMs: 60000 }
  );

  const parsed = parseLlmJson<{
    companyName?: string;
    currency?: string;
    records?: unknown;
    notes?: unknown;
  }>(content);
  if (!parsed) return null;

  const records = normalise(parsed.records);
  if (records.length === 0) return null;

  return {
    companyName: typeof parsed.companyName === "string" ? parsed.companyName : null,
    currency: typeof parsed.currency === "string" ? parsed.currency : null,
    records,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string") : [],
  };
}
