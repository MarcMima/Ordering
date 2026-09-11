-- 226 — Model audit 11-09-2026: calculation core on global recipes
-- * one recipe line per ingredient (canonical copy first), for nutrition AND cost (N-01, C-04)
-- * nutrition resolves by ingredient name (values live on the canonical copy)
-- * packaging / non_food never counts as a nutrition input (N-02)
-- * sub-preps resolve recursively; cost_only lines count in cost, not in nutrition (S-02)
-- * bowls: every base variant is visible; the single-row figure is the base-mix-weighted
--   average (base_mix from Butlaroo), equal weights when no mix is known (D-06)
-- * a menu item without components is reported as missing (never as "complete") (N-04)

-- 1. nutrition per ingredient name ------------------------------------------------------
CREATE OR REPLACE VIEW ingredient_nutrition_by_name AS
SELECT DISTINCT ON (lower(btrim(ri.name)))
  lower(btrim(ri.name)) AS ingredient_key,
  n.raw_ingredient_id, n.kcal_per_100g, n.protein_g, n.carbs_g, n.sugar_g, n.fat_g, n.sat_fat_g,
  n.fiber_g, n.salt_g, n.source, n.source_type, n.source_priority, n.measured_at, n.verified_by, n.is_locked
FROM ingredient_nutritional_values n
JOIN raw_ingredients ri ON ri.id = n.raw_ingredient_id
LEFT JOIN locations l ON l.id = ri.location_id
ORDER BY lower(btrim(ri.name)), n.is_locked DESC, n.source_priority DESC, COALESCE(l.is_canonical,false) DESC, n.updated_at DESC;

-- 2. current price per ingredient name (canonical copy first) --------------------------
CREATE OR REPLACE VIEW ingredient_current_price_by_name AS
SELECT DISTINCT ON (lower(btrim(ri.name)))
  lower(btrim(ri.name)) AS ingredient_key, p.raw_ingredient_id, p.price_cents_per_gram, p.effective_date, p.supplier_name
FROM ingredient_current_prices p
JOIN raw_ingredients ri ON ri.id = p.raw_ingredient_id
LEFT JOIN locations l ON l.id = ri.location_id
WHERE p.price_cents_per_gram IS NOT NULL
ORDER BY lower(btrim(ri.name)), COALESCE(l.is_canonical,false) DESC, p.effective_date DESC;

-- 3. canonical recipe lines --------------------------------------------------------------
CREATE OR REPLACE VIEW prep_recipe_lines_canonical AS
SELECT DISTINCT ON (pii.prep_item_id, COALESCE(lower(btrim(ri.name)), 'sub:' || pii.sub_prep_item_id::text))
  pii.id, pii.prep_item_id, pii.raw_ingredient_id, pii.sub_prep_item_id, pii.quantity_per_unit, pii.cost_only,
  lower(btrim(ri.name)) AS ingredient_key, ri.name AS ingredient_name, ri.item_kind
FROM prep_item_ingredients pii
LEFT JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
LEFT JOIN locations l ON l.id = ri.location_id
ORDER BY pii.prep_item_id, COALESCE(lower(btrim(ri.name)), 'sub:' || pii.sub_prep_item_id::text),
         COALESCE(l.is_canonical,false) DESC, pii.created_at;

-- 4. denominator (grams of finished prep the recipe lines refer to) ----------------------
CREATE OR REPLACE FUNCTION fn_prep_denominator_grams(p prep_items)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p.ingredient_qty_is_per_recipe_batch,false) THEN
      CASE lower(COALESCE(p.recipe_output_unit,'g'))
        WHEN 'kg' THEN COALESCE(p.recipe_output_amount,0)*1000
        WHEN 'g'  THEN COALESCE(p.recipe_output_amount,0)
        WHEN 'l'  THEN COALESCE(p.recipe_output_amount,0)*1000
        WHEN 'ml' THEN COALESCE(p.recipe_output_amount,0)
        ELSE 0 END
    ELSE COALESCE(p.content_amount,0) END;
$$;

