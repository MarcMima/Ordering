-- Computed-first nutrition + hardened food-cost engine.
-- Keeps declared menu nutrition as optional explicit override only.

-- 1) Source priority metadata for ingredient nutrition.
ALTER TABLE ingredient_nutritional_values
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'excel'
    CHECK (source_type IN ('lab', 'supplier_spec', 'nevo', 'excel', 'manual')),
  ADD COLUMN IF NOT EXISTS source_priority INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS measured_at DATE,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.nutrition_priority_for_source(p_source_type TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_source_type, 'excel'))
    WHEN 'lab' THEN 100
    WHEN 'supplier_spec' THEN 80
    WHEN 'nevo' THEN 60
    WHEN 'manual' THEN 40
    ELSE 10
  END;
$$;

-- Guard updates so lower-priority imports cannot overwrite higher-priority/locked rows.
CREATE OR REPLACE FUNCTION public.protect_nutrition_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source_priority IS NULL OR NEW.source_priority = 0 THEN
      NEW.source_priority := public.nutrition_priority_for_source(NEW.source_type);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.source_priority IS NULL OR NEW.source_priority = 0 THEN
    NEW.source_priority := public.nutrition_priority_for_source(NEW.source_type);
  END IF;

  IF OLD.is_locked AND NOT NEW.is_locked THEN
    NEW.is_locked := true;
  END IF;

  IF OLD.is_locked AND NOT public.has_permission('settings.manage') THEN
    NEW.kcal_per_100g := OLD.kcal_per_100g;
    NEW.protein_g := OLD.protein_g;
    NEW.carbs_g := OLD.carbs_g;
    NEW.sugar_g := OLD.sugar_g;
    NEW.fat_g := OLD.fat_g;
    NEW.sat_fat_g := OLD.sat_fat_g;
    NEW.fiber_g := OLD.fiber_g;
    NEW.salt_g := OLD.salt_g;
    NEW.source := OLD.source;
    NEW.source_type := OLD.source_type;
    NEW.source_priority := OLD.source_priority;
    NEW.measured_at := OLD.measured_at;
    NEW.verified_by := OLD.verified_by;
    NEW.is_locked := OLD.is_locked;
    RETURN NEW;
  END IF;

  IF OLD.source_priority > NEW.source_priority THEN
    NEW.kcal_per_100g := OLD.kcal_per_100g;
    NEW.protein_g := OLD.protein_g;
    NEW.carbs_g := OLD.carbs_g;
    NEW.sugar_g := OLD.sugar_g;
    NEW.fat_g := OLD.fat_g;
    NEW.sat_fat_g := OLD.sat_fat_g;
    NEW.fiber_g := OLD.fiber_g;
    NEW.salt_g := OLD.salt_g;
    NEW.source := OLD.source;
    NEW.source_type := OLD.source_type;
    NEW.source_priority := OLD.source_priority;
    NEW.measured_at := OLD.measured_at;
    NEW.verified_by := OLD.verified_by;
    NEW.is_locked := OLD.is_locked;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_nutrition_priority ON ingredient_nutritional_values;
CREATE TRIGGER trg_protect_nutrition_priority
BEFORE INSERT OR UPDATE ON ingredient_nutritional_values
FOR EACH ROW
EXECUTE FUNCTION public.protect_nutrition_priority();

-- Optional explicit declared override flag.
ALTER TABLE menu_item_nutrition
  ADD COLUMN IF NOT EXISTS use_declared_override BOOLEAN NOT NULL DEFAULT false;

-- 2) Seed known lab-measured nutrition (highest priority, locked).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ri.id AS raw_ingredient_id, ri.name
    FROM raw_ingredients ri
    WHERE lower(btrim(ri.name)) IN (
      'grilled chicken',
      'baked falafel',
      'fried cauliflower',
      'flatbread chips',
      'fried aubergine'
    )
  LOOP
    INSERT INTO ingredient_nutritional_values (
      raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g,
      source, source_type, source_priority, measured_at, verified_by, is_locked
    ) VALUES (
      r.raw_ingredient_id,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'lab_measured_placeholder',
      'lab',
      100,
      CURRENT_DATE,
      'lab',
      true
    )
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      source_type = 'lab',
      source_priority = 100,
      is_locked = true,
      measured_at = COALESCE(ingredient_nutritional_values.measured_at, EXCLUDED.measured_at),
      verified_by = COALESCE(ingredient_nutritional_values.verified_by, EXCLUDED.verified_by),
      updated_at = NOW();
  END LOOP;
