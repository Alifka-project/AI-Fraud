"use client";

import { Plus, Trash2 } from "lucide-react";
import type { FinancialRecordInput } from "@/lib/types";
import { Button } from "@/components/ui/button";

const FIELDS: Array<{ key: keyof FinancialRecordInput; label: string }> = [
  { key: "revenue", label: "Revenue" },
  { key: "costOfGoodsSold", label: "Cost of goods sold" },
  { key: "expenses", label: "Operating expenses" },
  { key: "netIncome", label: "Net income" },
  { key: "operatingCashFlow", label: "Operating cash flow" },
  { key: "totalAssets", label: "Total assets" },
  { key: "totalLiabilities", label: "Total liabilities" },
  { key: "equity", label: "Equity" },
  { key: "cash", label: "Cash" },
  { key: "receivables", label: "Receivables" },
  { key: "debt", label: "Debt" },
];

function emptyRecord(year: number): FinancialRecordInput {
  return {
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
}

interface Props {
  records: FinancialRecordInput[];
  onChange: (records: FinancialRecordInput[]) => void;
}

/**
 * Transposed, fully-editable financial table: fields as rows, fiscal years as
 * columns. Lets the user correct any value extracted from a PDF/Excel before
 * running the analysis — essential because document extraction is imperfect.
 */
export function EditableRecordsTable({ records, onChange }: Props) {
  function updateCell(colIdx: number, key: keyof FinancialRecordInput, value: number) {
    onChange(records.map((r, i) => (i === colIdx ? { ...r, [key]: value } : r)));
  }

  function addColumn() {
    const maxYear = records.length
      ? Math.max(...records.map((r) => r.year))
      : new Date().getFullYear() - 1;
    onChange([...records, emptyRecord(maxYear + 1)]);
  }

  function removeColumn(colIdx: number) {
    onChange(records.filter((_, i) => i !== colIdx));
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-semibold text-navy-700 border-b border-navy-100">
              Field (AED)
            </th>
            {records.map((r, ci) => (
              <th
                key={ci}
                className="py-2 px-2 text-left font-semibold text-navy-900 border-b border-navy-100 min-w-[130px]"
              >
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label={`Year for column ${ci + 1}`}
                    value={Number.isFinite(r.year) ? r.year : ""}
                    onChange={(e) =>
                      updateCell(ci, "year", Math.round(Number(e.target.value)) || 0)
                    }
                    className="w-20 rounded border border-navy-100 px-1.5 py-1 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  />
                  <button
                    type="button"
                    aria-label={`Remove year column ${ci + 1}`}
                    onClick={() => removeColumn(ci)}
                    className="text-muted-foreground hover:text-red-600 disabled:opacity-30"
                    disabled={records.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </th>
            ))}
            <th className="py-2 px-2 border-b border-navy-100">
              <Button type="button" variant="outline" size="sm" onClick={addColumn}>
                <Plus className="h-3.5 w-3.5" /> Year
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((f) => (
            <tr key={f.key} className="hover:bg-navy-50/40">
              <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-navy-700 border-b border-navy-50">
                {f.label}
              </td>
              {records.map((r, ci) => (
                <td key={ci} className="py-1.5 px-2 border-b border-navy-50">
                  <input
                    type="number"
                    aria-label={`${f.label} for ${r.year}`}
                    value={Number.isFinite(r[f.key]) ? (r[f.key] as number) : 0}
                    onChange={(e) => updateCell(ci, f.key, Number(e.target.value) || 0)}
                    className="w-full rounded border border-navy-100 px-1.5 py-1 text-right font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  />
                </td>
              ))}
              <td className="border-b border-navy-50" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
