// Excel (.xlsx / .xls) parsing for the Node/Vercel runtime via SheetJS.
//
// We convert the most data-rich sheet to CSV and reuse the existing CSV parser,
// so all the column-alias logic is shared and Excel uploads work on Vercel
// without the Python service.

import { parseFinancialsCsv, type ParseResult } from "./csv-parser";

// `xlsx` (SheetJS) is imported dynamically inside the function so it stays out
// of Next.js's build-time page-data collection and serverless cold-start path.
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  if (!wb.SheetNames.length) {
    return { records: [], warnings: ["The Excel workbook contains no sheets."] };
  }

  // Pick the sheet that produces the most rows of CSV — financial statements
  // are sometimes spread across multiple tabs (P&L, balance sheet, cash flow).
  let best: ParseResult = { records: [], warnings: [] };
  let bestCsv = "";
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.length > bestCsv.length) {
      const parsed = parseFinancialsCsv(csv);
      if (parsed.records.length >= best.records.length) {
        best = parsed;
        bestCsv = csv;
      }
    }
  }

  if (best.records.length === 0) {
    // Fall back to the first sheet's parse so we surface its warnings.
    const first = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], {
      blankrows: false,
    });
    return parseFinancialsCsv(first);
  }
  return best;
}
