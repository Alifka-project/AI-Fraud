"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, BookOpen, Upload, LayoutDashboard, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Shield },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-navy-100 bg-white/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-navy-900 to-teal-600 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-base font-semibold text-navy-900">InvestorShield</span>
            <span className="text-[10px] uppercase tracking-widest text-teal-600">UAE</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-navy-50 text-navy-900"
                    : "text-navy-700 hover:bg-navy-50 hover:text-navy-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-navy-900 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-soft hover:opacity-95"
        >
          Start Analysis
        </Link>
      </div>
    </header>
  );
}
