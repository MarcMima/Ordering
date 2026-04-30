"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";

type RawIngredient = {
  id: string;
  name: string;
  unit: string;
};

type Supplier = {
  id: string;
  name: string;
};

type PriceEntry = {
  id: string;
  raw_ingredient_id: string;
  supplier_id: string | null;
  pack_size_grams: number;
  pack_size_label: string | null;
  price_cents: number;
  effective_date: string;
  source: string;
  notes: string | null;
  ingredient_name?: string;
  supplier_name?: string;
  price_cents_per_gram?: number;
};

type ScraperRun = {
  id: string;
  supplier_name: string;
  run_at: string;
  status: string;
  prices_updated: number | null;
  prices_unchanged: number | null;
  errors: unknown;
};

type QualityIssue = {
  ingredient_name: string;
  issue_code: string;
  severity: string;
  message: string;
};

type NutritionDiscrepancy = {
  menu_item_name: string;
  computed_kcal: number | null;
  declared_kcal: number | null;
  kcal_diff_pct: number | null;
  has_lab_inputs: boolean;
  missing_inputs: boolean;
  declared_source: string | null;
  use_declared_override: boolean;
};

function formatPrice(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatPricePerKg(centsPerGram: number) {
  return `€${((centsPerGram * 1000) / 100).toFixed(2)}/kg`;
}

function sourceLabel(source: string) {
  return { manual: "Handmatig", scraper: "Scraper", invoice_import: "Factuur" }[source] ?? source;
}

function sourceBadge(source: string) {
  const base = "rounded px-1.5 py-0.5 text-[10px] font-semibold";
  if (source === "scraper") return `${base} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400`;
  if (source === "invoice_import") return `${base} bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400`;
  return `${base} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400`;
}

function AddPriceForm({
  ingredients,
  suppliers,
  onSaved,
}: {
  ingredients: RawIngredient[];
  suppliers: Supplier[];
  onSaved: () => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [packSizeGrams, setPackSizeGrams] = useState("");
  const [packSizeLabel, setPackSizeLabel] = useState("");
  const [priceEuros, setPriceEuros] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!ingredientId || !packSizeGrams || !priceEuros) {
      setError("Vul minimaal grondstof, pakgrootte en prijs in.");
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.from("ingredient_prices").insert({
      raw_ingredient_id: ingredientId,
      supplier_id: supplierId || null,
      pack_size_grams: parseFloat(packSizeGrams),
      pack_size_label: packSizeLabel || null,
      price_cents: Math.round(parseFloat(priceEuros) * 100),
      effective_date: effectiveDate,
      source: "manual",
      notes: notes || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setIngredientId("");
      setSupplierId("");
      setPackSizeGrams("");
      setPackSizeLabel("");
      setPriceEuros("");
      setNotes("");
      onSaved();
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Prijs invoeren</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-xs text-zinc-500">Grondstof</label>
          <select
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
          >
            <option value="">— kies grondstof —</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Leverancier</label>
          <select
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">— kies —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Pakgrootte (gram)</label>
          <input
            type="number"
            min={1}
            placeholder="bijv. 5000"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={packSizeGrams}
            onChange={(e) => setPackSizeGrams(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Label verpakking</label>
          <input
            type="text"
            placeholder="bijv. 5 kg zak"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={packSizeLabel}
            onChange={(e) => setPackSizeLabel(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Prijs (€, excl. BTW)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="bijv. 12.50"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={priceEuros}
            onChange={(e) => setPriceEuros(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Ingangsdatum</label>
          <input
            type="date"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </div>

        <div className="col-span-2 sm:col-span-3">
          <label className="mb-1 block text-xs text-zinc-500">Notitie (optioneel)</label>
          <input
            type="text"
            placeholder="bijv. prijsstijging door droogte"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {saving ? "Opslaan…" : "Prijs opslaan"}
      </button>
    </div>
  );
}

function PriceRow({ entry }: { entry: PriceEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.ingredient_name}</p>
        <p className="text-xs text-zinc-500">
          {entry.supplier_name ?? "—"} · {entry.pack_size_label ?? `${entry.pack_size_grams}g`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatPrice(entry.price_cents)}
        </p>
        {entry.price_cents_per_gram != null && (
          <p className="text-xs text-zinc-400">{formatPricePerKg(entry.price_cents_per_gram)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className={sourceBadge(entry.source)}>{sourceLabel(entry.source)}</span>
        <p className="mt-0.5 text-[10px] text-zinc-400">{entry.effective_date}</p>
      </div>
    </div>
  );
}

function ScraperStatus({ runs }: { runs: ScraperRun[] }) {
  if (!runs.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Laatste scraper runs</h3>
      </div>
      <div>
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800"
          >
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{run.supplier_name}</p>
              <p className="text-xs text-zinc-500">{new Date(run.run_at).toLocaleString("nl-NL")}</p>
            </div>
            <div className="text-right">
              <span
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  run.status === "success"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                    : run.status === "partial"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                }`}
              >
                {run.status}
              </span>
              <p className="mt-0.5 text-xs text-zinc-400">
                {run.prices_updated ?? 0} bijgewerkt · {run.prices_unchanged ?? 0} ongewijzigd
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPricesPage() {
  const [ingredients, setIngredients] = useState<RawIngredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [scraperRuns, setScraperRuns] = useState<ScraperRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [triggeringScrapers, setTriggeringScrapers] = useState(false);
  const [foodCostIssues, setFoodCostIssues] = useState<QualityIssue[]>([]);
  const [nutritionIssues, setNutritionIssues] = useState<QualityIssue[]>([]);
  const [nutritionDiscrepancies, setNutritionDiscrepancies] = useState<NutritionDiscrepancy[]>([]);

  const loadPrices = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("ingredient_current_prices").select("*").order("ingredient_name");
    setPrices((data as PriceEntry[]) ?? []);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [ing, sup, runs] = await Promise.all([
        supabase.from("raw_ingredients").select("id, name, unit").order("name"),
        supabase.from("suppliers").select("id, name").order("name"),
        supabase.from("scraper_runs").select("*").order("run_at", { ascending: false }).limit(10),
      ]);
      setIngredients((ing.data as RawIngredient[]) ?? []);
      setSuppliers((sup.data as Supplier[]) ?? []);
      setScraperRuns((runs.data as ScraperRun[]) ?? []);
      const [foodIssues, nutIssues, diffs] = await Promise.all([
        supabase.from("food_cost_quality_issues").select("ingredient_name, issue_code, severity, message").limit(200),
        supabase.from("ingredient_nutrition_quality_issues").select("ingredient_name, issue_code, severity, message").limit(200),
        supabase
          .from("menu_item_nutrition_discrepancy")
          .select("menu_item_name, computed_kcal, declared_kcal, kcal_diff_pct, has_lab_inputs, missing_inputs, declared_source, use_declared_override")
          .not("kcal_diff_pct", "is", null)
          .order("kcal_diff_pct", { ascending: false })
          .limit(100),
      ]);
      setFoodCostIssues((foodIssues.data as QualityIssue[]) ?? []);
      setNutritionIssues((nutIssues.data as QualityIssue[]) ?? []);
      setNutritionDiscrepancies((diffs.data as NutritionDiscrepancy[]) ?? []);
      await loadPrices();
      setLoading(false);
    }
    void load();
  }, [loadPrices]);

  async function triggerScrapers() {
    setTriggeringScrapers(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("scrape-prices");
      if (error) console.error("Scraper edge function:", error);
      else console.log("Scraper resultaten:", data);
      const { data: runRows } = await supabase
        .from("scraper_runs")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(10);
      setScraperRuns((runRows as ScraperRun[]) ?? []);
      await loadPrices();
    } catch (e) {
      console.error("Scraper fout:", e);
    }
    setTriggeringScrapers(false);
  }

  const filtered = prices.filter((p) => (p.ingredient_name ?? "").toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-zinc-400">Prijzen laden…</p>
        </div>
      </div>
    );
  }

  const withPrice = prices.length;
  const totalIngredients = ingredients.length;
  const missingPrice = Math.max(0, totalIngredients - withPrice);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <div className="mx-auto max-w-2xl px-4 pb-32 pt-6 sm:px-6">
        <Link
          href="/admin"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Admin
        </Link>
        <div className="mb-6 mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Prijzen</h1>
            <p className="text-sm text-zinc-500">
              {withPrice} actuele prijsregels (view ingredient_current_prices). {totalIngredients} grondstoffen in DB.
              {missingPrice > 0 && <span className="ml-1 text-amber-600">Indicatie: veel grondstoffen zonder actuele rij.</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void triggerScrapers()}
            disabled={triggeringScrapers}
            className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {triggeringScrapers ? "Bezig…" : "↻ Scrapers draaien"}
          </button>
        </div>

        <div className="mb-6">
          <AddPriceForm ingredients={ingredients} suppliers={suppliers} onSaved={loadPrices} />
        </div>

        <input
          type="search"
          placeholder="Zoek grondstof…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        />

        <div className="mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">
              {search ? "Geen resultaten." : "Nog geen prijzen ingevoerd."}
            </p>
          ) : (
            filtered.map((entry) => <PriceRow key={entry.id} entry={entry} />)
          )}
        </div>

        <ScraperStatus runs={scraperRuns} />

        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Food cost quality checks</h3>
            {foodCostIssues.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Geen issues gevonden.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {foodCostIssues.slice(0, 20).map((row, idx) => (
                  <li key={`${row.ingredient_name}-${row.issue_code}-${idx}`} className="rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700">
                    <span className="font-medium">{row.ingredient_name}</span> · {row.issue_code} · {row.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nutrition sanity checks</h3>
            {nutritionIssues.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Geen issues gevonden.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {nutritionIssues.slice(0, 20).map((row, idx) => (
                  <li key={`${row.ingredient_name}-${row.issue_code}-${idx}`} className="rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700">
                    <span className="font-medium">{row.ingredient_name}</span> · {row.issue_code} · {row.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Declared vs computed (kcal)</h3>
            {nutritionDiscrepancies.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Nog geen afwijkingen om te tonen.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {nutritionDiscrepancies.slice(0, 20).map((row, idx) => (
                  <li key={`${row.menu_item_name}-${idx}`} className="rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700">
                    <span className="font-medium">{row.menu_item_name}</span> · declared {row.declared_kcal ?? "—"} kcal ·
                    computed {row.computed_kcal ?? "—"} kcal · diff {row.kcal_diff_pct?.toFixed(1)}%
                    {row.has_lab_inputs ? " · lab input" : ""}
                    {row.use_declared_override ? " · override" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-medium">Over de automatische scraper</p>
          <p className="mt-1 text-xs leading-relaxed">
            Edge Function <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">scrape-prices</code> moet
            nog per leverancier worden ingericht. CSV/API van leveranciers is meestal betrouwbaarder dan scrapen.
          </p>
        </div>
      </div>
    </div>
  );
}
