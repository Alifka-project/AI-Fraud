// Server-side validation & sanitisation for analysis requests. Keeps malformed
// or abusive payloads out of the scoring engine and bounds resource use.

import type { AnalysisRequest, FinancialRecordInput } from "./types";

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

const MAX_RECORDS = 20;
const MAX_ABS = 1e15; // clamp absurd magnitudes

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_ABS, Math.min(MAX_ABS, n));
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export interface ValidationOk {
  ok: true;
  value: AnalysisRequest;
}
export interface ValidationErr {
  ok: false;
  error: string;
}

export function validateAnalysisRequest(input: unknown): ValidationOk | ValidationErr {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const body = input as Record<string, unknown>;
  const company = body.company as Record<string, unknown> | undefined;

  const name = str(company?.name, 200);
  if (!name) return { ok: false, error: "company.name is required." };

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return { ok: false, error: "records[] must contain at least one financial year." };
  }
  if (body.records.length > MAX_RECORDS) {
    return { ok: false, error: `Too many records (max ${MAX_RECORDS}).` };
  }

  const records: FinancialRecordInput[] = [];
  for (const raw of body.records as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const year = Math.round(num(r.year));
    if (year < 1900 || year > 2200) continue;
    const rec = { year } as FinancialRecordInput;
    for (const f of NUMERIC_FIELDS) rec[f] = num(r[f]);
    records.push(rec);
  }
  if (records.length === 0) {
    return { ok: false, error: "No valid financial records (each needs a plausible year)." };
  }

  const cur = str((company as Record<string, unknown>)?.currency, 8);
  const value: AnalysisRequest = {
    company: {
      name,
      industry: str(company?.industry, 120),
      location: str(company?.location, 160),
      requestedAmount:
        company?.requestedAmount != null ? num(company.requestedAmount) : undefined,
      notes: str(company?.notes, 2000),
      currency: cur ? cur.toUpperCase() : undefined,
    },
    records,
    // rlm is passed through as-is; it's produced server-side at upload.
    rlm: (body.rlm as AnalysisRequest["rlm"]) ?? undefined,
  };
  return { ok: true, value };
}
