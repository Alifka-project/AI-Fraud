import { NextResponse } from "next/server";
import { callMlService } from "@/lib/ml-client";
import { mergeRlmIntoResult } from "@/lib/rlm";
import { validateAnalysisRequest } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateAnalysisRequest(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const payload = validation.value;

  try {
    const result = await callMlService(payload);
    // Fold the Recursive Language Model document review (produced at upload)
    // into the quantitative assessment.
    const finalResult = payload.rlm ? mergeRlmIntoResult(result, payload.rlm) : result;
    return NextResponse.json(finalResult);
  } catch (err) {
    console.error("Analysis failed:", err);
    return NextResponse.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
