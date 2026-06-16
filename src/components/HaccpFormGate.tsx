"use client";

import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useAppFormVisibility } from "@/hooks/useAppFormVisibility";
import type { AppFormKey } from "@/lib/appFormKeys";

export function HaccpFormGate({
  formKey,
  children,
}: {
  formKey: AppFormKey;
  children: React.ReactNode;
}) {
  const { isVisible, loading } = useAppFormVisibility();

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-ink-soft/80">Loading…</p>
        </main>
      </div>
    );
  }

  if (!isVisible(formKey)) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-ink-soft/80 hover:text-ink"
          >
            ← HACCP overview
          </Link>
          <p className="mt-6 card text-sm text-ink-soft">
            This form is hidden by an administrator. Ask an admin to enable it under Admin → Form visibility.
          </p>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