-- 5. nutrition per 100 g of a prep (recursive over sub-preps) ---------------------------
DROP FUNCTION IF EXISTS fn_prep_nutrition_per_100g(uuid, int);
CREATE OR REPLACE FUNCTION fn_prep_nutrition_per_100g(p_prep_item_id uuid, p_depth int DEFAULT 0)
RETURNS TABLE(kcal numeric, protein numeric, carbs numeric, sugar numeric, fat numeric, sat_fat numeric,
              fiber numeric, salt numeric, has_lab boolean, missing boolean)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  pi prep_items%ROWTYPE; ov prep_item_nutritional_values%ROWTYPE; r record; nv record; sub record;
  den numeric; f numeric; n_lines int := 0;
  a_kcal numeric := 0; a_pro numeric := 0; a_carb numeric := 0; a_sug numeric := 0; a_fat numeric := 0;
  a_sat numeric := 0; a_fib numeric := 0; a_salt numeric := 0; v_lab boolean := false; v_missing boolean := false;
BEGIN
  IF p_depth > 6 THEN
    RETURN QUERY SELECT 0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,false,true; RETURN;
  END IF;
  SELECT * INTO pi FROM prep_items WHERE id = p_prep_item_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,false,true; RETURN;
  END IF;
  -- lab / locked override wins over the recipe
  SELECT * INTO ov FROM prep_item_nutritional_values
   WHERE prep_item_id = p_prep_item_id AND (source_type = 'lab' OR COALESCE(is_locked,false))
   ORDER BY is_locked DESC, source_priority DESC LIMIT 1;
  IF FOUND AND ov.kcal_per_100g IS NOT NULL THEN
    RETURN QUERY SELECT round(ov.kcal_per_100g,3), round(COALESCE(ov.protein_per_100g,0),3), round(COALESCE(ov.carbs_per_100g,0),3),
      round(COALESCE(ov.sugar_per_100g,0),3), round(COALESCE(ov.fat_per_100g,0),3), round(COALESCE(ov.sat_fat_per_100g,0),3),
      round(COALESCE(ov.fiber_per_100g,0),3), round(COALESCE(ov.salt_per_100g,0),3),
      (ov.source_type = 'lab'),
      (ov.protein_per_100g IS NULL OR ov.carbs_per_100g IS NULL OR ov.fat_per_100g IS NULL);
    RETURN;
  END IF;
  den := fn_prep_denominator_grams(pi);
  FOR r IN SELECT * FROM prep_recipe_lines_canonical WHERE prep_item_id = p_prep_item_id LOOP
    n_lines := n_lines + 1;
    IF r.cost_only THEN CONTINUE; END IF;
    IF den IS NULL OR den <= 0 THEN v_missing := true; CONTINUE; END IF;
    f := r.quantity_per_unit / den;               -- share of this line per gram of prep
    IF r.sub_prep_item_id IS NOT NULL THEN
      SELECT * INTO sub FROM fn_prep_nutrition_per_100g(r.sub_prep_item_id, p_depth + 1);
      a_kcal := a_kcal + f*sub.kcal; a_pro := a_pro + f*sub.protein; a_carb := a_carb + f*sub.carbs; a_sug := a_sug + f*sub.sugar;
      a_fat := a_fat + f*sub.fat; a_sat := a_sat + f*sub.sat_fat; a_fib := a_fib + f*sub.fiber; a_salt := a_salt + f*sub.salt;
      v_lab := v_lab OR sub.has_lab; v_missing := v_missing OR sub.missing;
    ELSIF r.item_kind = 'non_food' THEN
      CONTINUE;                                    -- packaging is not eaten
    ELSE
      SELECT * INTO nv FROM ingredient_nutrition_by_name WHERE ingredient_key = r.ingredient_key;
      IF NOT FOUND OR nv.kcal_per_100g IS NULL THEN
        v_missing := true;
      ELSE
        a_kcal := a_kcal + f*nv.kcal_per_100g; a_pro := a_pro + f*COALESCE(nv.protein_g,0); a_carb := a_carb + f*COALESCE(nv.carbs_g,0);
        a_sug := a_sug + f*COALESCE(nv.sugar_g,0); a_fat := a_fat + f*COALESCE(nv.fat_g,0); a_sat := a_sat + f*COALESCE(nv.sat_fat_g,0);
        a_fib := a_fib + f*COALESCE(nv.fiber_g,0); a_salt := a_salt + f*COALESCE(nv.salt_g,0);
        v_lab := v_lab OR (nv.source_type = 'lab');
      END IF;
    END IF;
  END LOOP;
  IF n_lines = 0 THEN v_missing := true; END IF;
  RETURN QUERY SELECT round(a_kcal,3), round(a_pro,3), round(a_carb,3), round(a_sug,3), round(a_fat,3), round(a_sat,3),
                      round(a_fib,3), round(a_salt,3), v_lab, v_missing;
