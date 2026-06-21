import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InvestorShield UAE",
    short_name: "InvestorShield",
    description:
      "AI-powered financial statement fraud detection and company scam-risk assessment for Dubai investors.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0f4fa",
    theme_color: "#0a1f3d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
