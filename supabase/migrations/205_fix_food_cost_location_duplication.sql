-- 205: Fix — kostprijsberekening telde receptregels per locatie dubbel
--
-- Oorzaak: raw_ingredients bestaat per locatie; prep_item_ingredients heeft daardoor
-- per prep-item één regel per locatie-variant van hetzelfde ingrediënt.
-- calculate_menu_item_cost (090) joinde ze allemaal, waardoor elke prep-regel
-- N-locaties keer meetelde zodra er prijzen bestaan (zichtbaar geworden door
-- de prijsimport in 203: kostprijzen ×4).
--
-- Fix: in prep_raw één regel per (prep_item, ingredientnaam) — zelfde recept,
-- zelfde hoeveelheden, dus dedupliceren op lower(btrim(naam)) is veilig.
-- Signature en outputkolommen ongewijzigd; computed_menu_item_food_cost blijft werken.
--
-- NB: computed_prep_item_nutrition (090) heeft hetzelfde joinpatroon; voedingswaarden
-- per portie delen door batchgrootte zodat het daar (per 100 g) meestal uitmiddelt —
-- apart beoordelen, niet in deze migratie.
--
-- Daarnaast: auditview prep_scaling_issues voor kapotte denominators
-- (bv. content_amount = 1 g → kostprijs ×1000). Data wordt NIET automatisch
-- aangepast (handmatige config; spec §7).

-- zelfde signature en outputkolommen als 090, dus REPLACE zonder DROP
-- (computed_menu_item_food_cost hangt aan deze functie)
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
  -- FIX: één receptregel per (prep_item, ingredientnaam) i.p.v. één per locatie-variant
  prep_lines AS (
    SELECT DISTINCT ON (pii.prep_item_id, lower(btrim(ri.name)))
      pii.prep_item_id,
      pii.quantity_per_unit,
      ri.id AS raw_ingredient_id,
      ri.name AS ingredient_name
    FROM prep_item_ingredients pii
    JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
    ORDER BY pii.prep_item_id, lower(btrim(ri.name)), pii.created_at
  ),
  prep_raw AS (
    SELECT
      sc.menu_item_id,
      pi.name AS prep_name,
      pl.ingredient_name,
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
      pl.quantity_per_unit,
      sc.quantity_grams::NUMERIC AS prep_portion_grams,
      cp.price_cents_per_gram
    FROM selected_components sc
    JOIN prep_items pi ON pi.id = sc.prep_item_id
    JOIN prep_lines pl ON pl.prep_item_id = pi.id
    LEFT JOIN current_prices cp ON cp.raw_ingredient_id = pl.raw_ingredient_id
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

-- de afhankelijke views opnieuw aanmaken (090) zodat ze de nieuwe functie gebruiken
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

-- Auditview: prep-items waarvan de schaal-denominator ontbreekt of verdacht klein is
-- (dan explodeert de kostprijs, bv. Marinated chicken met content_amount = 1)
CREATE OR REPLACE VIEW prep_scaling_issues AS
WITH prep_lines AS (
  SELECT DISTINCT ON (pii.prep_item_id, lower(btrim(ri.name)))
    pii.prep_item_id, pii.quantity_per_unit
  FROM prep_item_ingredients pii
  JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
  ORDER BY pii.prep_item_id, lower(btrim(ri.name)), pii.created_at
),
agg AS (
  SELECT
    pi.id, pi.name,
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
    SUM(pl.quantity_per_unit) AS sum_line_qty,
    COUNT(pl.*) AS n_lines
  FROM prep_items pi
  JOIN prep_lines pl ON pl.prep_item_id = pi.id
  GROUP BY pi.id, pi.name, pi.ingredient_qty_is_per_recipe_batch,
           pi.recipe_output_unit, pi.recipe_output_amount, pi.content_amount
)
SELECT
  id AS prep_item_id, name, denominator_grams, sum_line_qty, n_lines,
  CASE
    WHEN denominator_grams <= 0 THEN 'denominator ontbreekt (kost telt als 0)'
    WHEN denominator_grams < 0.05 * sum_line_qty THEN 'denominator verdacht klein t.o.v. receptregels (kost explodeert)'
  END AS issue
FROM agg
WHERE denominator_grams <= 0 OR denominator_grams < 0.05 * sum_line_qty;

COMMENT ON VIEW prep_scaling_issues IS
  'Prep-items waarvan de schaal-denominator (content_amount of recipe_output) ontbreekt of niet past bij de receptregels. Handmatig corrigeren in prep_items; deze view past niets aan.';
