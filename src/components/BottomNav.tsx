"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/stocktake", label: "Stocktake", icon: "▢" },
  { href: "/prep-list", label: "Prep List", icon: "☑" },
  { href: "/ordering", label: "Orders", icon: "📦" },
  { href: "/admin", label: "Admin", icon: "⚙" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-zinc-200 bg-white/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:dark:bg-zinc-950/80"
      aria-label="Main navigation"
    >
      {navItems.map(({ href, label, icon }) => {
        const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
              isActive
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="text-lg leading-none" aria-hidden>
              {icon}
            </span>
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
