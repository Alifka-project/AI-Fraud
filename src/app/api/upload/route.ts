import { NextResponse } from "next/server";
import { parseFinancialsCsv } from "@/lib/csv-parser";
import { parseXlsxBuffer } from "@/lib/xlsx-parser";
import { extractPdfText } from "@/lib/pdf-extract";
import { extractFinancialsFromText } from "@/lib/financial-extractor";
import { extractFinancialsWithVision, visionAvailable } from "@/lib/vision-extract";
import { reconcileRecords } from "@/lib/reconcile";
import { runRecursiveDiligence } from "@/lib/rlm";
import type { FinancialRecordInput, UploadExtractionResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF + LLM/vision extraction can take a while; allow headroom on Vercel.
export const maxDuration = 90;

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
      const recon = reconcileRecords(records);
      const body: UploadExtractionResponse = {
        records,
        warnings,
        extraction: {
          method: "csv",
          confidence: "high",
          reconciliationConfidence: recon.confidence,
          reconciliationIssues: recon.issues.map((i) => i.message).slice(0, 8),
        },
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
      const recon = reconcileRecords(records);
      const body: UploadExtractionResponse = {
        records,
        warnings,
        extraction: {
          method: "xlsx",
          confidence: "high",
          reconciliationConfidence: recon.confidence,
          reconciliationIssues: recon.issues.map((i) => i.message).slice(0, 8),
        },
      };
      return NextResponse.json(body);
    }

    // ---- PDF ----------------------------------------------------------------
    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const { text, pages } = await extractPdfText(buffer);

      // 1. Text-layer extraction (heuristic or text-LLM).
      let method: UploadExtractionResponse["extraction"]["method"] = "pdf-heuristic";
      let confidence: UploadExtractionResponse["extraction"]["confidence"] = "low";
      let records: FinancialRecordInput[] = [];
      let warnings: string[] = [];
      let companyName: string | null = null;
      let currency: string | null = null;

      const textResult = await extractFinancialsFromText(text);
      records = textResult.records;
      warnings = textResult.warnings;
      method = textResult.method;
      confidence = textResult.confidence;
      companyName = textResult.companyName;
      currency = textResult.currency;

      let recon = reconcileRecords(records);

      // 2. Escalate to vision/OCR when the text path produced nothing or
      //    low-confidence figures (scanned image, or a layout the text parser
      //    misread). OpenAI reads the PDF natively (rasterise + OCR).
      const scannedOrWeak = records.length === 0 || recon.confidence < 0.7;
      if (scannedOrWeak && visionAvailable()) {
        try {
          const vision = await extractFinancialsWithVision(buffer);
          if (vision && vision.records.length > 0) {
            const visionRecon = reconcileRecords(vision.records);
            // Adopt the vision result if there were no text records or vision
            // reconciles at least as well.
            if (records.length === 0 || visionRecon.confidence >= recon.confidence) {
              records = vision.records;
              recon = visionRecon;
              method = "pdf-vision";
              confidence = visionRecon.confidence >= 0.8 ? "high" : "medium";
              companyName = companyName || vision.companyName;
              currency = currency || vision.currency;
              warnings = [
                "Figures were read directly from the PDF by the vision model (OCR). Verify against the source before relying on them.",
                ...vision.notes,
              ];
            }
          }
        } catch (err) {
          console.warn("Vision extraction failed (non-fatal):", err);
        }
      }

      if (records.length === 0) {
        return NextResponse.json(
          {
            error:
              "Could not extract financial figures from this PDF. If it is a scanned image, ensure an OpenAI key is configured for OCR, or upload a CSV/Excel file.",
            extraction: { method, confidence, pages },
          },
          { status: 422 }
        );
      }

      // 3. Surface reconciliation findings so users know what to double-check.
      const reconWarnings = recon.issues
        .filter((i) => i.severity === "error")
        .slice(0, 4)
        .map((i) => i.message);
      if (reconWarnings.length) {
        warnings = [
          "Some figures failed an automated consistency check — please review the highlighted values.",
          ...reconWarnings,
          ...warnings,
        ];
      }

      // 4. Recursive Language Model document review over the WHOLE filing.
      let rlm: UploadExtractionResponse["rlm"];
      try {
        if (text.trim().length > 1200) {
          rlm = await runRecursiveDiligence(text);
        }
      } catch (err) {
        console.warn("RLM document review failed (non-fatal):", err);
      }

      const body: UploadExtractionResponse = {
        records,
        warnings,
        extraction: {
          method,
          confidence,
          pages,
          detectedCompanyName: companyName,
          detectedCurrency: currency,
          reconciliationConfidence: recon.confidence,
          reconciliationIssues: recon.issues.map((i) => i.message).slice(0, 8),
        },
        rlm,
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
