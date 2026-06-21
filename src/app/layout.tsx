import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { AnalysisProvider } from "@/lib/analysis-context";
import { getSiteUrl } from "@/lib/site-url";

const APP_URL = getSiteUrl();
const TITLE = "InvestorShield UAE — AI Financial Fraud-Risk Assessment";
const DESCRIPTION =
  "AI-powered financial statement fraud detection and company scam-risk assessment platform for Dubai investors, lenders, and procurement teams.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: TITLE,
    template: "%s · InvestorShield UAE",
  },
  description: DESCRIPTION,
  applicationName: "InvestorShield UAE",
  authors: [{ name: "InvestorShield UAE" }],
  keywords: [
    "fraud detection",
    "due diligence",
    "Dubai",
    "UAE",
    "investor",
    "financial risk",
    "AI",
    "Beneish M-Score",
    "Altman Z-Score",
    "InvestorShield",
  ],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "InvestorShield UAE",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "InvestorShield UAE — AI Financial Fraud-Risk Assessment",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a1f3d",
  width: "device-width",
  initialScale: 1,
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
