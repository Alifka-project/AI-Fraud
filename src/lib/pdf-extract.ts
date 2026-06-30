// PDF text extraction for the Node/Vercel runtime.
//
// Uses `unpdf` — a serverless-friendly build of pdf.js — so PDF financial
// statements can be parsed directly inside the Next.js API route without
// needing the Python service. Works on Vercel's Node serverless functions.

export interface PdfTextResult {
  text: string; // all pages merged (used for the whole-document RLM review)
  pageTexts: string[]; // per-page text (used to locate the statement pages)
  pages: number;
  charCount: number;
}

/**
 * Extract text from a PDF buffer, both merged and per-page.
 *
 * Per-page text is essential for large filings (10-Ks, annual reports) where the
 * financial statements are buried on specific pages — we score pages to find the
 * real statement tables rather than the table of contents or MD&A mentions.
 *
 * `unpdf` is imported dynamically so its pdf.js bundle is only loaded when a PDF
 * is actually uploaded — this keeps it out of Next.js's build-time page-data
 * collection (which otherwise crashes) and improves serverless cold starts.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfTextResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text.map((t) => String(t ?? "")) : [String(text ?? "")];
  const merged = pageTexts.join("\n");
  return {
    text: merged,
    pageTexts,
    pages: totalPages ?? pageTexts.length,
    charCount: merged.length,
  };
}
