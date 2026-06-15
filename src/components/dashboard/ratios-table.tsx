"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { FinancialRatios } from "@/lib/types";
import { formatNumber, formatPercent } from "@/lib/utils";

interface RatioDef {
  key: keyof FinancialRatios;
  label: string;
  format: "percent" | "number";
  healthy: (v: number) => "good" | "ok" | "bad";
  benchmark: string;
}

const RATIOS: RatioDef[] = [
  {
    key: "revenueGrowth",
    label: "Revenue growth (YoY)",
    format: "percent",
    healthy: (v) => (v > 0.05 ? "good" : v > -0.05 ? "ok" : "bad"),
    benchmark: "> 5%",
  },
  {
    key: "netProfitMargin",
    label: "Net profit margin",
    format: "percent",
    healthy: (v) => (v > 0.08 ? "good" : v > 0 ? "ok" : "bad"),
    benchmark: "> 8%",
  },
  {
    key: "grossMargin",
    label: "Gross margin",
    format: "percent",
    healthy: (v) => (v > 0.25 ? "good" : v > 0.1 ? "ok" : "bad"),
    benchmark: "> 25%",
  },
  {
    key: "currentRatio",
    label: "Current ratio",
    format: "number",
    healthy: (v) => (v > 1.5 ? "good" : v > 1 ? "ok" : "bad"),
    benchmark: "> 1.5",
  },
  {
    key: "debtToEquity",
    label: "Debt / Equity",
    format: "number",
    healthy: (v) => (v < 1 ? "good" : v < 2 ? "ok" : "bad"),
    benchmark: "< 1.0",
  },
  {
    key: "returnOnAssets",
    label: "Return on assets",
    format: "percent",
    healthy: (v) => (v > 0.05 ? "good" : v > 0 ? "ok" : "bad"),
    benchmark: "> 5%",
  },
  {
    key: "returnOnEquity",
    label: "Return on equity",
    format: "percent",
    healthy: (v) => (v > 0.1 ? "good" : v > 0 ? "ok" : "bad"),
    benchmark: "> 10%",
  },
  {
    key: "ocfToNetIncome",
    label: "OCF / Net income",
    format: "number",
    healthy: (v) => (v > 1 ? "good" : v > 0.5 ? "ok" : "bad"),
    benchmark: "> 1.0",
  },
  {
    key: "receivablesToRevenue",
    label: "Receivables / Revenue",
    format: "percent",
    healthy: (v) => (v < 0.2 ? "good" : v < 0.35 ? "ok" : "bad"),
    benchmark: "< 20%",
  },
  {
    key: "assetTurnover",
    label: "Asset turnover",
    format: "number",
    healthy: (v) => (v > 0.8 ? "good" : v > 0.4 ? "ok" : "bad"),
    benchmark: "> 0.8",
  },
  {
    key: "leverageRatio",
    label: "Leverage ratio",
    format: "number",
    healthy: (v) => (v < 0.5 ? "good" : v < 0.7 ? "ok" : "bad"),
    benchmark: "< 0.5",
  },
  {
    key: "cashFlowQuality",
    label: "Cash flow quality",
    format: "number",
    healthy: (v) => (v > 1 ? "good" : v > 0.5 ? "ok" : "bad"),
    benchmark: "> 1.0",
  },
  {
    key: "beneishMScore",
    label: "Beneish M-Score (proxy)",
    format: "number",
    healthy: (v) => (v < -2.22 ? "good" : v < -1.78 ? "ok" : "bad"),
    benchmark: "< -2.22",
  },
  {
    key: "altmanZScore",
    label: "Altman Z-Score (proxy)",
    format: "number",
    healthy: (v) => (v > 2.9 ? "good" : v > 1.23 ? "ok" : "bad"),
    benchmark: "> 2.9",
  },
];

function badgeFor(state: "good" | "ok" | "bad") {
  if (state === "good") return "text-emerald-700 bg-emerald-50";
  if (state === "ok") return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export function RatiosTable({ ratios }: { ratios: FinancialRatios }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-navy-900">Financial ratio analysis</h3>
            <p className="text-xs text-muted-foreground">
              Forensic ratios computed from the uploaded statements.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-navy-700 text-xs uppercase">
                <th className="py-2 pr-3 font-semibold">Ratio</th>
                <th className="py-2 pr-3 font-semibold">Value</th>
                <th className="py-2 pr-3 font-semibold">Benchmark</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {RATIOS.map((r) => {
                const v = ratios[r.key] as number;
                const state = r.healthy(v);
                return (
                  <tr key={r.key} className="border-b border-navy-50 last:border-0">
                    <td className="py-2.5 pr-3 text-navy-900">{r.label}</td>
                    <td className="py-2.5 pr-3 font-mono text-navy-900">
                      {r.format === "percent" ? formatPercent(v) : formatNumber(v)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">{r.benchmark}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeFor(state)}`}
                      >
                        {state === "good" ? "Healthy" : state === "ok" ? "Watch" : "Concern"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
