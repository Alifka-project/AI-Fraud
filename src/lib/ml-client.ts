// Thin client that talks to the Python FastAPI ML service.
// Falls back to the TypeScript engine if the service is unreachable, then
// optionally enhances the rule-based summary with the OpenAI key (if set).

import type { AnalysisRequest, RiskAssessmentResult } from "./types";
import { fallbackAnalyze } from "./fallback-engine";
import { maybeEnhanceWithLlm } from "./llm";

function getMlUrl(): string | null {
  const raw = (process.env.ML_SERVICE_URL ?? "").trim();
  if (!raw) return null;
  // Treat the default localhost URL as "not configured" when we're clearly
  // running on a deploy where localhost can't possibly be the ML service.
  return raw.replace(/\/$/, "");
}

export async function callMlService(payload: AnalysisRequest): Promise<RiskAssessmentResult> {
  const url = getMlUrl();
  if (url) {
    try {
      const res = await fetch(`${url}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`ML service returned ${res.status}`);
      }
      const data = (await res.json()) as RiskAssessmentResult;
      if (!("overallScore" in data) || !("ratios" in data)) {
        throw new Error("ML service returned an unexpected payload shape.");
      }
      return data;
    } catch (err) {
      console.warn("ML service unreachable, using fallback engine:", err);
    }
  }

  // Local fallback path: deterministic TS engine + optional LLM enhancement.
  const fallback = fallbackAnalyze(payload);
  return maybeEnhanceWithLlm(fallback);
}

export async function callMlUploadService(
  file: File,
  meta: Record<string, unknown>
): Promise<RiskAssessmentResult> {
  const url = getMlUrl();
  if (!url) {
    throw new Error(
      "Excel uploads require the Python ML service. Set ML_SERVICE_URL or upload as CSV."
    );
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("company", JSON.stringify(meta));
  const res = await fetch(`${url}/upload-analyze`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`ML upload service returned ${res.status}`);
  }
  return (await res.json()) as RiskAssessmentResult;
}

export async function checkMlHealth(): Promise<boolean> {
  const url = getMlUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
