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

/**
 * Build a small PDF containing only the given page indices (0-based). Used to
 * send just the financial-statement pages of a large filing to the vision
 * model, staying within OpenAI's per-request page/size limits and keeping it
 * fast. Pure-JS (pdf-lib) — no native deps. Returns null on failure.
 */
export async function buildStatementSubPdf(
  buffer: ArrayBuffer,
  pageIndices: number[]
): Promise<ArrayBuffer | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = src.getPageCount();
    const indices = [...new Set(pageIndices)]
      .filter((i) => i >= 0 && i < total)
      .sort((a, b) => a - b)
      .slice(0, 30); // cap pages sent to vision
    if (indices.length === 0) return null;
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    const bytes = await out.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } catch (err) {
    console.warn("buildStatementSubPdf failed:", err);
    return null;
  }
}

/** Extract financials from a PDF buffer using the OpenAI vision model. */
export async function extractFinancialsWithVision(
  buffer: ArrayBuffer,
  scaleHint?: number
): Promise<VisionExtraction | null> {
  if (!hasLlmKey()) return null;
  if (buffer.byteLength > MAX_PDF_BYTES) {
    console.warn(`Vision extraction skipped: PDF too large (${buffer.byteLength} bytes).`);
    return null;
  }

  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:application/pdf;base64,${base64}`;

  const scaleLabel =
    scaleHint === 1_000_000_000 ? "billions" : scaleHint === 1_000_000 ? "millions" : scaleHint === 1000 ? "thousands" : null;
  const scaleRule = scaleLabel
    ? `These statements are presented in ${scaleLabel}. Return every monetary value EXACTLY AS PRINTED (do NOT scale — the system applies the ${scaleLabel} multiplier).`
    : "Output ABSOLUTE currency units: if a statement is 'in millions' multiply by 1,000,000; 'in thousands' by 1,000 (an 'except shares in thousands' note applies only to share counts — ignore it).";

  const instruction = [
    "You are a precise financial-statement data-extraction engine reading a company filing (it may be a scanned image).",
    `Read the income statement, balance sheet, and cash-flow statement. ${scaleRule} Parentheses mean negative.`,
    "Return STRICT JSON with this shape:",
    '{"companyName": string|null, "currency": string|null, "records": [{"year": number, "revenue": number, "netIncome": number, "totalAssets": number, "totalLiabilities": number, "equity": number, "cash": number, "operatingCashFlow": number, "receivables": number, "debt": number, "costOfGoodsSold": number, "expenses": number}], "notes": string[]}',
    "Produce ONE record per reporting period (column), at most the 2 most recent. year = period-end calendar year (offset the older one by -1 if both share a year). Use TOTAL/subtotal lines. debt = SUM of all borrowings (short + long term + term debt + commercial paper + notes payable + bonds + sukuk). cash = cash and cash equivalents only. receivables = trade/accounts receivable (not vendor non-trade). costOfGoodsSold and expenses are positive. IFRS titles: 'statement of profit or loss' = income statement, 'statement of financial position' = balance sheet. For a BANK/financial institution, revenue = total operating income (net interest income + fee income + other income) and costOfGoodsSold = 0. Balance sheet must satisfy assets = liabilities + equity — re-read if it doesn't.",
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

  // Apply the known unit multiplier deterministically (model returned figures as
  // printed). Guard against double-scaling if the model scaled anyway.
  if (scaleLabel && scaleHint && scaleHint > 1) {
    const maxRaw = Math.max(0, ...records.flatMap((r) => NUMERIC_FIELDS.map((f) => Math.abs(r[f]))));
    if (maxRaw < 1e10) {
      for (const r of records) {
        for (const f of NUMERIC_FIELDS) r[f] = r[f] * scaleHint;
      }
    }
  }

  return {
    companyName: typeof parsed.companyName === "string" ? parsed.companyName : null,
    currency: typeof parsed.currency === "string" ? parsed.currency : null,
    records,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string") : [],
  };
}
