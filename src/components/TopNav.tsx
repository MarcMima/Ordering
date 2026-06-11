"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { useCan, PERMISSIONS } from "@/hooks/useCan";
import { createClient } from "@/lib/supabase";

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
        <Link
          href="/dashboard"
          className="relative shrink-0 rounded-md bg-surface"
          aria-label="Mima — Fresh Mediterranean"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mima-logo.png"
            alt=""
            width={160}
            height={85}
            className="mima-logo-img"
            decoding="async"
          />
        </Link>

        <div className="topnav-mobile-only">
          <Link
            href="/dashboard"
            className="min-w-0 max-w-[45vw] truncate text-xs font-medium text-ink-soft underline decoration-brand-sage/60 underline-offset-2"
            title={currentName}
          >
            {currentName}
          </Link>
          <button type="button" onClick={() => void handleSignOut()} className="btn-ghost shrink-0">
            Sign out
          </button>
        </div>

        <div className="topnav-desktop-only">
          <span className="topnav-location-row text-sm">
            <span
              className="truncate rounded-md bg-brand-sand/50 px-2 py-0.5 font-medium text-brand-green"
              title={currentName}
            >
              {currentName}
            </span>
            <Link
              href="/dashboard"
              className="shrink-0 text-sm font-medium text-accent-terracotta hover:text-accent-terracotta/80"
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
          <Link
            href="/dashboard/haccp"
            className="nav-link text-accent-terracotta hover:text-accent-terracotta"
          >
            HACCP
          </Link>
          {canViewAdmin && (
            <Link href="/admin" className="btn-primary px-3 py-1.5 lg:px-3">
              Admin
            </Link>
          )}
          <button type="button" onClick={() => void handleSignOut()} className="btn-ghost">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
