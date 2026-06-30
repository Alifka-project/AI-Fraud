import { NextResponse } from "next/server";
import { checkMlHealth } from "@/lib/ml-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mlConfigured = Boolean((process.env.ML_SERVICE_URL ?? "").trim());
  const mlOk = mlConfigured ? await checkMlHealth() : false;
  const openaiConfigured = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  return NextResponse.json({
    app: "ok",
    mlService: !mlConfigured
      ? "not configured (using TypeScript fallback engine)"
      : mlOk
        ? "ok"
        : "unreachable (using TypeScript fallback engine)",
    fallbackEngine: "available",
    openaiKey: openaiConfigured ? "configured" : "not configured (rule-based summary)",
    capabilities: {
      pdfTextExtraction: true,
      pdfVisionOcr: openaiConfigured, // scanned-PDF OCR needs the OpenAI key
      excel: true,
      csv: true,
      llmExtraction: openaiConfigured,
      recursiveLanguageModel: true,
      reconciliation: true,
    },
    deployedAt: new Date().toISOString(),
  });
}
