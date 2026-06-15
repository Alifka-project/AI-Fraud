import { cn, type RiskLevel } from "@/lib/utils";
import { AlertTriangle, AlertOctagon, CheckCircle2, AlertCircle } from "lucide-react";

const LEVEL_META: Record<
  RiskLevel,
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  LOW: {
    label: "Low Risk",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: CheckCircle2,
  },
  MEDIUM: {
    label: "Medium Risk",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: AlertCircle,
  },
  HIGH: {
    label: "High Risk",
    classes: "bg-orange-50 text-orange-700 border-orange-200",
    Icon: AlertTriangle,
  },
  CRITICAL: {
    label: "Critical Risk",
    classes: "bg-red-50 text-red-700 border-red-200",
    Icon: AlertOctagon,
  },
};

interface RiskBadgeProps {
  level: RiskLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RiskBadge({ level, size = "md", className }: RiskBadgeProps) {
  const meta = LEVEL_META[level];
  const Icon = meta.Icon;
  const sizeClasses =
    size === "lg"
      ? "px-4 py-2 text-base gap-2"
      : size === "sm"
        ? "px-2 py-0.5 text-xs gap-1"
        : "px-3 py-1 text-sm gap-1.5";
  const iconSize =
    size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3 w-3" : "h-4 w-4";
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        meta.classes,
        sizeClasses,
        className
      )}
    >
      <Icon className={iconSize} />
      {meta.label}
    </div>
  );
}
