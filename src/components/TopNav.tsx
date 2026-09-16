"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useCan, PERMISSIONS } from "@/hooks/useCan";
import { createClient } from "@/lib/supabase";
import { FeedbackButton } from "@/components/FeedbackButton";

export function TopNav() {
  const router = useRouter();
  const { locationId, locationOptions } = useLocation();
  const { allowed: canViewAdmin } = useCan(PERMISSIONS.settingsManage);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentName = locationOptions.find((l) => l.id === locationId)?.name ?? "Select location";

  return (
    <nav className="nav-header" aria-label="Site header">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 md:h-14 md:py-0">
        <Link href="/dashboard" className="wordmark shrink-0" aria-label="Mima — Fresh Mediterranean">
          <span className="wordmark-name">mima</span>
          <span className="wordmark-tagline">Fresh · Mediterranean</span>
        </Link>

        <div className="topnav-mobile-only">
          <Link
            href="/dashboard"
            className="min-w-0 max-w-[45vw] truncate text-xs text-ink-muted"
            title={currentName}
          >
            {currentName}
          </Link>
          <FeedbackButton />
          <button type="button" onClick={() => void handleSignOut()} className="btn-ghost shrink-0">
            Sign out
          </button>
        </div>

        <div className="topnav-desktop-only">
          <span className="topnav-location-row text-sm">
            <span className="truncate text-ink-muted" title={currentName}>
              {currentName}
            </span>
            <span className="text-ink-quiet" aria-hidden>·</span>
            <Link
              href="/dashboard"
              className="shrink-0 border-b border-brand-green/35 pb-[1px] text-sm text-brand-green hover:text-accent-orange"
            >
              Change location
            </Link>
          </span>
        </div>

        <div className="topnav-desktop-links">
          <Link href="/dashboard" className="nav-link">
            Dashboard
          </Link>
          <Link href="/kitchen" className="nav-link">
            Kitchen
          </Link>
          <Link href="/dashboard/haccp" className="nav-link">
            HACCP
          </Link>
          {canViewAdmin && (
            <Link href="/admin" className="nav-link">
              Admin
            </Link>
          )}
          <FeedbackButton />
          <button type="button" onClick={() => void handleSignOut()} className="btn-ghost">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
