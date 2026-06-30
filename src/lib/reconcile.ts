// Post-extraction reconciliation. Financial statements obey identities
// (Assets = Liabilities + Equity, Gross margin = Revenue − COGS, …). Checking
// them catches extraction errors that a single LLM/heuristic pass can miss,
// produces a confidence score, and decides when to escalate to vision OCR.

import type { FinancialRecordInput } from "./types";

export interface ReconciliationIssue {
  year: number;
  field: string;
  message: string;
  severity: "warn" | "error";
}

export interface ReconciliationResult {
  confidence: number; // 0..1
  level: "high" | "medium" | "low";
  issues: ReconciliationIssue[];
}

function rel(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base;
}

export function reconcileRecords(records: FinancialRecordInput[]): ReconciliationResult {
  const issues: ReconciliationIssue[] = [];
  if (records.length === 0) {
    return { confidence: 0, level: "low", issues: [] };
  }

  let penalty = 0;
  const sorted = [...records].sort((a, b) => a.year - b.year);

  for (const r of sorted) {
    // 1. Balance-sheet identity: Assets ≈ Liabilities + Equity.
    if (r.totalAssets > 0 && (r.totalLiabilities > 0 || r.equity !== 0)) {
      const diff = rel(r.totalAssets, r.totalLiabilities + r.equity);
      if (diff > 0.05) {
        penalty += diff > 0.2 ? 0.25 : 0.12;
        issues.push({
          year: r.year,
          field: "totalAssets",
          severity: diff > 0.2 ? "error" : "warn",
          message: `Balance sheet does not balance: assets (${r.totalAssets.toLocaleString()}) vs liabilities + equity (${(r.totalLiabilities + r.equity).toLocaleString()}) — ${(diff * 100).toFixed(1)}% gap.`,
        });
      }
    }

    // 2. Non-negativity for stock/flow magnitudes that can't be negative.
    for (const [field, value] of [
      ["revenue", r.revenue],
      ["totalAssets", r.totalAssets],
      ["totalLiabilities", r.totalLiabilities],
      ["cash", r.cash],
      ["receivables", r.receivables],
      ["debt", r.debt],
      ["costOfGoodsSold", r.costOfGoodsSold],
    ] as const) {
      if (value < 0) {
        penalty += 0.08;
        issues.push({ year: r.year, field, severity: "warn", message: `${field} is negative (${value.toLocaleString()}), which is unusual.` });
      }
    }

    // 3. Gross margin sanity: COGS shouldn't materially exceed revenue.
    if (r.revenue > 0 && r.costOfGoodsSold > r.revenue * 1.2) {
      penalty += 0.1;
      issues.push({ year: r.year, field: "costOfGoodsSold", severity: "warn", message: `Cost of goods sold (${r.costOfGoodsSold.toLocaleString()}) exceeds revenue (${r.revenue.toLocaleString()}).` });
    }

    // 4. Net margin sanity: |net income| shouldn't exceed ~1.5× revenue.
    if (r.revenue > 0 && Math.abs(r.netIncome) > r.revenue * 1.5) {
      penalty += 0.1;
      issues.push({ year: r.year, field: "netIncome", severity: "warn", message: `Net income (${r.netIncome.toLocaleString()}) is implausibly large vs revenue (${r.revenue.toLocaleString()}).` });
    }

    // 5. Sub-totals can't exceed their parent totals (allow small slack).
    if (r.totalAssets > 0) {
      for (const [field, value] of [["cash", r.cash], ["receivables", r.receivables]] as const) {
        if (value > r.totalAssets * 1.05) {
          penalty += 0.08;
          issues.push({ year: r.year, field, severity: "warn", message: `${field} (${value.toLocaleString()}) exceeds total assets (${r.totalAssets.toLocaleString()}).` });
        }
      }
    }
    if (r.totalLiabilities > 0 && r.debt > r.totalLiabilities * 1.05) {
      penalty += 0.06;
      issues.push({ year: r.year, field: "debt", severity: "warn", message: `Debt (${r.debt.toLocaleString()}) exceeds total liabilities (${r.totalLiabilities.toLocaleString()}).` });
    }

    // 6. Completeness: the core fields should be present.
    const missing = (["revenue", "totalAssets", "totalLiabilities", "equity"] as const).filter(
      (f) => !r[f]
    );
    if (missing.length) {
      penalty += 0.05 * missing.length;
      issues.push({ year: r.year, field: missing.join(","), severity: "warn", message: `Missing core figures: ${missing.join(", ")}.` });
    }
  }

  const confidence = Math.max(0, Math.min(1, 1 - penalty));
  const level = confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
  return { confidence: Math.round(confidence * 100) / 100, level, issues };
}
