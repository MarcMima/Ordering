"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";
import type { MenuItem } from "@/lib/types";

/** Vaste volgorde in de linker kolom; onbekende categorieën volgen alfabetisch. */
const CATEGORY_ORDER = [
  "flatbread",
  "pita",
  "bowl",
  "mezze",
  "side",
  "snack",
  "dessert",
  "warm",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  flatbread: "Flatbread",
  pita: "Pita",
  bowl: "Bowls",
  mezze: "Mezze",
  side: "Sides",
  snack: "Snacks",
  dessert: "Desserts",
  warm: "Warm",
};

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
    const ib = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
    const sa = ia === -1 ? 1000 : ia;
    const sb = ib === -1 ? 1000 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

function labelForCategory(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function KitchenMenuPage() {
  const searchParams = useSearchParams();
  const catFromUrl = searchParams.get("cat");

  const [items, setItems] = useState<MenuItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const m of items) {
      const c = m.category || "other";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(m);
    }
    return map;
  }, [items]);

  const categories = useMemo(() => sortCategories([...byCategory.keys()]), [byCategory]);

  const activeCat = useMemo(() => {
    if (categories.length === 0) return null;
    if (catFromUrl && byCategory.has(catFromUrl)) return catFromUrl;
    return categories[0]!;
  }, [catFromUrl, categories, byCategory]);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, category, subcategory, price_cents, active, description, sides_product_id, display_order")
        .eq("active", true)
        .order("display_order", { ascending: true });
      setLoading(false);
      if (error) {
        setErr(error.message);
        return;
      }
      setItems((data as MenuItem[]) ?? []);
    })();
  }, []);

  const visibleItems = activeCat ? (byCategory.get(activeCat) ?? []) : [];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6">
        <Link
          href="/kitchen"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Kitchen
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Menu (data)</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Gerechten uit <code className="text-xs">menu_items</code>. Kies links een categorie; klik een gerecht voor
          componenten (prep / grondstoffen / bowl-bases) voor nutrition & food-cost.
        </p>

        {loading && <p className="mt-6 text-sm text-zinc-500">Laden…</p>}
        {err && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </p>
        )}
        {!loading && !err && items.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500">
            Nog geen menu. Voer migraties uit en draai <code className="text-xs">supabase db push</code>.
          </p>
        )}

        {!loading && !err && categories.length > 0 && activeCat && (
          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-10">
            {/* Categorieën — mobiel: horizontaal scrollen; desktop: vaste linker kolom */}
            <nav
              aria-label="Menucategorieën"
              className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:w-52 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {categories.map((cat) => {
                const active = cat === activeCat;
                return (
                  <Link
                    key={cat}
                    href={`/kitchen/menu?cat=${encodeURIComponent(cat)}`}
                    scroll={false}
                    className={[
                      "whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-700/50",
                    ].join(" ")}
                  >
                    {labelForCategory(cat)}
                    <span className="ml-1.5 text-xs font-normal opacity-70">
                      ({byCategory.get(cat)?.length ?? 0})
                    </span>
                  </Link>
                );
              })}
            </nav>

            {/* Gerechten in gekozen categorie */}
            <div className="min-w-0 flex-1">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
                {labelForCategory(activeCat)}
              </h2>
              <ul className="space-y-2">
                {visibleItems.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/kitchen/menu/${m.id}`}
                      className="flex flex-col rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">{m.name}</span>
                      <span className="mt-0.5 text-xs text-zinc-500">
                        {m.category}
                        {m.subcategory ? ` · ${m.subcategory}` : ""}
                      </span>
                      <span className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Details →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
