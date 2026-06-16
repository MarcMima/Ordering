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

export function KitchenMenuContent() {
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
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6">
        <Link
          href="/kitchen"
          className="text-sm font-medium text-ink-soft/80 hover:text-ink"
        >
          ← Kitchen
        </Link>
        <h1 className="mt-4 page-title">Menu (data)</h1>
        <p className="mt-2 max-w-2xl help-text">
          Dishes from <code className="text-xs">menu_items</code>. Pick a category on the left; click a dish to see
          components (prep / raw ingredients / bowl bases) for nutrition &amp; food cost.
        </p>

        {loading && <p className="mt-6 help-text">Loading…</p>}
        {err && (
          <p className="mt-6 alert-error rounded-xl px-4 py-3 text-sm">
            {err}
          </p>
        )}
        {!loading && !err && items.length === 0 && (
          <p className="mt-6 help-text">
            No menu yet. Run migrations and <code className="text-xs">supabase db push</code>.
          </p>
        )}

        {!loading && !err && categories.length > 0 && activeCat && (
          <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:gap-10">
            <nav
              aria-label="Menu categories"
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
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-brand-green/10 bg-surface text-ink-soft hover:border-brand-green/15 hover:bg-background ",
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

            <div className="min-w-0 flex-1">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-soft/80">
                {labelForCategory(activeCat)}
              </h2>
              <ul className="space-y-2">
                {visibleItems.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/kitchen/menu/${m.id}`}
                      className="flex flex-col card px-4 py-3 transition-colors hover:border-brand-green/25 hover:bg-background"
                    >
                      <span className="font-medium text-ink">{m.name}</span>
                      <span className="mt-0.5 text-xs text-ink-soft/70">
                        {m.category}
                        {m.subcategory ? ` · ${m.subcategory}` : ""}
                      </span>
                      <span className="mt-2 text-xs font-medium text-ink-soft/80">Details →</span>
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