END $$;

CREATE OR REPLACE VIEW computed_prep_item_nutrition AS
SELECT pi.id AS prep_item_id, pi.name AS prep_item_name,
       f.kcal AS kcal_per_100g, f.protein AS protein_per_100g, f.carbs AS carbs_per_100g, f.sugar AS sugar_per_100g,
       f.fat AS fat_per_100g, f.sat_fat AS sat_fat_per_100g, f.fiber AS fiber_per_100g, f.salt AS salt_per_100g,
       f.has_lab AS has_lab_inputs, f.missing AS missing_nutrition_inputs
FROM prep_items pi CROSS JOIN LATERAL fn_prep_nutrition_per_100g(pi.id, 0) f;

-- 6. bowl base weights from the Butlaroo base mix --------------------------------------
CREATE OR REPLACE VIEW bowl_base_weights AS
WITH item_bases AS (
  SELECT DISTINCT mic.menu_item_id, mic.bowl_base_option_id, bo.name AS base_name
  FROM menu_item_components mic JOIN bowl_base_options bo ON bo.id = mic.bowl_base_option_id
  WHERE mic.option_group = 'base' AND mic.bowl_base_option_id IS NOT NULL AND COALESCE(bo.active,true)
), mix AS (
  SELECT base_combination, sum(bowls)::numeric AS bowls
  FROM base_mix WHERE period_end IS NULL GROUP BY base_combination
), joined AS (
  SELECT ib.menu_item_id, ib.bowl_base_option_id, ib.base_name, m.bowls
  FROM item_bases ib LEFT JOIN mix m ON m.base_combination = ib.base_name
), totals AS (
  SELECT menu_item_id, sum(bowls) AS total_bowls, count(*) AS n_bases, count(bowls) AS n_with_mix
  FROM joined GROUP BY menu_item_id
)
SELECT j.menu_item_id, j.bowl_base_option_id, j.base_name, j.bowls,
       CASE WHEN t.n_with_mix > 0 AND t.total_bowls > 0 THEN COALESCE(j.bowls,0)/t.total_bowls
            ELSE 1.0/t.n_bases END AS weight,
       CASE WHEN t.n_with_mix > 0 AND t.total_bowls > 0 THEN 'weighted' ELSE 'equal' END AS basis
FROM joined j JOIN totals t ON t.menu_item_id = j.menu_item_id;

