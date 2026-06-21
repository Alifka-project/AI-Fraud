import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Financial Statements",
  description:
    "Upload a PDF, Excel, or CSV financial statement to run an AI-powered fraud-risk analysis.",
};

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
