import type { SupabaseClient } from "@supabase/supabase-js";

/** Som voor één portie (zoals berekend uit componenten). */
export type NutritionTotals = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  sugar_g: number;
  fat_g: number;
  sat_fat_g: number;
  fiber_g: number;
  salt_g: number;
};

export type AllergenLabel = { id: string; code: string; label_nl: string; sort_order: number };

const ZERO: NutritionTotals = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  sugar_g: 0,
  fat_g: 0,
  sat_fat_g: 0,
  fiber_g: 0,
  salt_g: 0,
};

function addScaled(target: NutritionTotals, per100: Partial<NutritionTotals> | null | undefined, grams: number) {
  if (!per100 || grams <= 0) return;
  const f = grams / 100;
  if (per100.kcal != null) target.kcal += Number(per100.kcal) * f;
  if (per100.protein_g != null) target.protein_g += Number(per100.protein_g) * f;
  if (per100.carbs_g != null) target.carbs_g += Number(per100.carbs_g) * f;
  if (per100.sugar_g != null) target.sugar_g += Number(per100.sugar_g) * f;
  if (per100.fat_g != null) target.fat_g += Number(per100.fat_g) * f;
  if (per100.sat_fat_g != null) target.sat_fat_g += Number(per100.sat_fat_g) * f;
  if (per100.fiber_g != null) target.fiber_g += Number(per100.fiber_g) * f;
  if (per100.salt_g != null) target.salt_g += Number(per100.salt_g) * f;
}

function addPrepPer100(
  target: NutritionTotals,
  row: Record<string, unknown> | null | undefined,
  grams: number,
) {
  if (!row || grams <= 0) return;
  addScaled(
    target,
    {
      kcal: row.kcal_per_100g as number | undefined,
      protein_g: row.protein_per_100g as number | undefined,
      carbs_g: row.carbs_per_100g as number | undefined,
      sugar_g: row.sugar_per_100g as number | undefined,
      fat_g: row.fat_per_100g as number | undefined,
      sat_fat_g: row.sat_fat_per_100g as number | undefined,
      fiber_g: row.fiber_per_100g as number | undefined,
      salt_g: row.salt_per_100g as number | undefined,
    },
    grams,
  );
}

function addRawPer100(
  target: NutritionTotals,
  row: Record<string, unknown> | null | undefined,
  grams: number,
) {
  if (!row || grams <= 0) return;
  addScaled(
    target,
    {
      kcal: row.kcal_per_100g as number | undefined,
      protein_g: row.protein_g as number | undefined,
      carbs_g: row.carbs_g as number | undefined,
      sugar_g: row.sugar_g as number | undefined,
      fat_g: row.fat_g as number | undefined,
      sat_fat_g: row.sat_fat_g as number | undefined,
      fiber_g: row.fiber_g as number | undefined,
      salt_g: row.salt_g as number | undefined,
    },
    grams,
  );
}

export type PrepScalingMeta = {
  content_amount: number | null;
  ingredient_qty_is_per_recipe_batch: boolean;
  recipe_output_amount: number | null;
  recipe_output_unit: string | null;
};

/** Batch-output in gram (receptregels gelden voor deze hoeveelheid afgewerkt product). */
function recipeOutputToGrams(amount: number | null | undefined, unit: string | null | undefined): number | null {
  if (amount == null || !(Number(amount) > 0)) return null;
  const n = Number(amount);
  const u = (unit ?? "g").trim().toLowerCase();
  if (u === "kg") return n * 1000;
  if (u === "g") return n;
  if (u === "l") return n * 1000;
  if (u === "ml") return n;
  return null;
}

/**
 * Noemer voor: grammen grondstof in portie = quantity_per_unit × prep_portie_g / noemer.
 * - Batch-prep: noemer = recipe_output (g), niet de GN content_amount (zie migratie 058).
 * - Anders: noemer = content_amount (één tel-eenheid).
 */
function scalingDenominator(meta: PrepScalingMeta | undefined): number {
  if (!meta) return 0;
  if (meta.ingredient_qty_is_per_recipe_batch) {
    const ro = recipeOutputToGrams(meta.recipe_output_amount, meta.recipe_output_unit);
    // Keep parity with SQL engine: for batch recipes, only a valid recipe_output
    // unit is accepted as denominator. Do not silently fall back to content_amount.
    if (ro != null && ro > 0) return ro;
    return 0;
  }
  if (meta.content_amount != null && Number(meta.content_amount) > 0) {
    return Number(meta.content_amount);
  }
  return 0;
}