-- 7. menu nutrition: non-base part, per-variant, and weighted single row -----------------
CREATE OR REPLACE VIEW computed_menu_item_nutrition_nonbase AS
WITH comp AS (
  SELECT mic.menu_item_id, mic.prep_item_id, mic.raw_ingredient_id, mic.quantity_grams,
         ri.item_kind, lower(btrim(ri.name)) AS ingredient_key
  FROM menu_item_components mic LEFT JOIN raw_ingredients ri ON ri.id = mic.raw_ingredient_id
  WHERE mic.option_group IS DISTINCT FROM 'base'
), lines AS (
  SELECT c.menu_item_id,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.kcal
              WHEN c.item_kind = 'non_food' THEN 0 ELSE c.quantity_grams/100.0*nv.kcal_per_100g END AS kcal,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.protein WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.protein_g,0) END AS protein_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.carbs   WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.carbs_g,0) END AS carbs_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.sugar   WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.sugar_g,0) END AS sugar_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.fat     WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.fat_g,0) END AS fat_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.sat_fat WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.sat_fat_g,0) END AS sat_fat_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.fiber   WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.fiber_g,0) END AS fiber_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN c.quantity_grams/100.0*f.salt    WHEN c.item_kind='non_food' THEN 0 ELSE c.quantity_grams/100.0*COALESCE(nv.salt_g,0) END AS salt_g,
         CASE WHEN c.prep_item_id IS NOT NULL THEN f.has_lab ELSE (nv.source_type = 'lab') END AS has_lab,
         CASE WHEN c.prep_item_id IS NOT NULL THEN f.missing
              WHEN c.item_kind = 'non_food' THEN false
              ELSE (nv.kcal_per_100g IS NULL) END AS missing,
         (c.item_kind IS DISTINCT FROM 'non_food') AS is_food
  FROM comp c
  LEFT JOIN LATERAL fn_prep_nutrition_per_100g(c.prep_item_id, 0) f ON c.prep_item_id IS NOT NULL
  LEFT JOIN ingredient_nutrition_by_name nv ON c.raw_ingredient_id IS NOT NULL AND nv.ingredient_key = c.ingredient_key
)
SELECT menu_item_id,
       COALESCE(sum(kcal),0) AS kcal, COALESCE(sum(protein_g),0) AS protein_g, COALESCE(sum(carbs_g),0) AS carbs_g,
       COALESCE(sum(sugar_g),0) AS sugar_g, COALESCE(sum(fat_g),0) AS fat_g, COALESCE(sum(sat_fat_g),0) AS sat_fat_g,
       COALESCE(sum(fiber_g),0) AS fiber_g, COALESCE(sum(salt_g),0) AS salt_g,
       bool_or(COALESCE(has_lab,false)) AS has_lab_inputs, bool_or(COALESCE(missing,false)) AS missing_inputs,
       count(*) FILTER (WHERE is_food) AS n_food_components
FROM lines GROUP BY menu_item_id;

CREATE OR REPLACE VIEW computed_menu_item_base_variant_nutrition AS
WITH base_lines AS (
  SELECT w.menu_item_id, w.bowl_base_option_id, w.base_name, w.weight, w.basis,
         bbc.quantity_grams, f.*
  FROM bowl_base_weights w
  JOIN bowl_base_components bbc ON bbc.base_option_id = w.bowl_base_option_id
  CROSS JOIN LATERAL fn_prep_nutrition_per_100g(bbc.prep_item_id, 0) f
), base_tot AS (
  SELECT menu_item_id, bowl_base_option_id, base_name, max(weight) AS weight, max(basis) AS basis,
         sum(quantity_grams/100.0*kcal) AS kcal, sum(quantity_grams/100.0*protein) AS protein_g, sum(quantity_grams/100.0*carbs) AS carbs_g,
         sum(quantity_grams/100.0*sugar) AS sugar_g, sum(quantity_grams/100.0*fat) AS fat_g, sum(quantity_grams/100.0*sat_fat) AS sat_fat_g,
         sum(quantity_grams/100.0*fiber) AS fiber_g, sum(quantity_grams/100.0*salt) AS salt_g,
         bool_or(has_lab) AS has_lab, bool_or(missing) AS missing
  FROM base_lines GROUP BY menu_item_id, bowl_base_option_id, base_name
)
SELECT mi.id AS menu_item_id, mi.name AS menu_item_name, b.bowl_base_option_id, b.base_name, round(b.weight,4) AS base_weight, b.basis AS base_basis,
       round(nb.kcal + b.kcal,3) AS kcal, round(nb.protein_g + b.protein_g,3) AS protein_g, round(nb.carbs_g + b.carbs_g,3) AS carbs_g,
       round(nb.sugar_g + b.sugar_g,3) AS sugar_g, round(nb.fat_g + b.fat_g,3) AS fat_g, round(nb.sat_fat_g + b.sat_fat_g,3) AS sat_fat_g,
       round(nb.fiber_g + b.fiber_g,3) AS fiber_g, round(nb.salt_g + b.salt_g,3) AS salt_g,
       (nb.has_lab_inputs OR b.has_lab) AS has_lab_inputs, (nb.missing_inputs OR b.missing) AS missing_inputs
FROM base_tot b JOIN menu_items mi ON mi.id = b.menu_item_id
LEFT JOIN computed_menu_item_nutrition_nonbase nb ON nb.menu_item_id = b.menu_item_id;

