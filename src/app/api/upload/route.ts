import { NextResponse } from "next/server";
import { parseFinancialsCsv } from "@/lib/csv-parser";
import { parseXlsxBuffer } from "@/lib/xlsx-parser";
import { extractPdfText } from "@/lib/pdf-extract";
import {
  extractFinancialsFromText,
  selectStatementText,
  detectScale,
} from "@/lib/financial-extractor";
import {
  extractFinancialsWithVision,
  visionAvailable,
  buildStatementSubPdf,
} from "@/lib/vision-extract";
import { reconcileRecords } from "@/lib/reconcile";
import { runRecursiveDiligence } from "@/lib/rlm";
import type { FinancialRecordInput, UploadExtractionResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF + LLM/vision extraction can take a while; allow headroom on Vercel.
export const maxDuration = 90;

// Note: Vercel serverless functions cap the request body at ~4.5 MB regardless
// of this value; very large reports must be uploaded on a self-hosted deploy or
// trimmed to the statements. We allow more here for local/self-hosted use.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

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
      const { text, pageTexts, pages } = await extractPdfText(buffer);

      // Locate the ACTUAL financial-statement pages. In a large filing the
      // first textual mention of "balance sheet" is the table of contents or an
      // MD&A sentence (no numbers); page scoring finds the real tables instead.
      const { text: statementText, pageIndices } = selectStatementText(pageTexts);

      // 1. Text-layer extraction (text-LLM or heuristic) on the focused pages.
      let method: UploadExtractionResponse["extraction"]["method"] = "pdf-heuristic";
      let confidence: UploadExtractionResponse["extraction"]["confidence"] = "low";
      let records: FinancialRecordInput[] = [];
      let warnings: string[] = [];
      let companyName: string | null = null;
      let currency: string | null = null;

      const textResult = await extractFinancialsFromText(statementText || text);
      records = textResult.records;
      warnings = textResult.warnings;
      method = textResult.method;
      confidence = textResult.confidence;
      companyName = textResult.companyName;
      currency = textResult.currency;

      let recon = reconcileRecords(records);

      // A record set where every period is missing the fundamental figures
      // means the text parse essentially failed (scanned image, unusual layout,
      // or a non-statement page) — even if it nominally produced a row.
      const coreEmpty = (recs: FinancialRecordInput[]) =>
        recs.length === 0 || recs.every((r) => !r.revenue && !r.totalAssets && !r.netIncome);

      // 2. Escalate to vision/OCR when the text path produced nothing, an
      //    all-zero skeleton, or low-confidence figures. For large filings we
      //    send only the statement pages (a small sub-PDF) so we stay within
      //    OpenAI's per-request page limit and keep it fast.
      const weak = coreEmpty(records) || recon.confidence < 0.8;
      if (weak && visionAvailable()) {
        try {
          let visionBuffer: ArrayBuffer = buffer;
          if (pageIndices.length > 0 && pages > pageIndices.length) {
            const sub = await buildStatementSubPdf(buffer, pageIndices);
            if (sub) visionBuffer = sub;
          }
          const vision = await extractFinancialsWithVision(
            visionBuffer,
            detectScale(statementText || text)
          );
          if (vision && vision.records.length > 0 && !coreEmpty(vision.records)) {
            const visionRecon = reconcileRecords(vision.records);
            // Adopt vision when the text path was empty/all-zero, or vision
            // reconciles at least as well.
            if (coreEmpty(records) || visionRecon.confidence >= recon.confidence) {
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

      // 3. If extraction still produced nothing usable, fail clearly rather
      //    than presenting an all-zero table as if it were real data.
      if (coreEmpty(records)) {
        const reason = visionAvailable()
          ? "We could not read the financial figures from this PDF, even with OCR. It may be a non-standard layout or a low-quality scan."
          : "We could not read the figures from this PDF. Configure an OpenAI API key to enable AI + OCR extraction, or upload a CSV/Excel file.";
        return NextResponse.json(
          {
            error: `${reason} You can also enter the figures manually using the CSV template.`,
            extraction: { method, confidence: "low", pages },
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
