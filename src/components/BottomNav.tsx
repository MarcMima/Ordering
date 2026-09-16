"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCan, PERMISSIONS } from "@/hooks/useCan";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/kitchen", label: "Kitchen" },
  { href: "/dashboard/haccp", label: "HACCP" },
  { href: "/admin", label: "Admin" },
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
      className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-hairline bg-surface py-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Main navigation"
    >
      <div
        className="grid w-full items-stretch px-0.5 sm:px-2"
        style={{
          gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
        }}
      >
        {visibleItems.map(({ href, label }) => {
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
              className={`flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center text-xs font-medium uppercase tracking-[0.12em] leading-tight transition-colors touch-manipulation sm:min-h-0 sm:px-1.5 sm:text-xs ${ isActive ? "text-brand-green border-t border-brand-green -mt-[9px] pt-[9px]" : "text-ink-quiet hover:text-brand-green" }`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