CREATE OR REPLACE VIEW computed_menu_item_nutrition AS
WITH base_w AS (
  SELECT menu_item_id, sum(base_weight*kcal) AS kcal, sum(base_weight*protein_g) AS protein_g, sum(base_weight*carbs_g) AS carbs_g,
         sum(base_weight*sugar_g) AS sugar_g, sum(base_weight*fat_g) AS fat_g, sum(base_weight*sat_fat_g) AS sat_fat_g,
         sum(base_weight*fiber_g) AS fiber_g, sum(base_weight*salt_g) AS salt_g,
         bool_or(has_lab_inputs) AS has_lab, bool_or(missing_inputs) AS missing, max(base_basis) AS basis, count(*) AS n_variants
  FROM computed_menu_item_base_variant_nutrition GROUP BY menu_item_id
)
SELECT mi.id AS menu_item_id,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.kcal ELSE COALESCE(nb.kcal,0) END,3) AS kcal,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.protein_g ELSE COALESCE(nb.protein_g,0) END,3) AS protein_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.carbs_g ELSE COALESCE(nb.carbs_g,0) END,3) AS carbs_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.sugar_g ELSE COALESCE(nb.sugar_g,0) END,3) AS sugar_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.fat_g ELSE COALESCE(nb.fat_g,0) END,3) AS fat_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.sat_fat_g ELSE COALESCE(nb.sat_fat_g,0) END,3) AS sat_fat_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.fiber_g ELSE COALESCE(nb.fiber_g,0) END,3) AS fiber_g,
       round(CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.salt_g ELSE COALESCE(nb.salt_g,0) END,3) AS salt_g,
       COALESCE(bw.has_lab, nb.has_lab_inputs, false) AS has_lab_inputs,
       CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.missing
            WHEN nb.menu_item_id IS NULL OR COALESCE(nb.n_food_components,0) = 0 THEN true
            ELSE nb.missing_inputs END AS missing_inputs,
       CASE WHEN bw.menu_item_id IS NOT NULL THEN bw.basis ELSE 'none' END AS base_basis,
       COALESCE(bw.n_variants,0)::int AS n_base_variants,
       COALESCE(nb.n_food_components,0)::int AS n_food_components
FROM menu_items mi
LEFT JOIN computed_menu_item_nutrition_nonbase nb ON nb.menu_item_id = mi.id
LEFT JOIN base_w bw ON bw.menu_item_id = mi.id;

-- 8. cost per gram of a prep (recursive; cost_only lines included) ---------------------
DROP FUNCTION IF EXISTS fn_prep_cost_per_gram(uuid, int);
CREATE OR REPLACE FUNCTION fn_prep_cost_per_gram(p_prep_item_id uuid, p_depth int DEFAULT 0)
RETURNS TABLE(cents_per_gram numeric, missing_price boolean, n_lines int)
LANGUAGE plpgsql STABLE AS $$
DECLARE pi prep_items%ROWTYPE; r record; v_ppg numeric; sub record; den numeric; total numeric := 0; v_missing boolean := false; n int := 0;
BEGIN
  IF p_depth > 6 THEN RETURN QUERY SELECT NULL::numeric, true, 0; RETURN; END IF;
  SELECT * INTO pi FROM prep_items WHERE id = p_prep_item_id;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::numeric, true, 0; RETURN; END IF;
  den := fn_prep_denominator_grams(pi);
  FOR r IN SELECT * FROM prep_recipe_lines_canonical WHERE prep_item_id = p_prep_item_id LOOP
    n := n + 1;
    IF r.sub_prep_item_id IS NOT NULL THEN
      SELECT * INTO sub FROM fn_prep_cost_per_gram(r.sub_prep_item_id, p_depth + 1);
      IF sub.cents_per_gram IS NULL THEN v_missing := true; ELSE total := total + r.quantity_per_unit * sub.cents_per_gram; END IF;
      v_missing := v_missing OR sub.missing_price;
    ELSE
      SELECT p.price_cents_per_gram INTO v_ppg FROM ingredient_current_prices p WHERE p.raw_ingredient_id = r.raw_ingredient_id AND p.price_cents_per_gram IS NOT NULL
        ORDER BY p.effective_date DESC LIMIT 1;
      IF v_ppg IS NULL THEN
        SELECT price_cents_per_gram INTO v_ppg FROM ingredient_current_price_by_name WHERE ingredient_key = r.ingredient_key;
      END IF;
      IF v_ppg IS NULL THEN v_missing := true; ELSE total := total + r.quantity_per_unit * v_ppg; END IF;
    END IF;
  END LOOP;
  IF n = 0 OR den IS NULL OR den <= 0 THEN RETURN QUERY SELECT NULL::numeric, true, n; RETURN; END IF;
  RETURN QUERY SELECT round(total/den, 6), v_missing, n;