END $$;

-- 3) Sanity-check views.
CREATE OR REPLACE VIEW ingredient_nutrition_quality_issues AS
WITH base AS (
  SELECT
    ri.id AS raw_ingredient_id,
    ri.name AS ingredient_name,
    inv.kcal_per_100g,
    inv.protein_g,
    inv.carbs_g,
    inv.fat_g,
    inv.sugar_g,
    inv.sat_fat_g,
    inv.fiber_g,
    inv.salt_g,
    inv.source,
    inv.source_type,
    inv.source_priority,
    inv.is_locked
  FROM raw_ingredients ri
  LEFT JOIN ingredient_nutritional_values inv
    ON inv.raw_ingredient_id = ri.id
)
SELECT
  raw_ingredient_id,
  ingredient_name,
  'missing_core'::TEXT AS issue_code,
  'high'::TEXT AS severity,
  'Missing kcal/protein/carbs/fat per 100g.'::TEXT AS message
FROM base
WHERE kcal_per_100g IS NULL
   OR protein_g IS NULL
   OR carbs_g IS NULL
   OR fat_g IS NULL

UNION ALL

SELECT
  raw_ingredient_id,
  ingredient_name,
  'kcal_range'::TEXT,
  'high'::TEXT,
  'kcal_per_100g is outside realistic range (0..950).'::TEXT
FROM base
WHERE kcal_per_100g IS NOT NULL
  AND (kcal_per_100g < 0 OR kcal_per_100g > 950)

UNION ALL

SELECT
  raw_ingredient_id,
  ingredient_name,
  'macro_energy_mismatch'::TEXT,
  CASE
    WHEN abs(kcal_per_100g - (4 * coalesce(protein_g, 0) + 4 * coalesce(carbs_g, 0) + 9 * coalesce(fat_g, 0))) > 120 THEN 'high'
    ELSE 'medium'
  END::TEXT,
  'Energy from macros differs strongly from kcal_per_100g.'::TEXT
FROM base
WHERE kcal_per_100g IS NOT NULL
  AND protein_g IS NOT NULL
  AND carbs_g IS NOT NULL
  AND fat_g IS NOT NULL
  AND abs(kcal_per_100g - (4 * protein_g + 4 * carbs_g + 9 * fat_g)) > 60

UNION ALL

SELECT
  raw_ingredient_id,
  ingredient_name,
  'invalid_component_relations'::TEXT,
  'medium'::TEXT,
  'sugar/sat_fat exceed parent macro or macro negative.'::TEXT
FROM base
WHERE (sugar_g IS NOT NULL AND carbs_g IS NOT NULL AND sugar_g > carbs_g + 0.01)
   OR (sat_fat_g IS NOT NULL AND fat_g IS NOT NULL AND sat_fat_g > fat_g + 0.01)
   OR (protein_g IS NOT NULL AND protein_g < 0)
   OR (carbs_g IS NOT NULL AND carbs_g < 0)
   OR (fat_g IS NOT NULL AND fat_g < 0)
   OR (salt_g IS NOT NULL AND salt_g < 0);

COMMENT ON VIEW ingredient_nutrition_quality_issues IS
  'Sanity checks for ingredient nutrition quality (missing core values, range checks, macro-energy consistency).';

