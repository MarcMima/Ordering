"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";
import {
  computeMenuNutritionAndAllergens,
  formatNutritionLine,
  type NutritionTotals,
  type AllergenLabel,
} from "@/lib/menuNutritionAllergens";
import type { MenuItem } from "@/lib/types";

type ComponentRow = {
  id: string;
  quantity_grams: number;
  portion_label: string | null;
  option_group: string | null;
  is_optional: boolean | null;
  default_selected: boolean | null;
  bowl_base_option_id: string | null;
  prep_name: string | null;
  raw_name: string | null;
  base_display: string | null;
};

export default function KitchenMenuItemPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [item, setItem] = useState<MenuItem | null>(null);
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nutritionLines, setNutritionLines] = useState<string[]>([]);
  const [nutritionIncomplete, setNutritionIncomplete] = useState(false);
  const [nutritionSource, setNutritionSource] = useState<
    "computed" | "computed_with_lab" | "declared_override" | "calculated" | null
  >(null);
  const [declaredSourceLabel, setDeclaredSourceLabel] = useState<string | null>(null);
  const [allergens, setAllergens] = useState<AllergenLabel[]>([]);
  const [analysisNotes, setAnalysisNotes] = useState<string[]>([]);
  const [analysisErr, setAnalysisErr] = useState<string | null>(null);
  const [selectedBaseOptionId, setSelectedBaseOptionId] = useState<string | null>(null);
  const [componentNutritionById, setComponentNutritionById] = useState<
    Map<string, { nutrition: NutritionTotals; nutritionIncomplete: boolean }>
  >(new Map());

  const formatOne = (x: number) => (Math.round(x * 10) / 10).toLocaleString("nl-NL");
  const formatComponentNutrition = (n: NutritionTotals) =>
    `Energy ${formatOne(n.kcal)} kcal · Protein ${formatOne(n.protein_g)} g · Carbohydrates ${formatOne(
      n.carbs_g,
    )} g · Fat ${formatOne(n.fat_g)} g`;

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    void (async () => {
      const { data: mi, error: e1 } = await supabase
        .from("menu_items")
        .select("id, name, category, subcategory, price_cents, active, description, display_order")
        .eq("id", id)
        .maybeSingle();
      if (e1) {
        setLoading(false);
        setErr(e1.message);
        return;
      }
      if (!mi) {
        setLoading(false);
        setErr("Dish not found.");
        return;
      }
      setItem(mi as MenuItem);

      const { data: comps, error: e2 } = await supabase
        .from("menu_item_components")
        .select(
          `
          id,
          quantity_grams,
          portion_label,
          option_group,
          is_optional,
          prep_item_id,
          raw_ingredient_id,
          bowl_base_option_id,
          prep_items ( name ),
          raw_ingredients ( name ),
          bowl_base_options ( display_name )
        `,
        )
        .eq("menu_item_id", id)
        .order("display_order", { ascending: true });

      if (e2) {
        setLoading(false);
        setErr(e2.message);
        return;
      }

      const mapped: ComponentRow[] = (comps ?? []).map((c: Record<string, unknown>) => {
        const prep = c.prep_items as { name?: string } | null;
        const raw = c.raw_ingredients as { name?: string } | null;
        const base = c.bowl_base_options as { display_name?: string } | null;
        return {
          id: c.id as string,
          quantity_grams: Number(c.quantity_grams),
          portion_label: (c.portion_label as string | null) ?? null,
          option_group: (c.option_group as string | null) ?? null,
          is_optional: (c.is_optional as boolean | null) ?? null,
          default_selected: (c.default_selected as boolean | null) ?? null,
          bowl_base_option_id: (c.bowl_base_option_id as string | null) ?? null,
          prep_name: prep?.name ?? null,
          raw_name: raw?.name ?? null,
          base_display: base?.display_name ?? null,
        };
      });
      setRows(mapped);

      const baseOptions = mapped.filter((r) => r.option_group === "base" && r.bowl_base_option_id);
      const defaultBase =
        baseOptions.find((r) => r.default_selected && r.bowl_base_option_id)?.bowl_base_option_id ??
        baseOptions[0]?.bowl_base_option_id ??
        null;
      setSelectedBaseOptionId(defaultBase);

      try {
        const a = await computeMenuNutritionAndAllergens(supabase, id, defaultBase);
        setNutritionLines(formatNutritionLine(a.nutrition));
        setNutritionIncomplete(a.nutritionIncomplete);
        setNutritionSource(a.nutritionSource);
        setDeclaredSourceLabel(a.declaredSource ?? null);
        setAllergens(a.allergens);
        setAnalysisNotes(a.notes);
        setComponentNutritionById(
          new Map(
            a.componentNutrition.map((x) => [
              x.componentId,
              { nutrition: x.nutrition, nutritionIncomplete: x.nutritionIncomplete },
            ]),
          ),
        );
        setAnalysisErr(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setAnalysisErr(
          msg.includes("raw_ingredient_allergens") || msg.includes("allergen_types")
            ? "Allergens: migration 075 has not been applied yet (supabase db push)."
            : msg,
        );
        setNutritionLines([]);
        setNutritionSource(null);
        setDeclaredSourceLabel(null);
        setAllergens([]);
        setAnalysisNotes([]);
        setComponentNutritionById(new Map());
      }

      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (!selectedBaseOptionId) return;
    const supabase = createClient();
    void (async () => {
      try {
        const a = await computeMenuNutritionAndAllergens(supabase, id, selectedBaseOptionId);
        setNutritionLines(formatNutritionLine(a.nutrition));
        setNutritionIncomplete(a.nutritionIncomplete);
        setNutritionSource(a.nutritionSource);
        setDeclaredSourceLabel(a.declaredSource ?? null);
        setAllergens(a.allergens);
        setAnalysisNotes(a.notes);
        setComponentNutritionById(
          new Map(
            a.componentNutrition.map((x) => [
              x.componentId,
              { nutrition: x.nutrition, nutritionIncomplete: x.nutritionIncomplete },
            ]),
          ),
        );
        setAnalysisErr(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setAnalysisErr(msg);
        setComponentNutritionById(new Map());
      }
    })();
  }, [id, selectedBaseOptionId]);

  const bowlBaseOptions = rows.filter((r) => r.option_group === "base" && r.bowl_base_option_id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6">
        <Link
          href="/kitchen/menu"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Menu overview
        </Link>

        {loading && <p className="mt-6 text-sm text-zinc-500">Loading...</p>}
        {err && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </p>
        )}

        {!loading && item && (
          <>
            <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{item.name}</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {item.category}
              {item.subcategory ? ` · ${item.subcategory}` : ""}
            </p>

            <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Nutritional values</h2>
              {bowlBaseOptions.length > 0 && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Bowl base selection</label>
                  <select
                    value={selectedBaseOptionId ?? ""}
                    onChange={(e) => setSelectedBaseOptionId(e.target.value || null)}
                    className="h-10 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {bowlBaseOptions.map((opt) => (
                      <option key={opt.id} value={opt.bowl_base_option_id ?? ""}>
                        {opt.base_display ?? opt.prep_name ?? "Base option"}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {nutritionSource === "declared_override" ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Declared override active: official values per full portion
                  {declaredSourceLabel ? ` · source: ${declaredSourceLabel}` : ""}).
                </p>
              ) : nutritionSource === "computed_with_lab" ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Computed per portion from recipes + raw ingredients, with lab-priority for measured inputs.
                </p>
              ) : nutritionSource === "computed" ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Computed per portion from recipes + raw ingredients (database-first model).
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Estimate per portion: prep items first use recipe lines x raw ingredient values; if those are
                  missing, cached prep values are used as fallback.
                </p>
              )}
              {nutritionSource && (
                <div className="mt-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {nutritionSource === "declared_override"
                      ? "Declared override"
                      : nutritionSource === "computed_with_lab"
                        ? "Computed + lab input"
                        : nutritionSource === "computed"
                          ? "Computed"
                          : "Calculated fallback"}
                  </span>
                </div>
              )}
              {analysisErr && (
                <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{analysisErr}</p>
              )}
              {!analysisErr && nutritionLines.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
                  {nutritionLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {!analysisErr && nutritionLines.length === 0 && !nutritionIncomplete && (
                <p className="mt-3 text-sm text-zinc-500">No nutritional data linked to these components yet.</p>
              )}
              {nutritionIncomplete && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  Note: some ingredients are still missing NEVO/label values in the database, or{" "}
                  <code className="text-[10px]">content_amount</code> is missing on a prep item - totals may be lower
                  than reality.
                </p>
              )}
            </section>

            <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Allergens</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Union of allergens on raw ingredient level (including prep recipe lines) and all bowl-base variants on
                this dish. No trace labeling.
              </p>
              {allergens.length === 0 && !analysisErr ? (
                <p className="mt-3 text-sm text-zinc-500">
                  No known allergens in current data - check raw ingredient allergens in Admin → Ingredients.
                </p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {allergens.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      {a.label_nl}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {analysisNotes.length > 0 && (
              <ul className="mt-4 list-inside list-disc text-xs text-zinc-500">
                {analysisNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            <section className="mt-8">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Components</h2>
              {rows.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No links in menu_item_components yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {rows.map((r) => {
                    const isInactiveBase =
                      r.option_group === "base" &&
                      r.bowl_base_option_id != null &&
                      r.bowl_base_option_id !== selectedBaseOptionId;
                    if (isInactiveBase) return null;
                    return (
                      (() => {
                      const componentNutrition = componentNutritionById.get(r.id);
                      return (
                        <li
                          key={r.id}
                          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/60"
                        >
                          <div className="font-medium text-zinc-900 dark:text-zinc-50">
                            {r.base_display ?? r.prep_name ?? r.raw_name ?? "—"}
                          </div>
                          <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                            {r.quantity_grams} g
                            {r.portion_label ? ` · ${r.portion_label}` : ""}
                            {r.option_group ? ` · group: ${r.option_group}` : ""}
                            {r.is_optional ? " · optional" : ""}
                          </div>
                          {componentNutrition ? (
                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-300">
                              {formatComponentNutrition(componentNutrition.nutrition)}
                              {componentNutrition.nutritionIncomplete ? " · incomplete input" : ""}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              No calculated nutritional values available.
                            </div>
                          )}
                        </li>
                      );
                    })()
                  );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
