"use client";

import Link from "next/link";
import { TopNav } from "@/components/TopNav";

const tiles = [
  { href: "/stocktake", title: "Stocktake", description: "Count raw ingredients and daily prep." },
  { href: "/prep-list", title: "Prep list", description: "What to prep today." },
  { href: "/ordering", title: "Orders", description: "Supplier orders for the location." },
];

export default function KitchenHubPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-lg px-4 py-8 pb-24 sm:px-6">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Kitchen</h1>
        <p className="mb-8 text-sm text-zinc-600 dark:text-zinc-400">
          Daily kitchen workflows for the selected location. Pick a task below.
        </p>
        <ul className="space-y-3">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50"
              >
                <span className="block font-medium text-zinc-900 dark:text-zinc-50">{t.title}</span>
                <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">{t.description}</span>
                <span className="mt-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
