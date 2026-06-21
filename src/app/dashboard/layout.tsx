import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk Dashboard",
  description:
    "AI fraud-risk dashboard: risk score, financial ratios, red flags, anomaly detection, and explainability.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
