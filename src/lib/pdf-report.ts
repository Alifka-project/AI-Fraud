"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RiskAssessmentResult } from "./types";

const RECOMMENDED_DOCS = [
  "Audited financial statements (last 3 years)",
  "Bank statements (last 12 months)",
  "VAT filings and tax clearance",
  "Customer contracts (top 5 by value)",
  "Trade licence and certificate of incorporation",
  "Ownership and beneficial-owner documents",
  "Sector-specific regulatory licences (if applicable)",
];

function levelColor(level: RiskAssessmentResult["riskLevel"]): [number, number, number] {
  switch (level) {
    case "LOW":
      return [16, 185, 129];
    case "MEDIUM":
      return [245, 158, 11];
    case "HIGH":
      return [249, 115, 22];
    case "CRITICAL":
      return [220, 38, 38];
  }
}

function fmt(n: number, digits: number = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function generatePdfReport(result: RiskAssessmentResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  const currency = result.company.currency || "AED";

  // Header bar
  doc.setFillColor(10, 31, 61);
  doc.rect(0, 0, pageWidth, 90, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("InvestorShield UAE", marginX, 40);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("AI-Assisted Due-Diligence Report", marginX, 58);
  doc.setFontSize(9);
  doc.text(
    `Generated: ${new Date(result.generatedAt).toLocaleString()}`,
    marginX,
    74
  );

  // Risk score badge
  const [r, g, b] = levelColor(result.riskLevel);
  doc.setFillColor(r, g, b);
  doc.roundedRect(pageWidth - marginX - 130, 28, 130, 44, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(`${Math.round(result.overallScore)}`, pageWidth - marginX - 65, 50, {
    align: "center",
  });
  doc.setFontSize(10);
  doc.text(
    `${result.riskLevel} RISK`,
    pageWidth - marginX - 65,
    66,
    { align: "center" }
  );

  // Reset color
  doc.setTextColor(20, 20, 30);
  let y = 120;

  // Company profile
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Company Profile", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const profileRows = [
    ["Company", result.company.name],
    ["Industry", result.company.industry ?? "—"],
    ["Location", result.company.location ?? "—"],
    [
      "Requested investment",
      result.company.requestedAmount
        ? `${currency} ${result.company.requestedAmount.toLocaleString()}`
        : "—",
    ],
    ["Years analysed", String(result.records.length)],
    ["Notes", result.company.notes ?? "—"],
  ];

  autoTable(doc, {
    startY: y,
    head: [],
    body: profileRows,
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [10, 31, 61], cellWidth: 140 },
      1: { textColor: [40, 40, 60] },
    },
    theme: "plain",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Score breakdown
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Risk Score Breakdown", marginX, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Component", "Score (0-100)", "Weight"]],
    body: [
      ["Statement manipulation", result.componentScores.manipulation.toFixed(1), "30%"],
      ["Cash flow & liquidity", result.componentScores.liquidity.toFixed(1), "20%"],
      ["ML fraud probability", result.componentScores.mlModel.toFixed(1), "20%"],
      ["Anomaly detection", result.componentScores.anomaly.toFixed(1), "10%"],
      ["Document consistency", result.componentScores.document.toFixed(1), "15%"],
      ["External verification", result.componentScores.external.toFixed(1), "5%"],
      ["OVERALL SCORE", result.overallScore.toFixed(1), "100%"],
    ],
    margin: { left: marginX, right: marginX },
    headStyles: { fillColor: [10, 31, 61], textColor: [255, 255, 255], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 6 },
    bodyStyles: { textColor: [40, 40, 60] },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 6) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 244, 250];
      }
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Key ratios
  if (y > 700) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Key Financial Ratios", marginX, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Ratio", "Value"]],
    body: [
      ["Revenue growth (YoY)", `${(result.ratios.revenueGrowth * 100).toFixed(1)}%`],
      ["Net profit margin", `${(result.ratios.netProfitMargin * 100).toFixed(1)}%`],
      ["Gross margin", `${(result.ratios.grossMargin * 100).toFixed(1)}%`],
      ["Current ratio", fmt(result.ratios.currentRatio)],
      ["Debt / Equity", fmt(result.ratios.debtToEquity)],
      ["Return on assets", `${(result.ratios.returnOnAssets * 100).toFixed(1)}%`],
      ["Return on equity", `${(result.ratios.returnOnEquity * 100).toFixed(1)}%`],
      ["OCF / Net income", fmt(result.ratios.ocfToNetIncome)],
      ["Receivables / Revenue", `${(result.ratios.receivablesToRevenue * 100).toFixed(1)}%`],
      ["Asset turnover", fmt(result.ratios.assetTurnover)],
      ["Leverage ratio", fmt(result.ratios.leverageRatio)],
      ["Cash flow quality", fmt(result.ratios.cashFlowQuality)],
      ["Beneish M-Score (proxy)", fmt(result.ratios.beneishMScore)],
      ["Altman Z-Score (proxy)", fmt(result.ratios.altmanZScore)],
    ],
    margin: { left: marginX, right: marginX },
    headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 5 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Financial history
  if (y > 650) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Financial History (${currency})`, marginX, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Year", "Revenue", "Net Income", "OCF", "Assets", "Liabilities", "Receivables", "Debt"]],
    body: [...result.records]
      .sort((a, b) => a.year - b.year)
      .map((r) => [
        r.year.toString(),
        fmtCurrency(r.revenue),
        fmtCurrency(r.netIncome),
        fmtCurrency(r.operatingCashFlow),
        fmtCurrency(r.totalAssets),
        fmtCurrency(r.totalLiabilities),
        fmtCurrency(r.receivables),
        fmtCurrency(r.debt),
      ]),
    margin: { left: marginX, right: marginX },
    headStyles: { fillColor: [10, 31, 61], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 4, halign: "right" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Red flags
  if (y > 600) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Red Flags (${result.redFlags.length})`, marginX, y);
  y += 10;

  if (result.redFlags.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 80);
    doc.text("No automated red flags triggered.", marginX, y + 14);
    y += 24;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Severity", "Issue", "Description"]],
      body: result.redFlags.map((f) => [
        f.severity.toUpperCase(),
        f.title,
        f.description,
      ]),
      margin: { left: marginX, right: marginX },
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: "bold" },
        1: { cellWidth: 140 },
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  }

  // AI summary
  if (y > 600) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 30);
  doc.text("AI Due-Diligence Summary", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(result.llmSummary, pageWidth - marginX * 2);
  doc.setTextColor(40, 40, 60);
  doc.text(summaryLines, marginX, y);
  y += summaryLines.length * 12 + 16;

  // Recommended documents
  if (y > 650) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 30);
  doc.text("Recommended Follow-Up Documents", marginX, y);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [],
    body: RECOMMENDED_DOCS.map((d, i) => [`${i + 1}.`, d]),
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { cellWidth: 25, fontStyle: "bold", textColor: [13, 148, 136] } },
    theme: "plain",
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // Disclaimer
  if (y > 720) {
    doc.addPage();
    y = 40;
  }
  doc.setFillColor(255, 248, 230);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 80, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(120, 80, 0);
  doc.text("Academic Disclaimer", marginX + 12, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const disclaimerLines = doc.splitTextToSize(
    "This report is an AI-assisted due-diligence assessment and does not represent a legal determination of fraud. The risk score and red flags are statistical outputs generated by machine-learning and rule-based models. Investors, lenders, and procurement teams should validate findings against audited financial statements, bank records, and regulatory filings before making any investment, lending, or procurement decision.",
    pageWidth - marginX * 2 - 24
  );
  doc.text(disclaimerLines, marginX + 12, y + 34);

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 140);
    doc.text(
      `InvestorShield UAE · Page ${i} of ${pageCount}`,
      marginX,
      doc.internal.pageSize.getHeight() - 20
    );
  }

  const filename = `InvestorShield-${result.company.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  doc.save(filename);
}
