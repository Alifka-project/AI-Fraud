import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { AnalysisProvider } from "@/lib/analysis-context";

export const metadata: Metadata = {
  title: "InvestorShield UAE — AI Financial Fraud-Risk Assessment",
  description:
    "AI-powered financial statement fraud detection and company scam-risk assessment platform for Dubai investors, lenders, and procurement teams.",
  keywords: [
    "fraud detection",
    "due diligence",
    "Dubai",
    "UAE",
    "investor",
    "financial risk",
    "AI",
    "InvestorShield",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <AnalysisProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AnalysisProvider>
      </body>
    </html>
  );
}
