import Link from "next/link";
import { Shield, Home, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex flex-col items-center justify-center py-28 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 to-teal-600 text-white">
        <Shield className="h-7 w-7" />
      </div>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
        Error 404
      </p>
      <h1 className="mt-2 text-4xl font-bold text-navy-900">Page not found</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back
        to analysing company risk.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="primary" size="lg">
          <Link href="/">
            <Home className="h-4 w-4" /> Back to home
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/upload">
            <Upload className="h-4 w-4" /> Start analysis
          </Link>
        </Button>
      </div>
    </div>
  );
}
