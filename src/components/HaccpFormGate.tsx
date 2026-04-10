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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-zinc-500">Loading…</p>
        </main>
      </div>
    );
  }

  if (!isVisible(formKey)) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← HACCP overview
          </Link>
          <p className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            This form is hidden by an administrator. Ask an admin to enable it under Admin → Form visibility.
          </p>
        </main>
      </div>
    );
  }

  return <>{children}</>;
}
