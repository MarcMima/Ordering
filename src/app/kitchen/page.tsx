"use client";

import Link from "next/link";
import { TopNav } from "@/components/TopNav";

const tiles = [
  { href: "/stocktake", title: "Stocktake", description: "Count raw ingredients and daily prep." },
  { href: "/prep-list", title: "Prep list", description: "What to prep today." },
  { href: "/ordering", title: "Orders", description: "Supplier orders for the location." },
  {
    href: "/kitchen/menu",
    title: "Menu (data)",
    description: "Dishes linked to prep items and ingredients (nutrition / cost).",
  },
];

export default function KitchenHubPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-lg px-4 py-8 pb-24 sm:px-6">
        <h1 className="mb-2 page-title">Kitchen</h1>
        <p className="mb-8 help-text">
          Daily kitchen workflows for the selected location. Pick a task below.
        </p>
        <ul className="space-y-3">
          {tiles.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="block card transition-colors hover:border-brand-green/15 hover:bg-background"
              >
                <span className="block font-medium text-ink">{t.title}</span>
                <span className="mt-1 block help-text">{t.description}</span>
                <span className="mt-2 block text-sm font-medium text-ink-soft">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
