"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { FinancialRecordInput } from "@/lib/types";

interface Props {
  records: FinancialRecordInput[];
  currency?: string;
}

function fmt(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
}

export function RevenueIncomeChart({ records, currency = "AED" }: Props) {
  const data = [...records]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      Revenue: Math.round(r.revenue),
      "Net Income": Math.round(r.netIncome),
      "Operating Cash Flow": Math.round(r.operatingCashFlow),
    }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} tickFormatter={fmt} />
        <Tooltip
          formatter={(value: number) => `${currency} ${value.toLocaleString()}`}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="Revenue"
          stroke="#0d9488"
          strokeWidth={2.5}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="Net Income"
          stroke="#1e3a5f"
          strokeWidth={2.5}
          dot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="Operating Cash Flow"
          stroke="#f97316"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BalanceSheetChart({ records, currency = "AED" }: Props) {
  const data = [...records]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      Assets: Math.round(r.totalAssets),
      Liabilities: Math.round(r.totalLiabilities),
      Equity: Math.round(r.equity),
    }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} tickFormatter={fmt} />
        <Tooltip
          formatter={(value: number) => `${currency} ${value.toLocaleString()}`}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Assets" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Liabilities" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Equity" fill="#0d9488" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ReceivablesDebtChart({ records, currency = "AED" }: Props) {
  const data = [...records]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      Receivables: Math.round(r.receivables),
      Debt: Math.round(r.debt),
      Cash: Math.round(r.cash),
    }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} tickFormatter={fmt} />
        <Tooltip
          formatter={(value: number) => `${currency} ${value.toLocaleString()}`}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Receivables" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="Debt" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="Cash" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
