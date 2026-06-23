"use client";

import { useState } from "react";
import {
  Network,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Layers,
  Cpu,
  FileStack,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RlmNode, RlmQualitativeFlag, RlmResult } from "@/lib/types";

const SEV: Record<
  RlmQualitativeFlag["severity"],
  { Icon: typeof AlertOctagon; chip: string; dot: string; label: string }
> = {
  critical: { Icon: AlertOctagon, chip: "bg-red-100 text-red-700", dot: "bg-red-500", label: "Critical" },
  high: { Icon: AlertTriangle, chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500", label: "High" },
  medium: { Icon: AlertCircle, chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500", label: "Medium" },
  low: { Icon: Info, chip: "bg-navy-100 text-navy-700", dot: "bg-navy-400", label: "Low" },
};

const KIND_COLOR: Record<RlmNode["kind"], string> = {
  root: "bg-navy-900 text-white",
  section: "bg-teal-50 text-teal-700 border border-teal-200",
  chunk: "bg-navy-50 text-navy-700 border border-navy-200",
  reduce: "bg-amber-50 text-amber-700 border border-amber-200",
};

function TraceTree({ nodes }: { nodes: RlmNode[] }) {
  const childrenOf = (id: string | null) => nodes.filter((n) => n.parentId === id);
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return null;

  function render(node: RlmNode, depth: number): React.ReactNode {
    const kids = childrenOf(node.id);
    return (
      <div key={node.id} style={{ marginLeft: depth === 0 ? 0 : 14 }} className="mt-1">
        <div className="flex items-start gap-2">
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_COLOR[node.kind]}`}
          >
            {node.kind}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-navy-900 truncate">
              {node.label}
              {node.chars > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  · {Math.round(node.chars / 1000)}k chars
                </span>
              ) : null}
            </p>
            {node.digest ? (
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                {node.digest}
              </p>
            ) : null}
          </div>
        </div>
        {kids.length ? (
          <div className="border-l border-navy-100 pl-2">{kids.map((k) => render(k, depth + 1))}</div>
        ) : null}
      </div>
    );
  }

  return <div className="text-xs">{render(root, 0)}</div>;
}

export function RlmPanel({ rlm }: { rlm: RlmResult }) {
  const [showTree, setShowTree] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const t = rlm.trace;

  return (
    <Card className="border-navy-200 bg-gradient-to-br from-white to-navy-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5 text-teal-600" />
          Recursive Language Model · Document Intelligence
        </CardTitle>
        <CardDescription>
          The full filing was recursively decomposed into sections and analysed for qualitative
          due-diligence signals beyond the numbers. {t.provider}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Trace stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={FileStack} label="Sections" value={t.sectionsAnalyzed.toString()} />
          <Stat icon={Network} label="Recursive nodes" value={t.totalCalls.toString()} />
          <Stat icon={Layers} label="Max depth" value={t.maxDepth.toString()} />
          <Stat
            icon={Cpu}
            label={t.llmCalls > 0 ? "Model calls" : "Rule-based"}
            value={t.llmCalls > 0 ? t.llmCalls.toString() : `${Math.round(t.charsProcessed / 1000)}k`}
          />
        </div>

        {/* Synthesized document-review summary */}
        <div className="rounded-lg border border-navy-100 bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Recursive document review
          </p>
          <p className="text-sm leading-relaxed text-navy-900 whitespace-pre-line">{rlm.summary}</p>
        </div>

        {/* Qualitative flags */}
        <div>
          <p className="text-sm font-semibold text-navy-900 mb-2">
            Qualitative disclosures ({rlm.qualitativeFlags.length})
          </p>
          {rlm.qualitativeFlags.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              No qualitative red-flag language detected in the narrative sections.
            </div>
          ) : (
            <div className="space-y-2">
              {rlm.qualitativeFlags.map((f, i) => {
                const meta = SEV[f.severity];
                const Icon = meta.Icon;
                return (
                  <div key={i} className="rounded-lg border border-navy-100 bg-white p-3">
                    <div className="flex items-start gap-2">
                      <div className={`rounded-md p-1.5 ${meta.chip}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-navy-900">{f.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-[11px] uppercase tracking-wide text-teal-700 mt-0.5">
                          {f.section}
                        </p>
                        {f.evidence ? (
                          <p className="mt-1 text-xs text-muted-foreground italic leading-snug">
                            “{f.evidence}”
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Collapsible: section digests */}
        {rlm.sectionDigests.length > 0 ? (
          <div className="rounded-lg border border-navy-100">
            <button
              className="flex w-full items-center justify-between p-3 text-sm font-medium text-navy-900"
              onClick={() => setShowSections((v) => !v)}
            >
              <span>Section-by-section digest ({rlm.sectionDigests.length})</span>
              {showSections ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {showSections ? (
              <div className="border-t border-navy-100 p-3 space-y-2">
                {rlm.sectionDigests.map((d, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-semibold text-teal-700">{d.section}: </span>
                    <span className="text-muted-foreground">{d.digest}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Collapsible: recursion trace */}
        <div className="rounded-lg border border-navy-100">
          <button
            className="flex w-full items-center justify-between p-3 text-sm font-medium text-navy-900"
            onClick={() => setShowTree((v) => !v)}
          >
            <span>Recursion trace ({t.totalCalls} nodes)</span>
            {showTree ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showTree ? (
            <div className="border-t border-navy-100 p-3 max-h-80 overflow-auto">
              <TraceTree nodes={t.nodes} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-navy-100 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-teal-600" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1.5 text-xl font-bold text-navy-900">{value}</p>
    </div>
  );
}
