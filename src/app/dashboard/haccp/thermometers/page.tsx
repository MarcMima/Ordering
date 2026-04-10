"use client";

import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ThermometerForm } from "@/components/haccp/ThermometerForm";

export default function ThermometersPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <div className="mb-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← HACCP weekoverzicht
          </Link>
        </div>
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">Thermometer-test</h1>
        <ThermometerForm />
      </main>
    </div>
  );
}
