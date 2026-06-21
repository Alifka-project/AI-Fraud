import { Shield } from "lucide-react";

export default function Loading() {
  return (
    <div className="container flex flex-col items-center justify-center py-32 text-center">
      <div className="relative">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 to-teal-600 text-white animate-pulse">
          <Shield className="h-7 w-7" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Loading InvestorShield…</p>
    </div>
  );
}
