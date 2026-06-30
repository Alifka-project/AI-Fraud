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
// NOTE: keep this in sync with vercel.json (the function config there wins).
export const maxDuration = 60;

// Note: Vercel serverless functions cap the request body at ~4.5 MB regardless
// of this value. Large PDFs are therefore extracted to text IN THE BROWSER and
// sent here as JSON ({ pageTexts }), which sidesteps the body limit entirely.
// This MAX_BYTES only applies to the raw-file (multipart) path.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Hard ceiling on client-supplied text so a malformed/oversized JSON body can't
// blow memory. A 400-page filing's text is ~1–2 MB, so 8M chars is generous.
const MAX_TEXT_CHARS = 8_000_000;

// Wall-clock budget for the (best-effort, non-blocking) recursive document
// review, so it can never push the function past its duration limit. If it does
// not finish in time the extracted records are returned without the RLM panel.
const RLM_BUDGET_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

// A record set where every period is missing the fundamental figures means the
// parse essentially failed (scanned image, unusual layout, or a non-statement
// page) — even if it nominally produced a row.
const coreEmpty = (recs: FinancialRecordInput[]) =>
  recs.length === 0 || recs.every((r) => !r.revenue && !r.totalAssets && !r.netIncome);

type ProcessResult =
  | { ok: true; body: UploadExtractionResponse }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Shared PDF → records pipeline. Works from per-page text (whatever the source:
 * server-side `unpdf` for small uploads, or the browser for large ones).
 *
 * `buffer` is the raw PDF bytes and is present ONLY on the multipart path; when
 * available it enables the vision/OCR escalation. On the JSON (client-extracted
 * text) path there are no bytes, so vision is skipped — fine, because a PDF that
 * yielded a usable text layer in the browser does not need OCR.
 */
async function processPdf(params: {
  pageTexts: string[];
  pages: number;
  fullText: string;
  buffer?: ArrayBuffer;
}): Promise<ProcessResult> {
  const { pageTexts, pages, fullText, buffer } = params;

  // Locate the ACTUAL financial-statement pages. In a large filing the first
  // textual mention of "balance sheet" is the table of contents or an MD&A
  // sentence (no numbers); page scoring finds the real tables instead.
  const { text: statementText, pageIndices } = selectStatementText(pageTexts);

  // 1. Text-layer extraction (text-LLM or heuristic) on the focused pages.
  let method: UploadExtractionResponse["extraction"]["method"] = "pdf-heuristic";
  let confidence: UploadExtractionResponse["extraction"]["confidence"] = "low";
  let records: FinancialRecordInput[] = [];
  let warnings: string[] = [];
  let companyName: string | null = null;
  let currency: string | null = null;

  const textResult = await extractFinancialsFromText(statementText || fullText);
  records = textResult.records;
  warnings = textResult.warnings;
  method = textResult.method;
  confidence = textResult.confidence;
  companyName = textResult.companyName;
  currency = textResult.currency;

  let recon = reconcileRecords(records);

  // 2. Escalate to vision/OCR when the text path produced nothing, an all-zero
  //    skeleton, or low-confidence figures — but only when we hold the raw PDF
  //    bytes (multipart path). For large filings we send only the statement
  //    pages (a small sub-PDF) to stay within OpenAI's per-request page limit.
  const weak = coreEmpty(records) || recon.confidence < 0.8;
  if (weak && buffer && visionAvailable()) {
    try {
      let visionBuffer: ArrayBuffer = buffer;
      if (pageIndices.length > 0 && pages > pageIndices.length) {
        const sub = await buildStatementSubPdf(buffer, pageIndices);
        if (sub) visionBuffer = sub;
      }
      const vision = await extractFinancialsWithVision(
        visionBuffer,
        detectScale(statementText || fullText)
      );
      if (vision && vision.records.length > 0 && !coreEmpty(vision.records)) {
        const visionRecon = reconcileRecords(vision.records);
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

  // 3. If extraction still produced nothing usable, fail clearly rather than
  //    presenting an all-zero table as if it were real data.
  if (coreEmpty(records)) {
    let reason: string;
    if (!visionAvailable()) {
      reason =
        "We could not read the figures from this PDF. Configure an OpenAI API key to enable AI + OCR extraction, or upload a CSV/Excel file.";
    } else if (!buffer) {
      // Client-extracted-text path: the text layer was unreadable as a
      // statement, and we don't have the bytes here to OCR.
      reason =
        "We could not read the financial figures from this PDF's text. If it is a scanned document, re-upload it under 4 MB so it can be processed with OCR, or upload only the statement pages.";
    } else {
      reason =
        "We could not read the financial figures from this PDF, even with OCR. It may be a non-standard layout or a low-quality scan.";
    }
    return {
      ok: false,
      status: 422,
      body: {
        error: `${reason} You can also enter the figures manually using the CSV template.`,
        extraction: { method, confidence: "low", pages },
      },
    };
  }

  // 4. Surface reconciliation findings so users know what to double-check.
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

  // 5. Recursive Language Model document review over the WHOLE filing. Bounded
  //    by a wall-clock budget so it can never time out the upload — the records
  //    are the primary result; the qualitative panel is best-effort.
  let rlm: UploadExtractionResponse["rlm"];
  try {
    if (fullText.trim().length > 1200) {
      rlm = await withTimeout(runRecursiveDiligence(fullText), RLM_BUDGET_MS);
    }
  } catch (err) {
    console.warn("RLM document review failed (non-fatal):", err);
  }

  return {
    ok: true,
    body: {
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
    },
  };
}

/**
 * Parses an uploaded CSV / Excel / PDF financial statement and returns the
 * extracted records for the user to verify. It does NOT run the risk analysis —
 * the client shows an editable preview, then calls /api/analyze separately.
 *
 * Two request shapes are accepted:
 *  - multipart/form-data with a `file` (CSV / Excel / small PDF).
 *  - application/json `{ pageTexts: string[], pages?, fileName? }` — used for
 *    LARGE PDFs whose text was extracted in the browser, so the multi-megabyte
 *    raw file never has to cross Vercel's ~4.5 MB request-body limit.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  // ---- JSON: browser-extracted PDF text (large-file path) -----------------
  if (contentType.includes("application/json")) {
    let json: { pageTexts?: unknown; pages?: unknown; fileName?: unknown };
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const pageTexts = Array.isArray(json.pageTexts)
      ? json.pageTexts.map((p) => (typeof p === "string" ? p : String(p ?? "")))
      : [];
    const fullText = pageTexts.join("\n");
    if (!fullText.trim()) {
      return NextResponse.json(
        {
          error:
            "No readable text was found in this PDF. It may be a scanned image — re-upload it under 4 MB to use OCR, or upload a CSV/Excel file.",
        },
        { status: 422 }
      );
    }
    if (fullText.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: "This document is too large to process. Please upload only the financial-statement pages." },
        { status: 413 }
      );
    }
    const pages = Number.isFinite(Number(json.pages)) && Number(json.pages) > 0
      ? Number(json.pages)
      : pageTexts.length;

    try {
      const result = await processPdf({ pageTexts, pages, fullText });
      return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
    } catch (err) {
      console.error("Upload parsing failed (json path):", err);
      return NextResponse.json(
        { error: "Failed to process the document.", detail: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  // ---- multipart/form-data: raw file (CSV / Excel / small PDF) -------------
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
      const result = await processPdf({ pageTexts, pages, fullText: text, buffer });
      return NextResponse.json(result.body, { status: result.ok ? 200 : result.status });
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