-- 4) Computed nutrition (prep and menu) views.
CREATE OR REPLACE VIEW computed_prep_item_nutrition AS
WITH prep_lines AS (
  SELECT
    pi.id AS prep_item_id,
    pi.name AS prep_item_name,
    coalesce(pi.content_amount, 0) AS content_amount,
    coalesce(pi.ingredient_qty_is_per_recipe_batch, false) AS ingredient_qty_is_per_recipe_batch,
    pi.recipe_output_amount,
    lower(coalesce(pi.recipe_output_unit, 'g')) AS recipe_output_unit,
    pii.raw_ingredient_id,
    pii.quantity_per_unit,
    inv.kcal_per_100g,
    inv.protein_g,
    inv.carbs_g,
    inv.sugar_g,
    inv.fat_g,
    inv.sat_fat_g,
    inv.fiber_g,
    inv.salt_g,
    (inv.source_type = 'lab') AS is_lab
  FROM prep_items pi
  JOIN prep_item_ingredients pii ON pii.prep_item_id = pi.id
  LEFT JOIN ingredient_nutritional_values inv ON inv.raw_ingredient_id = pii.raw_ingredient_id
),
normalized AS (
  SELECT
    prep_item_id,
    prep_item_name,
    raw_ingredient_id,
    quantity_per_unit,
    CASE
      WHEN ingredient_qty_is_per_recipe_batch THEN
        CASE
          WHEN recipe_output_unit = 'kg' THEN coalesce(recipe_output_amount, 0) * 1000
          WHEN recipe_output_unit = 'g' THEN coalesce(recipe_output_amount, 0)
          WHEN recipe_output_unit = 'l' THEN coalesce(recipe_output_amount, 0) * 1000
          WHEN recipe_output_unit = 'ml' THEN coalesce(recipe_output_amount, 0)
          ELSE 0
        END
      ELSE coalesce(content_amount, 0)
    END AS denominator_grams,
    kcal_per_100g,
    protein_g,
    carbs_g,
    sugar_g,
    fat_g,
    sat_fat_g,
    fiber_g,
    salt_g,
    is_lab
  FROM prep_lines
),
calc AS (
  SELECT
    prep_item_id,
    prep_item_name,
    bool_or(is_lab) AS has_lab_inputs,
    bool_or(kcal_per_100g IS NULL) AS missing_nutrition_inputs,
    SUM(CASE WHEN denominator_grams > 0 AND kcal_per_100g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * kcal_per_100g ELSE 0 END) AS kcal_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND protein_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * protein_g ELSE 0 END) AS protein_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND carbs_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * carbs_g ELSE 0 END) AS carbs_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND sugar_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * sugar_g ELSE 0 END) AS sugar_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND fat_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * fat_g ELSE 0 END) AS fat_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND sat_fat_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * sat_fat_g ELSE 0 END) AS sat_fat_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND fiber_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * fiber_g ELSE 0 END) AS fiber_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND salt_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * salt_g ELSE 0 END) AS salt_per_100g
  FROM normalized
  GROUP BY prep_item_id, prep_item_name
)
SELECT
  prep_item_id,
  prep_item_name,
  ROUND(kcal_per_100g::numeric, 3) AS kcal_per_100g,
  ROUND(protein_per_100g::numeric, 3) AS protein_per_100g,
  ROUND(carbs_per_100g::numeric, 3) AS carbs_per_100g,
  ROUND(sugar_per_100g::numeric, 3) AS sugar_per_100g,
  ROUND(fat_per_100g::numeric, 3) AS fat_per_100g,
  ROUND(sat_fat_per_100g::numeric, 3) AS sat_fat_per_100g,
  ROUND(fiber_per_100g::numeric, 3) AS fiber_per_100g,
  ROUND(salt_per_100g::numeric, 3) AS salt_per_100g,
  has_lab_inputs,
  missing_nutrition_inputs
FROM calc;

COMMENT ON VIEW computed_prep_item_nutrition IS
  'Computed prep nutrition per 100g from recipe lines + ingredient nutrition (lab sources propagate via has_lab_inputs).';

