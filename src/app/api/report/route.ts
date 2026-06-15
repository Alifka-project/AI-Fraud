import { NextResponse } from "next/server";
import type { RiskAssessmentResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns a normalised report payload. PDF generation happens client-side via
// jsPDF so the academic deployment doesn't need a headless browser on the server.
export async function POST(req: Request) {
  let body: RiskAssessmentResult;
  try {
    body = (await req.json()) as RiskAssessmentResult;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.company?.name || !body?.ratios) {
    return NextResponse.json(
      { error: "Report requires a completed analysis payload" },
      { status: 400 }
    );
  }

  const recommendedDocuments = [
    "Audited financial statements (last 3 years)",
    "Bank statements (last 12 months)",
    "VAT filings and tax clearance",
    "Customer contracts (top 5 by value)",
    "Trade licence and certificate of incorporation",
    "Ownership and beneficial-owner documents",
    "Sector-specific regulatory licences (if applicable)",
  ];

  return NextResponse.json({
    title: "InvestorShield UAE Due-Diligence Report",
    generatedAt: new Date().toISOString(),
    company: body.company,
    overallScore: body.overallScore,
    riskLevel: body.riskLevel,
    componentScores: body.componentScores,
    ratios: body.ratios,
    redFlags: body.redFlags,
    featureImportance: body.featureImportance,
    llmSummary: body.llmSummary,
    records: body.records,
    modelInfo: body.modelInfo,
    recommendedDocuments,
    disclaimer:
      "This report is an AI-assisted due-diligence assessment and does not represent a legal determination of fraud. Investors should rely on professional auditors, legal counsel, and verified primary documents before making any investment, lending, or procurement decision.",
  });
}
