-- Ensure computed nutrition uses prep-level lab/locked overrides first.

CREATE OR REPLACE VIEW computed_prep_item_nutrition AS
WITH prep_base AS (
  SELECT
    pi.id AS prep_item_id,
    pi.name AS prep_item_name,
    coalesce(pi.content_amount, 0) AS content_amount,
    coalesce(pi.ingredient_qty_is_per_recipe_batch, false) AS ingredient_qty_is_per_recipe_batch,
    pi.recipe_output_amount,
    lower(coalesce(pi.recipe_output_unit, 'g')) AS recipe_output_unit,
    ppn.kcal_per_100g AS override_kcal_per_100g,
    ppn.protein_per_100g AS override_protein_per_100g,
    ppn.carbs_per_100g AS override_carbs_per_100g,
    ppn.sugar_per_100g AS override_sugar_per_100g,
    ppn.fat_per_100g AS override_fat_per_100g,
    ppn.sat_fat_per_100g AS override_sat_fat_per_100g,
    ppn.fiber_per_100g AS override_fiber_per_100g,
    ppn.salt_per_100g AS override_salt_per_100g,
    coalesce(ppn.source_type, '') AS override_source_type,
    coalesce(ppn.is_locked, false) AS override_is_locked
  FROM prep_items pi
  LEFT JOIN prep_item_nutritional_values ppn
    ON ppn.prep_item_id = pi.id
),
prep_lines AS (
  SELECT
    pb.prep_item_id,
    pb.prep_item_name,
    pb.content_amount,
    pb.ingredient_qty_is_per_recipe_batch,
    pb.recipe_output_amount,
    pb.recipe_output_unit,
    pb.override_kcal_per_100g,
    pb.override_protein_per_100g,
    pb.override_carbs_per_100g,
    pb.override_sugar_per_100g,
    pb.override_fat_per_100g,
    pb.override_sat_fat_per_100g,
    pb.override_fiber_per_100g,
    pb.override_salt_per_100g,
    pb.override_source_type,
    pb.override_is_locked,
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
    (inv.source_type = 'lab') AS raw_is_lab
  FROM prep_base pb
  LEFT JOIN prep_item_ingredients pii ON pii.prep_item_id = pb.prep_item_id
  LEFT JOIN ingredient_nutritional_values inv ON inv.raw_ingredient_id = pii.raw_ingredient_id
),
normalized AS (
  SELECT
    prep_item_id,
    prep_item_name,
    override_kcal_per_100g,
    override_protein_per_100g,
    override_carbs_per_100g,
    override_sugar_per_100g,
    override_fat_per_100g,
    override_sat_fat_per_100g,
    override_fiber_per_100g,
    override_salt_per_100g,
    override_source_type,
    override_is_locked,
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
    raw_is_lab
  FROM prep_lines
),
recipe_calc AS (
  SELECT
    prep_item_id,
    prep_item_name,
    bool_or(raw_is_lab) AS recipe_has_lab_inputs,
    bool_or(kcal_per_100g IS NULL) AS recipe_missing_inputs,
    SUM(CASE WHEN denominator_grams > 0 AND kcal_per_100g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * kcal_per_100g ELSE 0 END) AS kcal_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND protein_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * protein_g ELSE 0 END) AS protein_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND carbs_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * carbs_g ELSE 0 END) AS carbs_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND sugar_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * sugar_g ELSE 0 END) AS sugar_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND fat_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * fat_g ELSE 0 END) AS fat_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND sat_fat_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * sat_fat_g ELSE 0 END) AS sat_fat_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND fiber_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * fiber_g ELSE 0 END) AS fiber_per_100g,
    SUM(CASE WHEN denominator_grams > 0 AND salt_g IS NOT NULL THEN (quantity_per_unit / denominator_grams) * salt_g ELSE 0 END) AS salt_per_100g,
    MAX(override_kcal_per_100g) AS override_kcal_per_100g,
    MAX(override_protein_per_100g) AS override_protein_per_100g,
    MAX(override_carbs_per_100g) AS override_carbs_per_100g,
    MAX(override_sugar_per_100g) AS override_sugar_per_100g,
    MAX(override_fat_per_100g) AS override_fat_per_100g,
    MAX(override_sat_fat_per_100g) AS override_sat_fat_per_100g,
    MAX(override_fiber_per_100g) AS override_fiber_per_100g,
    MAX(override_salt_per_100g) AS override_salt_per_100g,
    bool_or(override_source_type = 'lab') AS override_is_lab,
    bool_or(override_is_locked) AS override_is_locked
  FROM normalized
  GROUP BY prep_item_id, prep_item_name
)
SELECT
  prep_item_id,
  prep_item_name,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_kcal_per_100g END,
      kcal_per_100g
    )::numeric, 3
  ) AS kcal_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_protein_per_100g END,
      protein_per_100g
    )::numeric, 3
  ) AS protein_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_carbs_per_100g END,
      carbs_per_100g
    )::numeric, 3
  ) AS carbs_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_sugar_per_100g END,
      sugar_per_100g
    )::numeric, 3
  ) AS sugar_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_fat_per_100g END,
      fat_per_100g
    )::numeric, 3
  ) AS fat_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_sat_fat_per_100g END,
      sat_fat_per_100g
    )::numeric, 3
  ) AS sat_fat_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_fiber_per_100g END,
      fiber_per_100g
    )::numeric, 3
  ) AS fiber_per_100g,
  ROUND(
    COALESCE(
      CASE WHEN override_is_lab OR override_is_locked THEN override_salt_per_100g END,
      salt_per_100g
    )::numeric, 3
  ) AS salt_per_100g,
  (override_is_lab OR recipe_has_lab_inputs) AS has_lab_inputs,
  (
    CASE
      WHEN override_is_lab OR override_is_locked
        THEN (
          override_kcal_per_100g IS NULL
          OR override_protein_per_100g IS NULL
          OR override_carbs_per_100g IS NULL
          OR override_fat_per_100g IS NULL
        )
      ELSE recipe_missing_inputs
    END
  ) AS missing_nutrition_inputs
FROM recipe_calc;