CREATE OR REPLACE VIEW computed_menu_item_nutrition AS
WITH base_components AS (
  SELECT
    mic.menu_item_id,
    mic.prep_item_id,
    mic.raw_ingredient_id,
    mic.bowl_base_option_id,
    mic.quantity_grams,
    mic.option_group,
    mic.default_selected,
    mic.display_order
  FROM menu_item_components mic
  WHERE mic.option_group IS DISTINCT FROM 'base'
),
chosen_base AS (
  SELECT DISTINCT ON (menu_item_id)
    menu_item_id,
    bowl_base_option_id
  FROM menu_item_components
  WHERE option_group = 'base'
    AND bowl_base_option_id IS NOT NULL
  ORDER BY menu_item_id, COALESCE(default_selected, false) DESC, display_order ASC
),
selected_base_lines AS (
  SELECT
    cb.menu_item_id,
    bbc.prep_item_id,
    bbc.quantity_grams
  FROM chosen_base cb
  JOIN bowl_base_components bbc ON bbc.base_option_id = cb.bowl_base_option_id
),
menu_prep_lines AS (
  SELECT menu_item_id, prep_item_id, quantity_grams
  FROM base_components
  WHERE prep_item_id IS NOT NULL
  UNION ALL
  SELECT menu_item_id, prep_item_id, quantity_grams
  FROM selected_base_lines
),
menu_raw_direct AS (
  SELECT menu_item_id, raw_ingredient_id, quantity_grams
  FROM base_components
  WHERE raw_ingredient_id IS NOT NULL
),
prep_contrib AS (
  SELECT
    mpl.menu_item_id,
    SUM((mpl.quantity_grams / 100.0) * cpn.kcal_per_100g) AS kcal,
    SUM((mpl.quantity_grams / 100.0) * cpn.protein_per_100g) AS protein_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.carbs_per_100g) AS carbs_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.sugar_per_100g) AS sugar_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.fat_per_100g) AS fat_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.sat_fat_per_100g) AS sat_fat_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.fiber_per_100g) AS fiber_g,
    SUM((mpl.quantity_grams / 100.0) * cpn.salt_per_100g) AS salt_g,
    bool_or(cpn.has_lab_inputs) AS has_lab_inputs,
    bool_or(cpn.missing_nutrition_inputs) AS missing_inputs
  FROM menu_prep_lines mpl
  LEFT JOIN computed_prep_item_nutrition cpn ON cpn.prep_item_id = mpl.prep_item_id
  GROUP BY mpl.menu_item_id
),
raw_contrib AS (
  SELECT
    mrd.menu_item_id,
    SUM((mrd.quantity_grams / 100.0) * inv.kcal_per_100g) AS kcal,
    SUM((mrd.quantity_grams / 100.0) * inv.protein_g) AS protein_g,
    SUM((mrd.quantity_grams / 100.0) * inv.carbs_g) AS carbs_g,
    SUM((mrd.quantity_grams / 100.0) * inv.sugar_g) AS sugar_g,
    SUM((mrd.quantity_grams / 100.0) * inv.fat_g) AS fat_g,
    SUM((mrd.quantity_grams / 100.0) * inv.sat_fat_g) AS sat_fat_g,
    SUM((mrd.quantity_grams / 100.0) * inv.fiber_g) AS fiber_g,
    SUM((mrd.quantity_grams / 100.0) * inv.salt_g) AS salt_g,
    bool_or(inv.source_type = 'lab') AS has_lab_inputs,
    bool_or(inv.kcal_per_100g IS NULL) AS missing_inputs
  FROM menu_raw_direct mrd
  LEFT JOIN ingredient_nutritional_values inv ON inv.raw_ingredient_id = mrd.raw_ingredient_id
  GROUP BY mrd.menu_item_id
)
SELECT
  mi.id AS menu_item_id,
  ROUND((COALESCE(pc.kcal, 0) + COALESCE(rc.kcal, 0))::numeric, 3) AS kcal,
  ROUND((COALESCE(pc.protein_g, 0) + COALESCE(rc.protein_g, 0))::numeric, 3) AS protein_g,
  ROUND((COALESCE(pc.carbs_g, 0) + COALESCE(rc.carbs_g, 0))::numeric, 3) AS carbs_g,
  ROUND((COALESCE(pc.sugar_g, 0) + COALESCE(rc.sugar_g, 0))::numeric, 3) AS sugar_g,
  ROUND((COALESCE(pc.fat_g, 0) + COALESCE(rc.fat_g, 0))::numeric, 3) AS fat_g,
  ROUND((COALESCE(pc.sat_fat_g, 0) + COALESCE(rc.sat_fat_g, 0))::numeric, 3) AS sat_fat_g,
  ROUND((COALESCE(pc.fiber_g, 0) + COALESCE(rc.fiber_g, 0))::numeric, 3) AS fiber_g,
  ROUND((COALESCE(pc.salt_g, 0) + COALESCE(rc.salt_g, 0))::numeric, 3) AS salt_g,
  (COALESCE(pc.has_lab_inputs, false) OR COALESCE(rc.has_lab_inputs, false)) AS has_lab_inputs,
  (COALESCE(pc.missing_inputs, false) OR COALESCE(rc.missing_inputs, false)) AS missing_inputs
FROM menu_items mi
LEFT JOIN prep_contrib pc ON pc.menu_item_id = mi.id
LEFT JOIN raw_contrib rc ON rc.menu_item_id = mi.id;

COMMENT ON VIEW computed_menu_item_nutrition IS
  'Computed menu nutrition per full portion (direct raws + prep components + chosen bowl base option).';

