import { NextResponse } from "next/server";
import { callMlUploadService, callMlService } from "@/lib/ml-client";
import { parseFinancialsCsv } from "@/lib/csv-parser";
import type { AnalysisRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  const meta = formData.get("company");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const companyMeta = (() => {
    if (typeof meta === "string") {
      try {
        return JSON.parse(meta);
      } catch {
        return {};
      }
    }
    return {};
  })();

  const lower = file.name.toLowerCase();

  // CSV path: parse locally and call the analyze endpoint. Avoids needing the
  // Python service to handle multipart for the common case.
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    const { records } = parseFinancialsCsv(text);
    if (records.length === 0) {
      return NextResponse.json(
        { error: "Could not parse any financial records from CSV" },
        { status: 400 }
      );
    }
    const payload: AnalysisRequest = {
      company: {
        name: companyMeta.name || file.name.replace(/\.[^.]+$/, ""),
        industry: companyMeta.industry,
        location: companyMeta.location,
        requestedAmount: companyMeta.requestedAmount,
        notes: companyMeta.notes,
      },
      records,
    };
    const result = await callMlService(payload);
    return NextResponse.json(result);
  }

  // Excel path: forward to Python service which has pandas/openpyxl available.
  try {
    const result = await callMlUploadService(file, companyMeta);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Excel parsing requires the Python ML service. Either start the FastAPI service or upload as CSV.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
