"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SectionHeading } from "@/components/site/section-heading";
import { SAMPLE_COMPANIES, type SampleCompany } from "@/lib/sample-companies";
import { parseFinancialsCsv, SAMPLE_CSV_HEADER } from "@/lib/csv-parser";
import { useAnalysis } from "@/lib/analysis-context";
import type { AnalysisRequest, FinancialRecordInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "parsing" | "uploaded" | "analyzing" | "error";

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
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Unsupported format. Please upload a CSV or Excel file.");
      setUploadState("error");
      return;
    }
    setUploadState("parsing");
    setProgress(20);

    if (lower.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = String(e.target?.result ?? "");
        const { records, warnings } = parseFinancialsCsv(content);
        setProgress(80);
        if (records.length === 0) {
          setError(
            warnings.join(" ") || "Could not extract any financial rows from the file."
          );
          setUploadState("error");
          return;
        }
        setParsedRecords(records);
        setParseWarnings(warnings);
        setUploadState("uploaded");
        setProgress(100);
      };
      reader.onerror = () => {
        setError("Failed to read file.");
        setUploadState("error");
      };
      reader.readAsText(file);
    } else {
      // Excel: defer to backend service which will parse it.
      // For MVP we send raw file to /api/upload-analyze.
      handleExcelUpload(file);
    }
  }

  async function handleExcelUpload(file: File) {
    setUploadState("analyzing");
    setProgress(40);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "company",
        JSON.stringify({
          name: companyName || file.name.replace(/\.[^.]+$/, ""),
          industry,
          location,
          requestedAmount: requestedAmount ? Number(requestedAmount) : undefined,
          notes,
        })
      );
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.text()) || "Upload failed");
      const data = await res.json();
      setProgress(100);
      setResult(data);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  }

  function loadSample(s: SampleCompany) {
    setCompanyName(s.payload.company.name);
    setIndustry(s.payload.company.industry ?? "");
    setLocation(s.payload.company.location ?? "");
    setRequestedAmount(
      s.payload.company.requestedAmount?.toString() ?? ""
    );
    setNotes(s.payload.company.notes ?? "");
    setParsedRecords(s.payload.records);
    setParseWarnings([]);
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
    setUploadState("analyzing");
    setProgress(15);

    const payload: AnalysisRequest = {
      company: {
        name: companyName,
        industry: industry || undefined,
        location: location || undefined,
        requestedAmount: requestedAmount ? Number(requestedAmount) : undefined,
        notes: notes || undefined,
      },
      records: parsedRecords,
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

  return (
    <div className="container py-12">
      <SectionHeading
        eyebrow="Step 1 of 3"
        title="Upload company financial statements"
        description="Provide a CSV or Excel file with annual financial data, then optionally fill in the company profile. You can also pick a pre-loaded Dubai SME sample for a one-click demo."
      />

      <div className="mt-10 grid lg:grid-cols-3 gap-8">
        {/* Left: upload + parsed preview */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-teal-600" />
                Financial statement file
              </CardTitle>
              <CardDescription>
                Required columns: year, revenue, net_income, total_assets, total_liabilities,
                equity, cash, operating_cash_flow, receivables, debt, cost_of_goods_sold, expenses.
                Column order doesn&apos;t matter.
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
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {uploadState === "uploaded" ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                    <p className="font-semibold text-navy-900">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      Parsed {parsedRecords.length} financial year{parsedRecords.length === 1 ? "" : "s"}.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setParsedRecords([]);
                        setFileName(null);
                        setUploadState("idle");
                        setProgress(0);
                      }}
                    >
                      Choose a different file
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <FileSpreadsheet className="h-10 w-10 text-teal-600 mx-auto" />
                    <p className="font-medium text-navy-900">
                      Drop a CSV or Excel file, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      CSV (recommended) · XLSX · XLS · up to 10 MB
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button onClick={() => fileInputRef.current?.click()} variant="primary">
                        <Upload className="h-4 w-4" />
                        Choose file
                      </Button>
                      <Button onClick={downloadSampleCsv} variant="outline">
                        Download template
                      </Button>
                    </div>
                  </div>
                )}
                {progress > 0 && uploadState !== "idle" ? (
                  <div className="mt-6">
                    <Progress value={progress} />
                  </div>
                ) : null}
              </div>

              {parseWarnings.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-3.5 w-3.5" /> Parse warnings
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
                <CardTitle>Parsed financial data</CardTitle>
                <CardDescription>
                  Quick check before analysis. All values in AED unless otherwise noted.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-100 text-left text-navy-700">
                        <th className="py-2 pr-3 font-semibold">Year</th>
                        <th className="py-2 pr-3 font-semibold">Revenue</th>
                        <th className="py-2 pr-3 font-semibold">Net Income</th>
                        <th className="py-2 pr-3 font-semibold">OCF</th>
                        <th className="py-2 pr-3 font-semibold">Assets</th>
                        <th className="py-2 pr-3 font-semibold">Liabilities</th>
                        <th className="py-2 pr-3 font-semibold">Receivables</th>
                        <th className="py-2 pr-3 font-semibold">Debt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRecords.map((r) => (
                        <tr key={r.year} className="border-b border-navy-50">
                          <td className="py-2 pr-3 font-semibold text-navy-900">{r.year}</td>
                          <td className="py-2 pr-3">{r.revenue.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.netIncome.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.operatingCashFlow.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.totalAssets.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.totalLiabilities.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.receivables.toLocaleString()}</td>
                          <td className="py-2 pr-3">{r.debt.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <CardDescription>
                Pre-loaded Dubai SME profiles for live demos.
              </CardDescription>
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
