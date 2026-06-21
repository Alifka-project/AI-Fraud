import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Due-Diligence Report",
  description:
    "Investor-ready AI due-diligence report with company profile, risk score, red flags, and PDF export.",
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
