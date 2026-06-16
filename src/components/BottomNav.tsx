"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCan, PERMISSIONS } from "@/hooks/useCan";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/kitchen", label: "Kitchen", icon: "◇" },
  { href: "/dashboard/haccp", label: "HACCP", icon: "📋" },
  { href: "/admin", label: "Admin", icon: "⚙" },
];

function isKitchenPath(pathname: string): boolean {
  return (
    pathname === "/kitchen" ||
    pathname.startsWith("/kitchen/") ||
    pathname.startsWith("/stocktake") ||
    pathname.startsWith("/prep-list") ||
    pathname.startsWith("/ordering")
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { allowed: canViewAdmin } = useCan(PERMISSIONS.settingsManage);
  const visibleItems = canViewAdmin ? navItems : navItems.filter((item) => item.href !== "/admin");
  const colCount = visibleItems.length;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-brand-green/10 bg-surface/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface/90"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div
        className="grid w-full items-stretch px-0.5 sm:px-2"
        style={{
          gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
        }}
      >
        {visibleItems.map(({ href, label, icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/dashboard/"
              : href === "/kitchen"
                ? isKitchenPath(pathname)
                : href !== "/dashboard" && pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors touch-manipulation sm:min-h-0 sm:px-1.5 sm:text-xs ${ isActive ? "text-brand-green" : "text-ink-soft/70 hover:text-brand-green" }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="text-base leading-none sm:text-lg" aria-hidden>
                {icon}
              </span>
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
