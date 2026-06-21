import { NextResponse } from "next/server";
import { parseFinancialsCsv } from "@/lib/csv-parser";
import { parseXlsxBuffer } from "@/lib/xlsx-parser";
import { extractPdfText } from "@/lib/pdf-extract";
import { extractFinancialsFromText } from "@/lib/financial-extractor";
import type { UploadExtractionResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF + LLM extraction can take a few seconds; allow headroom on Vercel.
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Parses an uploaded CSV / Excel / PDF financial statement and returns the
 * extracted records for the user to verify. It does NOT run the risk analysis —
 * the client shows an editable preview, then calls /api/analyze separately.
 */
export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 }
    );
  }

  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  try {
    // ---- CSV ----------------------------------------------------------------
    if (name.endsWith(".csv") || file.type === "text/csv") {
      const text = new TextDecoder().decode(buffer);
      const { records, warnings } = parseFinancialsCsv(text);
      if (records.length === 0) {
        return NextResponse.json(
          { error: warnings.join(" ") || "No financial rows found in the CSV." },
          { status: 422 }
        );
      }
      const body: UploadExtractionResponse = {
        records,
        warnings,
        extraction: { method: "csv", confidence: "high" },
      };
      return NextResponse.json(body);
    }

    // ---- Excel --------------------------------------------------------------
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const { records, warnings } = await parseXlsxBuffer(buffer);
      if (records.length === 0) {
        return NextResponse.json(
          {
            error:
              warnings.join(" ") ||
              "No financial rows found in the spreadsheet. Ensure the sheet has a header row (year, revenue, …).",
          },
          { status: 422 }
        );
      }
      const body: UploadExtractionResponse = {
        records,
        warnings,
        extraction: { method: "xlsx", confidence: "high" },
      };
      return NextResponse.json(body);
    }

    // ---- PDF ----------------------------------------------------------------
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { text, pages } = await extractPdfText(buffer);
      const result = await extractFinancialsFromText(text);
      if (result.records.length === 0) {
        return NextResponse.json(
          {
            error:
              result.warnings.join(" ") ||
              "Could not extract financial figures from this PDF. It may be a scanned image (OCR not enabled) — please upload a text-based PDF, CSV, or Excel file.",
            extraction: { method: result.method, confidence: result.confidence, pages },
          },
          { status: 422 }
        );
      }
      const body: UploadExtractionResponse = {
        records: result.records,
        warnings: result.warnings,
        extraction: {
          method: result.method,
          confidence: result.confidence,
          pages,
          detectedCompanyName: result.companyName,
          detectedCurrency: result.currency,
        },
      };
      return NextResponse.json(body);
    }

    return NextResponse.json(
      { error: "Unsupported file type. Upload a CSV, Excel (.xlsx/.xls), or PDF file." },
      { status: 415 }
    );
  } catch (err) {
    console.error("Upload parsing failed:", err);
    return NextResponse.json(
      {
        error: "Failed to parse the uploaded file.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