function prepCacheHasCoreMacros(row: Record<string, unknown> | undefined): boolean {
  if (!row || row.kcal_per_100g == null || row.protein_per_100g == null) return false;
  return true;
}

function prepRowIsLabLocked(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  const sourceType = String(row.source_type ?? "").toLowerCase();
  const isLocked = Boolean(row.is_locked);
  return sourceType === "lab" || isLocked;
}

/** Per volledige portie — uit menu_item_nutrition (Excel gerechten-sheet). */
function declaredRowToTotals(row: Record<string, unknown>): NutritionTotals {
  const num = (k: string) => {
    const v = row[k];
    if (v == null) return 0;
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    kcal: num("kcal"),
    protein_g: num("protein_g"),
    carbs_g: num("carbs_g"),
    sugar_g: num("sugar_g"),
    fat_g: num("fat_g"),
    sat_fat_g: num("sat_fat_g"),
    fiber_g: num("fiber_g"),
    salt_g: num("salt_g"),
  };
}

function addPrepNutritionFromRecipe(
  target: NutritionTotals,
  prepPortionGrams: number,
  meta: PrepScalingMeta | undefined,
  recipeLines: { raw_ingredient_id: string; quantity_per_unit: number }[] | undefined,
  rawNut: Map<string, Record<string, unknown>>,
): { contributed: boolean; missingSomeRawNutrition: boolean } {
  const denom = scalingDenominator(meta);
  if (!recipeLines?.length || denom <= 0 || prepPortionGrams <= 0) {
    return { contributed: false, missingSomeRawNutrition: false };
  }
  let contributed = false;
  let missingSomeRawNutrition = false;
  for (const line of recipeLines) {
    const rawG = (line.quantity_per_unit * prepPortionGrams) / denom;
    if (rawG <= 0) continue;
    const row = rawNut.get(line.raw_ingredient_id);
    if (!row || row.kcal_per_100g == null) {
      missingSomeRawNutrition = true;
      continue;
    }
    addRawPer100(target, row, rawG);
    contributed = true;
  }
  return { contributed, missingSomeRawNutrition };
}

export type MenuComponentRow = {
  id: string;
  quantity_grams: number;
  option_group: string | null;
  is_optional: boolean | null;
  default_selected: boolean | null;
  display_order: number;
  prep_item_id: string | null;
  raw_ingredient_id: string | null;
  bowl_base_option_id: string | null;
};

/**
 * Voeding: vaste componenten + één gekozen bowl-base (standaard of eerste).
 * Allergenen: unie over alle componenten (incl. alle base-varianten) + recepten.
 */
export type MenuNutritionResult = {
  nutrition: NutritionTotals;
  nutritionIncomplete: boolean;
  allergens: AllergenLabel[];
  notes: string[];
  componentNutrition: { componentId: string; nutrition: NutritionTotals; nutritionIncomplete: boolean }[];
  /** Source marker for UI transparency. */
  nutritionSource: "computed" | "computed_with_lab" | "declared_override" | "calculated";
  /** Bijv. mima_excel_gerechten */
  declaredSource?: string;
};

