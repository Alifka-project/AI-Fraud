"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { RiskAssessmentResult } from "@/lib/types";

interface Props {
  scores: RiskAssessmentResult["componentScores"];
}

const COMPONENTS: Array<{
  key: keyof RiskAssessmentResult["componentScores"];
  label: string;
  description: string;
  weight: string;
}> = [
  {
    key: "manipulation",
    label: "Statement manipulation",
    description: "Beneish-style indicators + accruals quality",
    weight: "30%",
  },
  {
    key: "liquidity",
    label: "Cash-flow & liquidity",
    description: "Current ratio, leverage, Altman Z-score",
    weight: "20%",
  },
  {
    key: "mlModel",
    label: "ML fraud probability",
    description: "XGBoost classifier (or fallback heuristic)",
    weight: "20%",
  },
  {
    key: "anomaly",
    label: "Anomaly detection",
    description: "Isolation Forest (or centroid distance)",
    weight: "10%",
  },
  {
    key: "document",
    label: "Document consistency",
    description: "LLM/rule-based consistency review",
    weight: "15%",
  },
  {
    key: "external",
    label: "External verification",
    description: "Placeholder for KYB / trade-licence checks",
    weight: "5%",
  },
];

function indicatorColor(score: number): string {
  if (score < 30) return "bg-emerald-500";
  if (score < 60) return "bg-amber-500";
  if (score < 80) return "bg-orange-500";
  return "bg-red-500";
}

export function ComponentScores({ scores }: Props) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-navy-900">Component breakdown</h3>
            <p className="text-xs text-muted-foreground">
              How each signal contributes to the weighted overall score.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {COMPONENTS.map((c) => {
            const v = scores[c.key];
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-navy-900">{c.label}</span>
                    <span className="text-[10px] text-muted-foreground bg-navy-50 rounded-full px-1.5 py-0.5">
                      {c.weight}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-navy-900">{v.toFixed(0)}</span>
                </div>
                <Progress value={v} indicatorClassName={indicatorColor(v)} />
                <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