END $$;

-- 9. menu cost lines (same signature as before; base options weighted by base mix) -------
CREATE OR REPLACE FUNCTION public.calculate_menu_item_cost(p_menu_item_id uuid)
RETURNS TABLE(menu_item_id uuid, component_name text, ingredient_name text, quantity_grams numeric,
              price_cents_per_gram numeric, line_cost_cents numeric, has_price boolean)
LANGUAGE sql STABLE AS $$
  WITH comps AS (
    SELECT mic.menu_item_id, mic.prep_item_id, mic.raw_ingredient_id, mic.quantity_grams::numeric AS quantity_grams, 1.0::numeric AS weight, NULL::text AS base_name
    FROM menu_item_components mic
    WHERE mic.menu_item_id = p_menu_item_id AND mic.option_group IS DISTINCT FROM 'base'
    UNION ALL
    SELECT w.menu_item_id, bbc.prep_item_id, NULL::uuid, bbc.quantity_grams::numeric, w.weight, w.base_name
    FROM bowl_base_weights w JOIN bowl_base_components bbc ON bbc.base_option_id = w.bowl_base_option_id
    WHERE w.menu_item_id = p_menu_item_id
  ),
  direct_raw AS (
    SELECT c.menu_item_id, 'direct: ' || ri.name AS component_name, ri.name AS ingredient_name,
           c.quantity_grams, cp.price_cents_per_gram,
           round(c.quantity_grams * cp.price_cents_per_gram, 3) AS line_cost_cents,
           (cp.price_cents_per_gram IS NOT NULL) AS has_price
    FROM comps c
    JOIN raw_ingredients ri ON ri.id = c.raw_ingredient_id
    LEFT JOIN LATERAL (
      SELECT p.price_cents_per_gram FROM ingredient_current_prices p
      WHERE p.raw_ingredient_id = ri.id AND p.price_cents_per_gram IS NOT NULL ORDER BY p.effective_date DESC LIMIT 1
    ) pc ON true
    LEFT JOIN ingredient_current_price_by_name pn ON pn.ingredient_key = lower(btrim(ri.name))
    CROSS JOIN LATERAL (SELECT COALESCE(pc.price_cents_per_gram, pn.price_cents_per_gram) AS price_cents_per_gram) cp
    WHERE c.raw_ingredient_id IS NOT NULL
  ),
  prep_lines AS (
    SELECT c.menu_item_id,
           CASE WHEN c.base_name IS NULL THEN 'prep: ' || pi.name ELSE 'base ' || c.base_name || ' (' || round(c.weight*100,1) || '%): ' || pi.name END AS component_name,
           pi.name AS ingredient_name,
           round(c.quantity_grams * c.weight, 4) AS quantity_grams,
           f.cents_per_gram AS price_cents_per_gram,
           CASE WHEN f.cents_per_gram IS NULL THEN NULL ELSE round(c.quantity_grams * c.weight * f.cents_per_gram, 3) END AS line_cost_cents,
           (f.cents_per_gram IS NOT NULL AND NOT f.missing_price) AS has_price
    FROM comps c
    JOIN prep_items pi ON pi.id = c.prep_item_id
    CROSS JOIN LATERAL fn_prep_cost_per_gram(pi.id, 0) f
    WHERE c.prep_item_id IS NOT NULL
  ),
  none AS (
    SELECT p_menu_item_id AS menu_item_id, 'NO COMPONENTS'::text, NULL::text, NULL::numeric, NULL::numeric, NULL::numeric, false
    WHERE NOT EXISTS (SELECT 1 FROM comps)
  )
  SELECT * FROM direct_raw
  UNION ALL SELECT * FROM prep_lines
  UNION ALL SELECT * FROM none
$$;
