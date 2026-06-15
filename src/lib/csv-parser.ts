// Lightweight CSV parser. Supports quoted values and commas inside quotes.
// For the academic MVP we keep it dependency-free; Excel uploads are handled
// on the Python service side because xlsx requires a heavier library.

import type { FinancialRecordInput } from "./types";

export interface ParseResult {
  records: FinancialRecordInput[];
  warnings: string[];
}

const FIELD_ALIASES: Record<keyof FinancialRecordInput, string[]> = {
  year: ["year", "fy", "fiscal_year", "period"],
  revenue: ["revenue", "sales", "turnover", "total_revenue", "net_sales"],
  netIncome: ["net_income", "netincome", "profit", "net_profit", "earnings"],
  totalAssets: ["total_assets", "assets", "totalassets"],
  totalLiabilities: ["total_liabilities", "liabilities", "totalliabilities"],
  equity: ["equity", "shareholders_equity", "stockholders_equity", "total_equity"],
  cash: ["cash", "cash_and_equivalents", "cash_equivalents"],
  operatingCashFlow: [
    "operating_cash_flow",
    "operatingcashflow",
    "ocf",
    "cash_from_operations",
    "cfo",
  ],
  receivables: ["receivables", "accounts_receivable", "trade_receivables", "ar"],
  debt: ["debt", "total_debt", "borrowings", "long_term_debt"],
  costOfGoodsSold: ["cogs", "cost_of_goods_sold", "cost_of_sales", "cost_of_revenue"],
  expenses: ["expenses", "operating_expenses", "opex", "total_expenses"],
};

function normalize(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((c) => c.trim());
}

function parseNumeric(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[,\s]/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseFinancialsCsv(content: string): ParseResult {
  const warnings: string[] = [];
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { records: [], warnings: ["CSV must contain a header row and at least one data row."] };
  }

  const headerCells = splitCsvLine(lines[0]).map(normalize);
  const indexMap: Partial<Record<keyof FinancialRecordInput, number>> = {};

  (Object.keys(FIELD_ALIASES) as (keyof FinancialRecordInput)[]).forEach((key) => {
    const aliases = FIELD_ALIASES[key];
    for (const alias of aliases) {
      const idx = headerCells.indexOf(alias);
      if (idx !== -1) {
        indexMap[key] = idx;
        break;
      }
    }
  });

  const missing = (Object.keys(FIELD_ALIASES) as (keyof FinancialRecordInput)[]).filter(
    (k) => indexMap[k] === undefined
  );
  if (missing.length) {
    warnings.push(
      `Missing columns: ${missing.join(", ")}. They will default to 0 and may trigger a "missing data" red flag.`
    );
  }

  const records: FinancialRecordInput[] = [];
  for (let row = 1; row < lines.length; row++) {
    const cells = splitCsvLine(lines[row]);
    const record: FinancialRecordInput = {
      year: 0,
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

    (Object.keys(FIELD_ALIASES) as (keyof FinancialRecordInput)[]).forEach((key) => {
      const idx = indexMap[key];
      if (idx === undefined) return;
      const raw = cells[idx] ?? "";
      if (key === "year") {
        record.year = Math.floor(parseNumeric(raw));
      } else {
        (record as unknown as Record<string, number>)[key] = parseNumeric(raw);
      }
    });

    if (record.year > 0) {
      records.push(record);
    } else {
      warnings.push(`Row ${row + 1}: skipped (invalid or missing year).`);
    }
  }

  records.sort((a, b) => a.year - b.year);

  return { records, warnings };
}

export const SAMPLE_CSV_HEADER =
  "year,revenue,net_income,total_assets,total_liabilities,equity,cash,operating_cash_flow,receivables,debt,cost_of_goods_sold,expenses";
