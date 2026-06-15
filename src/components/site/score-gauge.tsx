"use client";

import { riskLevelFromScore } from "@/lib/utils";

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

export function ScoreGauge({ score, size = 220 }: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const level = riskLevelFromScore(clamped);
  const strokeColor =
    level === "LOW"
      ? "#10b981"
      : level === "MEDIUM"
        ? "#f59e0b"
        : level === "HIGH"
          ? "#f97316"
          : "#dc2626";

  const stroke = 14;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  // Use 75% of the circle for an arc-style gauge.
  const arcLen = circumference * 0.75;
  const offset = arcLen * (1 - clamped / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[135deg]" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLen - offset} ${circumference}`}
          style={{ transition: "stroke-dasharray 800ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-navy-900">{Math.round(clamped)}</span>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Risk Score
        </span>
      </div>
    </div>
  );
}