-- 5) Declared vs computed discrepancy.
CREATE OR REPLACE VIEW menu_item_nutrition_discrepancy AS
SELECT
  mi.id AS menu_item_id,
  mi.name AS menu_item_name,
  cmn.kcal AS computed_kcal,
  minu.kcal AS declared_kcal,
  CASE
    WHEN minu.kcal IS NULL OR cmn.kcal IS NULL OR minu.kcal = 0 THEN NULL
    ELSE ROUND(((cmn.kcal - minu.kcal) / minu.kcal) * 100.0, 2)
  END AS kcal_diff_pct,
  cmn.has_lab_inputs,
  cmn.missing_inputs,
  minu.source AS declared_source,
  minu.use_declared_override
FROM menu_items mi
LEFT JOIN computed_menu_item_nutrition cmn ON cmn.menu_item_id = mi.id
LEFT JOIN menu_item_nutrition minu ON minu.menu_item_id = mi.id;

COMMENT ON VIEW menu_item_nutrition_discrepancy IS
  'Compare declared menu nutrition versus computed nutrition and expose deviation percentages.';

-- 6) Food-cost hardening (includes bowl-base + recipe-output denominator handling).
DROP FUNCTION IF EXISTS calculate_menu_item_cost(UUID);

CREATE OR REPLACE FUNCTION calculate_menu_item_cost(p_menu_item_id UUID)
RETURNS TABLE (
  menu_item_id UUID,
  component_name TEXT,
  ingredient_name TEXT,
  quantity_grams NUMERIC,
  price_cents_per_gram NUMERIC,
  line_cost_cents NUMERIC,
  has_price BOOLEAN
) LANGUAGE sql STABLE AS $$
  WITH chosen_base AS (
    SELECT DISTINCT ON (mic.menu_item_id)
      mic.menu_item_id,
      mic.bowl_base_option_id
    FROM menu_item_components mic
    WHERE mic.menu_item_id = p_menu_item_id
      AND mic.option_group = 'base'
      AND mic.bowl_base_option_id IS NOT NULL
    ORDER BY mic.menu_item_id, COALESCE(mic.default_selected, false) DESC, mic.display_order ASC
  ),
  selected_components AS (
    SELECT
      mic.menu_item_id,
      mic.prep_item_id,
      mic.raw_ingredient_id,
      mic.quantity_grams,
      NULL::UUID AS bowl_base_option_id
    FROM menu_item_components mic
    WHERE mic.menu_item_id = p_menu_item_id
      AND mic.option_group IS DISTINCT FROM 'base'

    UNION ALL

    SELECT
      cb.menu_item_id,
      bbc.prep_item_id,
      NULL::UUID AS raw_ingredient_id,
      bbc.quantity_grams,
      cb.bowl_base_option_id
    FROM chosen_base cb
    JOIN bowl_base_components bbc ON bbc.base_option_id = cb.bowl_base_option_id
  ),
  current_prices AS (
    SELECT DISTINCT ON (raw_ingredient_id)
      raw_ingredient_id,
      price_cents_per_gram
    FROM ingredient_current_prices
    ORDER BY raw_ingredient_id, effective_date DESC
  ),
  direct_raw AS (
    SELECT
      sc.menu_item_id,
      'direct: ' || ri.name AS component_name,
      ri.name AS ingredient_name,
      sc.quantity_grams::NUMERIC AS quantity_grams,
      cp.price_cents_per_gram,
      ROUND(sc.quantity_grams::NUMERIC * cp.price_cents_per_gram, 3) AS line_cost_cents,
      (cp.price_cents_per_gram IS NOT NULL) AS has_price
    FROM selected_components sc
    JOIN raw_ingredients ri ON ri.id = sc.raw_ingredient_id
    LEFT JOIN current_prices cp ON cp.raw_ingredient_id = ri.id
    WHERE sc.raw_ingredient_id IS NOT NULL
  ),
  prep_raw AS (
    SELECT
      sc.menu_item_id,
      pi.name AS prep_name,
      ri.name AS ingredient_name,
      CASE
        WHEN COALESCE(pi.ingredient_qty_is_per_recipe_batch, false) THEN
          CASE
            WHEN lower(coalesce(pi.recipe_output_unit, 'g')) = 'kg' THEN coalesce(pi.recipe_output_amount, 0) * 1000
            WHEN lower(coalesce(pi.recipe_output_unit, 'g')) = 'g' THEN coalesce(pi.recipe_output_amount, 0)
            WHEN lower(coalesce(pi.recipe_output_unit, 'g')) = 'l' THEN coalesce(pi.recipe_output_amount, 0) * 1000
            WHEN lower(coalesce(pi.recipe_output_unit, 'g')) = 'ml' THEN coalesce(pi.recipe_output_amount, 0)
            ELSE 0
          END
        ELSE coalesce(pi.content_amount, 0)
      END AS denominator_grams,
      pii.quantity_per_unit,
      sc.quantity_grams::NUMERIC AS prep_portion_grams,
      cp.price_cents_per_gram
    FROM selected_components sc
    JOIN prep_items pi ON pi.id = sc.prep_item_id
    JOIN prep_item_ingredients pii ON pii.prep_item_id = pi.id
    JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
    LEFT JOIN current_prices cp ON cp.raw_ingredient_id = ri.id
    WHERE sc.prep_item_id IS NOT NULL
  )
  SELECT
    dr.menu_item_id,
    dr.component_name,
    dr.ingredient_name,
    dr.quantity_grams,
    dr.price_cents_per_gram,
    dr.line_cost_cents,
    dr.has_price
  FROM direct_raw dr

  UNION ALL

  SELECT
    pr.menu_item_id,
    'prep: ' || pr.prep_name AS component_name,
    pr.ingredient_name,
    CASE
      WHEN pr.denominator_grams > 0 THEN ROUND((pr.quantity_per_unit * pr.prep_portion_grams) / pr.denominator_grams, 4)
      ELSE NULL
    END AS quantity_grams,
    pr.price_cents_per_gram,
    CASE
      WHEN pr.denominator_grams > 0 AND pr.price_cents_per_gram IS NOT NULL
      THEN ROUND((pr.quantity_per_unit * pr.prep_portion_grams) / pr.denominator_grams * pr.price_cents_per_gram, 3)
      ELSE NULL
    END AS line_cost_cents,
    (pr.denominator_grams > 0 AND pr.price_cents_per_gram IS NOT NULL) AS has_price
  FROM prep_raw pr
