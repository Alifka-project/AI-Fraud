import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency: string = "AED"): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${currency} ${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${currency} ${(value / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${currency} ${(value / 1_000).toFixed(1)}K`;
  }
  return `${currency} ${value.toFixed(0)}`;
}

export function formatPercent(value: number, digits: number = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number, digits: number = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  if (score <= 80) return "HIGH";
  return "CRITICAL";
}

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "LOW":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "MEDIUM":
      return "text-amber-700 bg-amber-50 border-amber-200";
    case "HIGH":
      return "text-orange-700 bg-orange-50 border-orange-200";
    case "CRITICAL":
      return "text-red-700 bg-red-50 border-red-200";
  }
}

export function riskAccent(level: RiskLevel): string {
  switch (level) {
    case "LOW":
      return "bg-emerald-500";
    case "MEDIUM":
      return "bg-amber-500";
    case "HIGH":
      return "bg-orange-500";
    case "CRITICAL":
      return "bg-red-500";
  }
}
