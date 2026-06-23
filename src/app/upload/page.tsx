"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Building2,
  Pencil,
  Network,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SectionHeading } from "@/components/site/section-heading";
import { EditableRecordsTable } from "@/components/upload/editable-records";
import { SAMPLE_COMPANIES, type SampleCompany } from "@/lib/sample-companies";
import { parseFinancialsCsv, SAMPLE_CSV_HEADER } from "@/lib/csv-parser";
import { useAnalysis } from "@/lib/analysis-context";
import type {
  AnalysisRequest,
  FinancialRecordInput,
  UploadExtractionResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "parsing" | "uploaded" | "analyzing" | "error";

type ExtractionMeta = UploadExtractionResponse["extraction"] | null;

const METHOD_LABELS: Record<string, string> = {
  csv: "CSV parsed",
  xlsx: "Excel parsed",
  "pdf-llm": "PDF · AI extraction",
  "pdf-heuristic": "PDF · rule-based extraction",
};

export default function UploadPage() {
  const router = useRouter();
  const { setResult } = useAnalysis();

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [parsedRecords, setParsedRecords] = useState<FinancialRecordInput[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [extraction, setExtraction] = useState<ExtractionMeta>(null);
  const [rlm, setRlm] = useState<UploadExtractionResponse["rlm"]>(undefined);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetUpload() {
    setParsedRecords([]);
    setParseWarnings([]);
    setExtraction(null);
    setRlm(undefined);
    setFileName(null);
    setUploadState("idle");
    setProgress(0);
    setError(null);
  }

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setExtraction(null);
    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith(".csv");
    const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const isPdf = lower.endsWith(".pdf");

    if (!isCsv && !isExcel && !isPdf) {
      setError("Unsupported format. Please upload a CSV, Excel (.xlsx/.xls), or PDF file.");
      setUploadState("error");
      return;
    }

    // CSV is parsed instantly in the browser; Excel/PDF go to the server route.
    if (isCsv) {
      setUploadState("parsing");
      setProgress(30);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = String(e.target?.result ?? "");
        const { records, warnings } = parseFinancialsCsv(content);
        if (records.length === 0) {
          setError(warnings.join(" ") || "Could not extract any financial rows from the file.");
          setUploadState("error");
          return;
        }
        setParsedRecords(records);
        setParseWarnings(warnings);
        setExtraction({ method: "csv", confidence: "high" });
        setUploadState("uploaded");
        setProgress(100);
      };
      reader.onerror = () => {
        setError("Failed to read file.");
        setUploadState("error");
      };
      reader.readAsText(file);
      return;
    }

    void handleServerParse(file, isPdf);
  }

  async function handleServerParse(file: File, isPdf: boolean) {
    setUploadState("parsing");
    setProgress(isPdf ? 20 : 40);
    // Animate progress while the server works (PDF + LLM can take a few seconds).
    const tick = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 4 : p));
    }, 250);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "company",
        JSON.stringify({ name: companyName || file.name.replace(/\.[^.]+$/, "") })
      );
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      clearInterval(tick);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || `Server returned ${res.status}`);
      }

      const payload = data as UploadExtractionResponse;
      if (!payload.records || payload.records.length === 0) {
        throw new Error("No financial records could be extracted from the file.");
      }

      setParsedRecords(payload.records);
      setParseWarnings(payload.warnings ?? []);
      setExtraction(payload.extraction);
      setRlm(payload.rlm);
      if (!companyName && payload.extraction?.detectedCompanyName) {
        setCompanyName(payload.extraction.detectedCompanyName);
      }
      setUploadState("uploaded");
      setProgress(100);
    } catch (err) {
      clearInterval(tick);
      setError(err instanceof Error ? err.message : "Failed to parse the file.");
      setUploadState("error");
    }
  }

  function loadSample(s: SampleCompany) {
    setCompanyName(s.payload.company.name);
    setIndustry(s.payload.company.industry ?? "");
    setLocation(s.payload.company.location ?? "");
    setRequestedAmount(s.payload.company.requestedAmount?.toString() ?? "");
    setNotes(s.payload.company.notes ?? "");
    setParsedRecords(s.payload.records);
    setParseWarnings([]);
    setExtraction(null);
    setRlm(undefined);
    setFileName(`${s.id}.sample`);
    setUploadState("uploaded");
    setError(null);
    setProgress(100);
  }

  async function handleAnalyze() {
    if (parsedRecords.length === 0) {
      setError("Upload a file or pick a sample company first.");
      return;
    }
    if (!companyName.trim()) {
      setError("Please provide a company name.");
      return;
    }
    setError(null);
    setUploadState("analyzing");
    setProgress(15);

    const payload: AnalysisRequest = {
      company: {
        name: companyName,
        industry: industry || undefined,
        location: location || undefined,
        requestedAmount: requestedAmount ? Number(requestedAmount) : undefined,
        notes: notes || undefined,
        currency: extraction?.detectedCurrency || undefined,
      },
      records: parsedRecords,
      rlm,
    };

    try {
      const tick = setInterval(() => {
        setProgress((p) => (p < 85 ? p + 5 : p));
      }, 150);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      clearInterval(tick);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setProgress(100);
      setResult(data);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setUploadState("error");
    }
  }

  function downloadSampleCsv() {
    const csv =
      SAMPLE_CSV_HEADER +
      "\n" +
      "2022,38000000,4180000,22500000,8900000,13600000,5800000,4650000,4500000,4200000,27550000,5100000\n" +
      "2023,42000000,4620000,24300000,9200000,15100000,6400000,5050000,5100000,4000000,30300000,5500000\n" +
      "2024,45500000,5300000,26200000,9400000,16800000,7200000,5800000,5500000,3800000,32400000,5900000\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "investorshield-sample-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const isPdfExtraction =
    extraction?.method === "pdf-llm" || extraction?.method === "pdf-heuristic";

  return (
    <div className="container py-12">
      <SectionHeading
        eyebrow="Step 1 of 3"
        title="Upload company financial statements"
        description="Upload a PDF, Excel, or CSV financial statement. The platform extracts the figures automatically — then you can review and correct them before running the AI risk analysis. Or pick a pre-loaded Dubai SME sample for a one-click demo."
      />

      <div className="mt-10 grid lg:grid-cols-3 gap-8">
        {/* Left: upload + editable preview */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-teal-600" />
                Financial statement file
              </CardTitle>
              <CardDescription>
                <strong>PDF</strong> income statements / balance sheets are read automatically.
                <strong> CSV/Excel</strong> should include columns such as year, revenue,
                net_income, total_assets, total_liabilities, equity, cash, operating_cash_flow,
                receivables, debt, cost_of_goods_sold, expenses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={cn(
                  "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                  uploadState === "error"
                    ? "border-red-300 bg-red-50/50"
                    : uploadState === "uploaded"
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-navy-200 bg-navy-50/40 hover:bg-navy-50"
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf,application/pdf,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
                {uploadState === "parsing" ? (
                  <div className="space-y-2">
                    <Loader2 className="h-10 w-10 text-teal-600 mx-auto animate-spin" />
                    <p className="font-semibold text-navy-900">
                      {isPdfExtraction || fileName?.toLowerCase().endsWith(".pdf")
                        ? "Reading PDF, extracting figures & recursively reviewing the document…"
                        : "Parsing file…"}
                    </p>
                    <p className="text-xs text-muted-foreground">{fileName}</p>
                  </div>
                ) : uploadState === "uploaded" ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <p className="font-semibold text-navy-900">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      Extracted {parsedRecords.length} financial year
                      {parsedRecords.length === 1 ? "" : "s"}.
                    </p>
                    {extraction ? (
                      <div className="flex items-center justify-center gap-2">
                        <Badge
                          variant={
                            extraction.confidence === "high"
                              ? "success"
                              : extraction.confidence === "medium"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {METHOD_LABELS[extraction.method] ?? extraction.method}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {extraction.confidence} confidence
                          {extraction.pages ? ` · ${extraction.pages} page${extraction.pages === 1 ? "" : "s"}` : ""}
                        </span>
                      </div>
                    ) : null}
                    {rlm ? (
                      <p className="text-xs text-teal-700">
                        <Network className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />
                        Recursive review: {rlm.trace.sectionsAnalyzed} sections ·{" "}
                        {rlm.qualitativeFlags.length} qualitative flag
                        {rlm.qualitativeFlags.length === 1 ? "" : "s"}
                      </p>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={resetUpload}>
                      Choose a different file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-9 w-9 text-teal-600" />
                      <FileSpreadsheet className="h-9 w-9 text-navy-500" />
                    </div>
                    <p className="font-medium text-navy-900">
                      Drag &amp; drop a PDF, Excel, or CSV — or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF · XLSX · XLS · CSV · up to 15 MB
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={() => fileInputRef.current?.click()} variant="primary">
                        <Upload className="h-4 w-4" />
                        Choose file
                      </Button>
                      <Button onClick={downloadSampleCsv} variant="outline">
                        Download CSV template
                      </Button>
                    </div>
                  </div>
                )}
                {progress > 0 && uploadState !== "idle" && uploadState !== "uploaded" ? (
                  <div className="mt-6">
                    <Progress value={progress} />
                  </div>
                ) : null}
              </div>

              {isPdfExtraction ? (
                <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 flex gap-2">
                  <Pencil className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <div>
                    Figures were auto-extracted from your PDF. <strong>Review and correct</strong>{" "}
                    every value in the editable table below before running the analysis — document
                    extraction is not guaranteed to be perfect.
                  </div>
                </div>
              ) : null}

              {parseWarnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-3.5 w-3.5" /> Extraction notes
                  </div>
                  <ul className="mt-1 list-disc list-inside space-y-0.5">
                    {parseWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>{error}</div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {parsedRecords.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-teal-600" />
                  Review &amp; edit financial data
                </CardTitle>
                <CardDescription>
                  All values in AED. Correct any mis-read figures, add or remove a year, then run
                  the analysis. Years are columns; line items are rows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EditableRecordsTable records={parsedRecords} onChange={setParsedRecords} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right: company metadata + samples */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-teal-600" />
                Company profile
              </CardTitle>
              <CardDescription>Helps tailor the due-diligence narrative.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="company">Company name *</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Stellar Logistics LLC"
                />
              </div>
              <div>
                <Label htmlFor="industry">Industry / sector</Label>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Logistics, Real Estate, Fintech…"
                />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Dubai, DIFC, JAFZA…"
                />
              </div>
              <div>
                <Label htmlFor="amount">Requested investment (AED)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  placeholder="2500000"
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything else the due-diligence engine should consider…"
                  className="min-h-[80px]"
                />
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={
                  uploadState === "analyzing" ||
                  uploadState === "parsing" ||
                  parsedRecords.length === 0
                }
                variant="primary"
                className="w-full"
                size="lg"
              >
                {uploadState === "analyzing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running analysis…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Run AI risk analysis
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick-start samples</CardTitle>
              <CardDescription>Pre-loaded Dubai SME profiles for live demos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SAMPLE_COMPANIES.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left rounded-lg border border-navy-100 bg-white p-3 hover:border-teal-400 hover:bg-teal-50/40 transition-colors"
                  onClick={() => loadSample(s)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-navy-900">{s.label}</span>
                    <Badge
                      variant={
                        s.expectedLevel === "LOW"
                          ? "success"
                          : s.expectedLevel === "MEDIUM"
                            ? "warning"
                            : s.expectedLevel === "HIGH"
                              ? "warning"
                              : "danger"
                      }
                    >
                      {s.expectedLevel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {s.description}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
