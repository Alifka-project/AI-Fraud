// PDF text extraction for the Node/Vercel runtime.
//
// Uses `unpdf` — a serverless-friendly build of pdf.js — so PDF financial
// statements can be parsed directly inside the Next.js API route without
// needing the Python service. Works on Vercel's Node serverless functions.

export interface PdfTextResult {
  text: string;
  pages: number;
  charCount: number;
}

/**
 * Extract concatenated text from a PDF buffer.
 * Returns merged page text; empty string if the PDF has no extractable text
 * layer (e.g. a scanned image, which would require OCR — see the Python
 * service's placeholder OCR path).
 *
 * `unpdf` is imported dynamically so its pdf.js bundle is only loaded when a PDF
 * is actually uploaded — this keeps it out of Next.js's build-time page-data
 * collection (which otherwise crashes) and improves serverless cold starts.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfTextResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  return {
    text: merged,
    pages: totalPages ?? 0,
    charCount: merged.length,
  };
}
