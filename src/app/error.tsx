"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where an error reporter (Sentry, etc.) would hook in.
    console.error(error);
  }, [error]);

  return (
    <div className="container flex flex-col items-center justify-center py-28 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <AlertOctagon className="h-7 w-7" />
      </div>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-red-600">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-bold text-navy-900">Unexpected error</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        An error occurred while processing your request. You can retry, or head back home and
        start a fresh analysis.
      </p>
      {error?.digest ? (
        <p className="mt-2 text-xs font-mono text-muted-foreground">Ref: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()} variant="primary" size="lg">
          <RotateCw className="h-4 w-4" /> Try again
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">
            <Home className="h-4 w-4" /> Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
