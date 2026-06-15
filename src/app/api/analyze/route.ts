import { NextResponse } from "next/server";
import { callMlService } from "@/lib/ml-client";
import type { AnalysisRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: AnalysisRequest;
  try {
    payload = (await req.json()) as AnalysisRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!payload?.company?.name) {
    return NextResponse.json(
      { error: "company.name is required" },
      { status: 400 }
    );
  }
  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    return NextResponse.json(
      { error: "records[] must contain at least one financial year" },
      { status: 400 }
    );
  }

  const result = await callMlService(payload);
  return NextResponse.json(result);
}