export async function computeMenuNutritionAndAllergens(
  supabase: SupabaseClient,
  menuItemId: string,
  selectedBaseOptionId?: string | null,
): Promise<MenuNutritionResult> {
  const notes: string[] = [];
  let nutritionIncomplete = false;

  // Computed DB view is base-agnostic (default base). For interactive bowl base selection
  // we must use runtime component calculation path below.
  const useComputedView = !selectedBaseOptionId;
  const { data: computedNut, error: computedErr } = useComputedView
    ? await supabase
        .from("computed_menu_item_nutrition")
        .select("*")
        .eq("menu_item_id", menuItemId)
        .maybeSingle()
    : { data: null, error: null };

  const { data: declaredNut, error: declaredErr } = await supabase
    .from("menu_item_nutrition")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .maybeSingle();

  const { data: comps, error: ce } = await supabase
    .from("menu_item_components")
    .select(
      "id, quantity_grams, option_group, is_optional, default_selected, display_order, prep_item_id, raw_ingredient_id, bowl_base_option_id",
    )
    .eq("menu_item_id", menuItemId)
    .order("display_order", { ascending: true });

  if (ce) throw ce;
  const components = (comps ?? []) as MenuComponentRow[];

  const baseRows = components.filter((c) => c.option_group === "base" && c.bowl_base_option_id);
  const chosenBase =
    (selectedBaseOptionId
      ? baseRows.find((c) => c.bowl_base_option_id === selectedBaseOptionId)
      : null) ??
    baseRows.find((c) => c.default_selected === true) ??
    [...baseRows].sort((a, b) => a.display_order - b.display_order)[0] ??
    null;

  const nutritionRows: MenuComponentRow[] = [
    ...components.filter((c) => !(c.option_group === "base" && c.bowl_base_option_id)),
    ...(chosenBase ? [chosenBase] : []),
  ];

  const rawNut = new Map<string, Record<string, unknown>>();
  const prepNut = new Map<string, Record<string, unknown>>();
  const rawAllergens = new Map<string, Set<string>>();
  const prepRecipeLines = new Map<string, { raw_ingredient_id: string; quantity_per_unit: number }[]>();
  const prepMetaById = new Map<string, PrepScalingMeta>();

  const rawIds = new Set<string>();
  const prepIds = new Set<string>();
  const bowlOptionIds = new Set<string>();

  for (const c of components) {
    if (c.raw_ingredient_id) rawIds.add(c.raw_ingredient_id);
    if (c.prep_item_id) prepIds.add(c.prep_item_id);
    if (c.bowl_base_option_id) bowlOptionIds.add(c.bowl_base_option_id);
  }

  const bowlByOption = new Map<string, { prep_item_id: string; quantity_grams: number }[]>();
  if (bowlOptionIds.size > 0) {
    const { data: bowlLines, error: be } = await supabase
      .from("bowl_base_components")
      .select("base_option_id, prep_item_id, quantity_grams")
      .in("base_option_id", [...bowlOptionIds]);
    if (be) throw be;
    for (const line of bowlLines ?? []) {
      const l = line as { base_option_id: string; prep_item_id: string; quantity_grams: number };
      if (!bowlByOption.has(l.base_option_id)) bowlByOption.set(l.base_option_id, []);
      bowlByOption.get(l.base_option_id)!.push({
        prep_item_id: l.prep_item_id,
        quantity_grams: Number(l.quantity_grams),
      });
      prepIds.add(l.prep_item_id);
    }
  }

  if (prepIds.size > 0) {
    const { data: pmeta, error: pme } = await supabase
      .from("prep_items")
      .select("id, content_amount, ingredient_qty_is_per_recipe_batch, recipe_output_amount, recipe_output_unit")
      .in("id", [...prepIds]);
    if (pme) throw pme;
    for (const row of pmeta ?? []) {
      const r = row as PrepScalingMeta & { id: string };
      prepMetaById.set(r.id, {
        content_amount: r.content_amount,
        ingredient_qty_is_per_recipe_batch: Boolean(r.ingredient_qty_is_per_recipe_batch),
        recipe_output_amount: r.recipe_output_amount,
        recipe_output_unit: r.recipe_output_unit,
      });
    }

    const { data: pis, error: pie } = await supabase
      .from("prep_item_ingredients")
      .select("prep_item_id, raw_ingredient_id, quantity_per_unit")
      .in("prep_item_id", [...prepIds]);
    if (pie) throw pie;
    for (const row of pis ?? []) {
      const r = row as {
        prep_item_id: string;
        raw_ingredient_id: string;
        quantity_per_unit: number;
      };
      if (!prepRecipeLines.has(r.prep_item_id)) prepRecipeLines.set(r.prep_item_id, []);
      prepRecipeLines.get(r.prep_item_id)!.push({
        raw_ingredient_id: r.raw_ingredient_id,
        quantity_per_unit: Number(r.quantity_per_unit),
      });
      rawIds.add(r.raw_ingredient_id);
    }
  }

  if (rawIds.size > 0) {
    const { data: rn, error: re } = await supabase
      .from("ingredient_nutritional_values")
      .select("*")
      .in("raw_ingredient_id", [...rawIds]);
    if (re) throw re;
    for (const r of rn ?? []) {
      const row = r as Record<string, unknown>;
      rawNut.set(row.raw_ingredient_id as string, row);
    }
  }

  if (prepIds.size > 0) {
    const { data: pn, error: pe } = await supabase
      .from("prep_item_nutritional_values")
      .select("*")
      .in("prep_item_id", [...prepIds]);
    if (pe) throw pe;
    for (const r of pn ?? []) {
      const row = r as Record<string, unknown>;
      prepNut.set(row.prep_item_id as string, row);
    }
  }

  if (rawIds.size > 0) {
    const { data: ra, error: rae } = await supabase
      .from("raw_ingredient_allergens")
      .select("raw_ingredient_id, allergen_id")
      .in("raw_ingredient_id", [...rawIds]);
    if (!rae) {
      for (const row of ra ?? []) {
        const r = row as { raw_ingredient_id: string; allergen_id: string };
        if (!rawAllergens.has(r.raw_ingredient_id)) rawAllergens.set(r.raw_ingredient_id, new Set());
        rawAllergens.get(r.raw_ingredient_id)!.add(r.allergen_id);
      }
    } else {
      notes.push("Allergens not loaded (migration 075 / table missing).");
    }
  }

  const allergenById = new Map<string, AllergenLabel>();
  const { data: types, error: te } = await supabase
    .from("allergen_types")
    .select("id, code, label_nl, sort_order")
    .order("sort_order", { ascending: true });
  if (!te) {
    for (const t of types ?? []) {
      const x = t as AllergenLabel;
      allergenById.set(x.id, x);
    }
  }

  const allergenIds = new Set<string>();

  function addAllergensForRaw(rid: string) {
    const set = rawAllergens.get(rid);
    if (!set) return;
    for (const aid of set) allergenIds.add(aid);
  }

  function addAllergensForPrep(pid: string) {
    const lines = prepRecipeLines.get(pid);
    if (!lines?.length) return;
    for (const { raw_ingredient_id } of lines) addAllergensForRaw(raw_ingredient_id);
  }

  for (const c of components) {
    if (c.raw_ingredient_id) addAllergensForRaw(c.raw_ingredient_id);
    if (c.prep_item_id && !c.bowl_base_option_id) addAllergensForPrep(c.prep_item_id);
    if (c.bowl_base_option_id) {
      const lines = bowlByOption.get(c.bowl_base_option_id) ?? [];
      for (const line of lines) addAllergensForPrep(line.prep_item_id);
    }
  }

  const buildAllergensList = (): AllergenLabel[] =>
    [...allergenIds]
      .map((id) => allergenById.get(id))
      .filter((x): x is AllergenLabel => x != null)
      .sort((a, b) => a.sort_order - b.sort_order);

  const hasInteractiveBaseSelection = Boolean(selectedBaseOptionId);
  if (!declaredErr && declaredNut && declaredNut.kcal != null) {
    // Declared override is static per dish and does not vary by selected bowl base.
    // When an interactive base is selected, prefer the runtime/base-specific path.
    if (
      !hasInteractiveBaseSelection &&
      (declaredNut as { use_declared_override?: boolean }).use_declared_override === true
    ) {
      return {
        nutrition: declaredRowToTotals(declaredNut as Record<string, unknown>),
        nutritionIncomplete: false,
        allergens: buildAllergensList(),
        notes,
        componentNutrition: [],
        nutritionSource: "declared_override",
        declaredSource: (declaredNut as { source?: string }).source ?? undefined,
      };
    }
  }

  if (!computedErr && computedNut) {
    const row = computedNut as Record<string, unknown>;
    const nutrition: NutritionTotals = {
      kcal: Number(row.kcal ?? 0),
      protein_g: Number(row.protein_g ?? 0),
      carbs_g: Number(row.carbs_g ?? 0),
      sugar_g: Number(row.sugar_g ?? 0),
      fat_g: Number(row.fat_g ?? 0),
      sat_fat_g: Number(row.sat_fat_g ?? 0),
      fiber_g: Number(row.fiber_g ?? 0),
      salt_g: Number(row.salt_g ?? 0),
    };
    const missingInputs = Boolean(row.missing_inputs);
    if (missingInputs) notes.push("Computed nutrition has missing ingredient inputs.");
    return {
      nutrition,
      nutritionIncomplete: missingInputs,
      allergens: buildAllergensList(),
      notes,
      componentNutrition: [],
      nutritionSource: Boolean(row.has_lab_inputs) ? "computed_with_lab" : "computed",
    };
  }

  const nutrition: NutritionTotals = { ...ZERO };
  const componentNutrition: { componentId: string; nutrition: NutritionTotals; nutritionIncomplete: boolean }[] = [];

  const cloneTotals = (x: NutritionTotals): NutritionTotals => ({ ...x });
  const diffTotals = (after: NutritionTotals, before: NutritionTotals): NutritionTotals => ({
    kcal: after.kcal - before.kcal,
    protein_g: after.protein_g - before.protein_g,
    carbs_g: after.carbs_g - before.carbs_g,
    sugar_g: after.sugar_g - before.sugar_g,
    fat_g: after.fat_g - before.fat_g,
    sat_fat_g: after.sat_fat_g - before.sat_fat_g,
    fiber_g: after.fiber_g - before.fiber_g,
    salt_g: after.salt_g - before.salt_g,
  });

  function addPrepOrRecipe(prepId: string, portionGrams: number): boolean {
    const meta = prepMetaById.get(prepId);
    const row = prepNut.get(prepId);
    const lines = prepRecipeLines.get(prepId);

    // Explicit lab/locked prep overrides win over decomposition.
    if (prepRowIsLabLocked(row) && prepCacheHasCoreMacros(row)) {
      addPrepPer100(nutrition, row, portionGrams);
      return false;
    }

    // Keep runtime behavior aligned with SQL/debug queries:
    // prefer recipe decomposition whenever recipe lines exist.
    if (lines && lines.length > 0) {
      const res = addPrepNutritionFromRecipe(nutrition, portionGrams, meta, lines, rawNut);
      if (res.contributed) {
        if (res.missingSomeRawNutrition) nutritionIncomplete = true;
        return res.missingSomeRawNutrition;
      }
      // Recipe exists but cannot be scaled (e.g. missing/invalid denominator):
      // do not silently switch to cached prep values, because that diverges from
      // recipe-based SQL diagnostics and can massively overstate totals.
      nutritionIncomplete = true;
      return true;
    }

    if (prepCacheHasCoreMacros(row)) {
      addPrepPer100(nutrition, row, portionGrams);
      return false;
    }

    if (lines && lines.length > 0) {
      const res = addPrepNutritionFromRecipe(nutrition, portionGrams, meta, lines, rawNut);
      if (!res.contributed) nutritionIncomplete = true;
      else if (res.missingSomeRawNutrition) nutritionIncomplete = true;
      return;
    }

    if (row && row.kcal_per_100g != null) {
      addPrepPer100(nutrition, row, portionGrams);
      nutritionIncomplete = true;
      return true;
    }

    nutritionIncomplete = true;
    return true;
  }

  for (const c of nutritionRows) {
    const before = cloneTotals(nutrition);
    let rowIncomplete = false;
    const g = Number(c.quantity_grams);
    if (c.raw_ingredient_id) {
      const row = rawNut.get(c.raw_ingredient_id);
      if (!row || row.kcal_per_100g == null) {
        nutritionIncomplete = true;
        rowIncomplete = true;
      }
      addRawPer100(nutrition, row, g);
      componentNutrition.push({
        componentId: c.id,
        nutrition: diffTotals(nutrition, before),
        nutritionIncomplete: rowIncomplete,
      });
      continue;
    }
    if (c.bowl_base_option_id) {
      const lines = bowlByOption.get(c.bowl_base_option_id) ?? [];
      if (lines.length === 0) {
        notes.push("No bowl_base_components found for this base option.");
        nutritionIncomplete = true;
        rowIncomplete = true;
      } else {
        for (const line of lines) {
          if (addPrepOrRecipe(line.prep_item_id, line.quantity_grams)) rowIncomplete = true;
        }
      }
      componentNutrition.push({
        componentId: c.id,
        nutrition: diffTotals(nutrition, before),
        nutritionIncomplete: rowIncomplete,
      });
      continue;
    }
    if (c.prep_item_id) {
      if (addPrepOrRecipe(c.prep_item_id, g)) rowIncomplete = true;
      componentNutrition.push({
        componentId: c.id,
        nutrition: diffTotals(nutrition, before),
        nutritionIncomplete: rowIncomplete,
      });
    }
  }

  return {
    nutrition,
    nutritionIncomplete,
    allergens: buildAllergensList(),
    notes,
    componentNutrition,
    nutritionSource: "calculated",
  };
}

export function formatNutritionLine(n: NutritionTotals): string[] {
  const r = (x: number) => (Math.round(x * 10) / 10).toLocaleString("nl-NL");
  return [
    `Energy ${r(n.kcal)} kcal`,
    `Protein ${r(n.protein_g)} g`,
    `Carbohydrates ${r(n.carbs_g)} g (of which sugars ${r(n.sugar_g)} g)`,
    `Fat ${r(n.fat_g)} g (of which saturated ${r(n.sat_fat_g)} g)`,
    `Fiber ${r(n.fiber_g)} g`,
    `Salt ${r(n.salt_g)} g`,
  ];
}
