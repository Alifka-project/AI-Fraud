import Link from "next/link";
import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-navy-100 bg-white py-8 mt-16">
      <div className="container">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            <span className="font-semibold text-navy-900">InvestorShield UAE</span>
            <span className="text-xs text-muted-foreground hidden md:inline">
              · AI-assisted financial due-diligence
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-navy-700">
            <Link href="/methodology" className="hover:text-teal-600">Methodology</Link>
            <Link href="/upload" className="hover:text-teal-600">Start Analysis</Link>
            <span className="text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground max-w-3xl">
          Academic disclaimer: InvestorShield UAE is an educational, AI-assisted due-diligence
          tool. Risk scores are produced by statistical and machine-learning models and do not
          represent a legal determination of fraud. Investment decisions should rely on
          professional auditors, legal counsel, and verified primary documents.
        </p>
      </div>
    </footer>
  );
}
