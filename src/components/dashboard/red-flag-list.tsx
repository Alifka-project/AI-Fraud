"use client";

import { AlertOctagon, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { RedFlag } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const SEVERITY_META: Record<
  RedFlag["severity"],
  { Icon: typeof AlertOctagon; label: string; variant: "success" | "warning" | "danger" | "secondary" }
> = {
  low: { Icon: Info, label: "Low", variant: "secondary" },
  medium: { Icon: AlertCircle, label: "Medium", variant: "warning" },
  high: { Icon: AlertTriangle, label: "High", variant: "warning" },
  critical: { Icon: AlertOctagon, label: "Critical", variant: "danger" },
};

const ORDER: Record<RedFlag["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function RedFlagList({ flags }: { flags: RedFlag[] }) {
  if (!flags.length) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        No automated red flags triggered. Manual review of audited statements and bank movements
        is still recommended.
      </div>
    );
  }

  const sorted = [...flags].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return (
    <div className="space-y-3">
      {sorted.map((f, i) => {
        const meta = SEVERITY_META[f.severity];
        const Icon = meta.Icon;
        return (
          <div
            key={i}
            className="rounded-lg border border-navy-100 bg-white p-4 hover:shadow-soft transition-shadow"
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  f.severity === "critical"
                    ? "rounded-md bg-red-100 text-red-700 p-2"
                    : f.severity === "high"
                      ? "rounded-md bg-orange-100 text-orange-700 p-2"
                      : f.severity === "medium"
                        ? "rounded-md bg-amber-100 text-amber-700 p-2"
                        : "rounded-md bg-navy-100 text-navy-700 p-2"
                }
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-navy-900">{f.title}</p>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {f.description}
                </p>
                {f.metric && f.metricValue !== undefined ? (
                  <p className="mt-2 text-xs font-mono text-navy-700">
                    {f.metric}: {Number(f.metricValue).toFixed(3)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
