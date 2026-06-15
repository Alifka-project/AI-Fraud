"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { FeatureImportance } from "@/lib/types";

interface Props {
  features: FeatureImportance[];
}

export function FeatureImportanceChart({ features }: Props) {
  const data = features.map((f) => ({
    name: f.feature,
    importance: Math.round(f.importance),
    direction: f.direction,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, features.length * 38)}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 24, left: 12, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" stroke="#64748b" fontSize={11} domain={[0, 100]} />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#64748b"
          fontSize={11}
          width={210}
          interval={0}
        />
        <Tooltip
          formatter={(value: number) => `${value} / 100 importance`}
          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.direction === "increase_risk" ? "#dc2626" : "#0d9488"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
