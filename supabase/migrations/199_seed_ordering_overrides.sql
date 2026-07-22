-- Seed ordering-override kolommen vanuit de huidige hardcoded waarden in de code.
-- Idempotent: enkel UPDATE WHERE kolom IS NULL, zodat handmatig gezette waarden bewaard blijven.
-- Naam-koppeling is lowercase-trim op raw_ingredients.name.

-- ─── 1. Globale daily-need multipliers (DAILY_NEED_MULTIPLIER_BY_RAW_NAME) ─────────────────
UPDATE raw_ingredients SET ordering_daily_need_multiplier = 0.5
  WHERE lower(trim(name)) = 'romaine lettuce'  AND ordering_daily_need_multiplier IS NULL;
UPDATE raw_ingredients SET ordering_daily_need_multiplier = 1.014
  WHERE lower(trim(name)) = 'aubergine'         AND ordering_daily_need_multiplier IS NULL;
UPDATE raw_ingredients SET ordering_daily_need_multiplier = 0.6
  WHERE lower(trim(name)) = 'red cabbage shredded' AND ordering_daily_need_multiplier IS NULL;
UPDATE raw_ingredients SET ordering_daily_need_multiplier = 0.85
  WHERE lower(trim(name)) IN (
    'chickpeas','coriander (fresh)','pomegranate seeds','onion peeled',
    'feta cheese','greek yoghurt 10%','yoghurt','greek yogurt 10%'
  ) AND ordering_daily_need_multiplier IS NULL;

-- ─── 2. Min order packs threshold (MIN_ORDER_PACKS_BY_RAW_NAME) ─────────────────────────────
UPDATE raw_ingredients SET ordering_min_order_packs = 1
  WHERE lower(trim(name)) = 'romaine lettuce' AND ordering_min_order_packs IS NULL;

-- ─── 3. Max order base caps (MAX_ORDER_BASE_BY_RAW_NAME) ────────────────────────────────────
UPDATE raw_ingredients SET ordering_max_order_base = 1000
  WHERE lower(trim(name)) = 'carrot julienne' AND ordering_max_order_base IS NULL;
UPDATE raw_ingredients SET ordering_max_order_base = 10000
  WHERE lower(trim(name)) = 'bulgur'           AND ordering_max_order_base IS NULL;

-- ─── 4. Stock-par regels (MIN_STOCK_PAR_BY_RAW_NAME) ────────────────────────────────────────
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 11000
  WHERE lower(trim(name)) = 'all purpose flour' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 500
  WHERE lower(trim(name)) = 'baking powder' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) = 'baking soda' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 2, stock_par_order_packs = 12
  WHERE lower(trim(name)) = 'tahini' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 5660
  WHERE lower(trim(name)) IN ('aubergine puree','eggplant puree') AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 12000
  WHERE lower(trim(name)) = 'lemon juice' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 2600
  WHERE lower(trim(name)) = 'kalamata olives' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 2
  WHERE lower(trim(name)) = 'middle eastern pickles' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'base', stock_par_min_amount = 3600
  WHERE lower(trim(name)) = 'sugar brown' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 0.5, stock_par_order_packs = 1
  WHERE lower(trim(name)) = 'sugar white' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 0.5, stock_par_order_packs = 1
  WHERE lower(trim(name)) = 'olive oil' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) = 'greek yoghurt 10%' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) = 'vanilla extract' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1, stock_par_order_packs = 1
  WHERE lower(trim(name)) = 'whole wheat pita bread 15 cm' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) = 'garbage bags blue 145l (roll 20)' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) IN ('soof mint','soof cardamom') AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1, stock_par_order_packs = 1
  WHERE lower(trim(name)) IN ('charlie''s orange','charlie''s mandarin') AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 1
  WHERE lower(trim(name)) = 'mint' AND stock_par_kind IS NULL;
UPDATE raw_ingredients SET stock_par_kind = 'packs', stock_par_min_packs = 0.2
  WHERE lower(trim(name)) = 'honey sticks' AND stock_par_kind IS NULL;

-- ─── 5. Medi-salad VG pair: order_pack_multiple = 2 op het medi-salad-ingredient ─────────────
UPDATE raw_ingredients SET order_pack_multiple = 2
  WHERE lower(trim(name)) = 'medi salad 3kg' AND (order_pack_multiple IS NULL OR order_pack_multiple < 2);

-- ─── 6. Per-locatie overrides ─────────────────────────────────────────────────────────────────
-- Pijp: cauliflower daily_need_multiplier = 2, standing_order_packs = 2
INSERT INTO raw_ingredient_location_ordering (raw_ingredient_id, location_id, daily_need_multiplier, standing_order_packs)
SELECT ri.id, l.id, 2, 2
FROM raw_ingredients ri, locations l
WHERE lower(trim(ri.name)) = 'cauliflower'
  AND lower(trim(l.name)) LIKE '%pijp%'
ON CONFLICT (raw_ingredient_id, location_id) DO NOTHING;

-- Pijp: medi salad 3kg daily_need_multiplier = 1.3
INSERT INTO raw_ingredient_location_ordering (raw_ingredient_id, location_id, daily_need_multiplier)
SELECT ri.id, l.id, 1.3
FROM raw_ingredients ri, locations l
WHERE lower(trim(ri.name)) = 'medi salad 3kg'
  AND lower(trim(l.name)) LIKE '%pijp%'
ON CONFLICT (raw_ingredient_id, location_id) DO NOTHING;

-- Zuidas: cauliflower standing_order_packs = 2
INSERT INTO raw_ingredient_location_ordering (raw_ingredient_id, location_id, standing_order_packs)
SELECT ri.id, l.id, 2
FROM raw_ingredients ri, locations l
WHERE lower(trim(ri.name)) = 'cauliflower'
  AND lower(trim(l.name)) LIKE '%zuidas%'
ON CONFLICT (raw_ingredient_id, location_id) DO NOTHING;

-- West: carrot julienne daily_need_multiplier = 2
INSERT INTO raw_ingredient_location_ordering (raw_ingredient_id, location_id, daily_need_multiplier)
SELECT ri.id, l.id, 2
FROM raw_ingredients ri, locations l
WHERE lower(trim(ri.name)) = 'carrot julienne'
  AND (lower(trim(l.name)) LIKE '%west%' OR lower(trim(l.name)) = 'mima amsterdam')
ON CONFLICT (raw_ingredient_id, location_id) DO NOTHING;