$$;

CREATE OR REPLACE VIEW computed_menu_item_food_cost AS
SELECT
  mi.id AS menu_item_id,
  mi.name AS menu_item_name,
  mi.price_cents,
  ROUND(SUM(COALESCE(c.line_cost_cents, 0))::numeric, 3) AS computed_cost_cents,
  CASE
    WHEN mi.price_cents IS NULL OR mi.price_cents = 0 THEN NULL
    ELSE ROUND((SUM(COALESCE(c.line_cost_cents, 0)) / mi.price_cents::numeric) * 100.0, 2)
  END AS food_cost_pct,
  SUM(CASE WHEN c.has_price THEN 0 ELSE 1 END) AS missing_price_lines
FROM menu_items mi
LEFT JOIN LATERAL calculate_menu_item_cost(mi.id) c ON true
GROUP BY mi.id, mi.name, mi.price_cents;

COMMENT ON VIEW computed_menu_item_food_cost IS
  'Computed menu item cost from latest ingredient prices (includes prep decomposition and selected bowl-base option).';

CREATE OR REPLACE VIEW food_cost_quality_issues AS
SELECT
  ri.id AS raw_ingredient_id,
  ri.name AS ingredient_name,
  'missing_current_price'::TEXT AS issue_code,
  'high'::TEXT AS severity,
  'No current price row found for this ingredient.'::TEXT AS message
FROM raw_ingredients ri
LEFT JOIN ingredient_current_prices icp ON icp.raw_ingredient_id = ri.id
WHERE icp.raw_ingredient_id IS NULL

UNION ALL

SELECT
  icp.raw_ingredient_id,
  icp.ingredient_name,
  'stale_price'::TEXT,
  'medium'::TEXT,
  'Latest price is older than 45 days.'::TEXT
FROM ingredient_current_prices icp
WHERE icp.effective_date < CURRENT_DATE - INTERVAL '45 days'

UNION ALL

SELECT DISTINCT
  ri.id AS raw_ingredient_id,
  ri.name AS ingredient_name,
  'missing_supplier_mapping'::TEXT AS issue_code,
  'medium'::TEXT AS severity,
  'Ingredient has no supplier_ingredients mapping.'::TEXT AS message
FROM raw_ingredients ri
LEFT JOIN supplier_ingredients si ON si.raw_ingredient_id = ri.id
WHERE si.id IS NULL;

COMMENT ON VIEW food_cost_quality_issues IS
  'Quality checks for food-cost completeness: missing prices, stale prices, missing supplier mappings.';
