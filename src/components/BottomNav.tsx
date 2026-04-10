"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/stocktake", label: "Stocktake", icon: "▢" },
  { href: "/prep-list", label: "Prep List", icon: "☑" },
  { href: "/ordering", label: "Orders", icon: "📦" },
  { href: "/dashboard/haccp", label: "HACCP", icon: "📋" },
  { href: "/admin", label: "Admin", icon: "⚙" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex overflow-x-auto overflow-y-hidden border-t border-zinc-200 bg-white/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:dark:bg-zinc-950/80"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      {navItems.map(({ href, label, icon }) => {
        const isActive =
          pathname === href ||
          (href === "/dashboard"
            ? pathname === "/dashboard" || pathname === "/dashboard/"
            : href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-w-[3.75rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium leading-tight transition-colors touch-manipulation sm:min-w-[4.25rem] sm:px-2 sm:text-xs ${
              isActive
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="text-base leading-none sm:text-lg" aria-hidden>
              {icon}
            </span>
            <span className="max-w-[4.5rem] text-center leading-snug break-words sm:max-w-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
