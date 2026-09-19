-- Rose lemonade in twee taken (verzoek keuken via WhatsApp, 18 sept 2026):
--   1. "Rose lemonade mix" — de mix maken, staat 's nachts te trekken (overnight-taak).
--   2. "Rose lemonade"     — de mix de volgende dag op flessen doen (taak van vandaag).
--
-- Model: het recept (citroensap, rozenblaadjes, suiker) verhuist naar de mix. Het flessen-
-- item krijgt één regel: 500 g mix per fles, via sub_prep_item_id (migratie 225). Zo blijft
-- de kostprijs van menu-item "Lemonade" (500 g Rose lemonade) hetzelfde, want de kostprijs
-- per gram cascadeert: mix = (65 + 45 + 175 g ingrediënten) / 5.000 ml batch, fles = 500 g mix.
--
-- Oude waarden van "Rose lemonade" (a3d61cfc-8281-4331-912c-12cbd2dee720):
--   unit 'Bottles', content 500 g, recipe_output 5000 ml, ingredient_qty_is_per_recipe_batch = true,
--   recept: Lemon juice 65, Rose petals 45, Sugar white 175 (per batch van 5.000 ml).
-- Dagnorm blijft 10 flessen per locatie; de mix krijgt 1 batch (5 L) per dag = hetzelfde volume.
-- Idempotent: draait niets opnieuw als de mix al bestaat.

BEGIN;

-- 1. De mix als eigen prep item, met het recept van de flessen.
INSERT INTO prep_items (
  name, unit, content_amount, content_unit,
  recipe_output_amount, recipe_output_unit, ingredient_qty_is_per_recipe_batch,
  requires_overnight, overnight_alert, stocktake_visible, yield_source
)
SELECT 'Rose lemonade mix', 'Batch', 5000, 'ml',
       5000, 'ml', true,
       true, 'Make the mix today, bottle it tomorrow.', true, 'assumed'
WHERE NOT EXISTS (SELECT 1 FROM prep_items WHERE name = 'Rose lemonade mix');

-- 2. Receptregels verhuizen van de flessen naar de mix (zelfde hoeveelheden per batch).
UPDATE prep_item_ingredients pii
SET prep_item_id = (SELECT id FROM prep_items WHERE name = 'Rose lemonade mix'),
    updated_at   = now()
WHERE pii.prep_item_id = (SELECT id FROM prep_items WHERE name = 'Rose lemonade')
  AND pii.raw_ingredient_id IS NOT NULL;

-- 3. Flessen: per stuk rekenen (500 g mix per fles) in plaats van per batch.
UPDATE prep_items
SET ingredient_qty_is_per_recipe_batch = false,
    recipe_output_amount = NULL,
    recipe_output_unit   = NULL,
    updated_at           = now()
WHERE name = 'Rose lemonade';

INSERT INTO prep_item_ingredients (prep_item_id, sub_prep_item_id, quantity_per_unit)
SELECT b.id, m.id, 500
FROM prep_items b, prep_items m
WHERE b.name = 'Rose lemonade' AND m.name = 'Rose lemonade mix'
  AND NOT EXISTS (
    SELECT 1 FROM prep_item_ingredients x WHERE x.prep_item_id = b.id AND x.sub_prep_item_id = m.id
  );

-- 4. Mix op de preplist van elke locatie die de flessen al heeft: 1 batch per dag,
--    vlak vóór de flessen in de volgorde.
INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity, display_order)
SELECT lpi.location_id, m.id, 1, GREATEST(COALESCE(lpi.display_order, 260) - 1, 0)
FROM location_prep_items lpi
JOIN prep_items b ON b.id = lpi.prep_item_id AND b.name = 'Rose lemonade'
CROSS JOIN prep_items m
WHERE m.name = 'Rose lemonade mix'
  AND NOT EXISTS (
    SELECT 1 FROM location_prep_items x WHERE x.location_id = lpi.location_id AND x.prep_item_id = m.id
  );

COMMIT;

-- Controle 1: twee items, mix overnight met het recept, flessen met de sub-prep-regel.
SELECT pi.name, pi.unit, pi.content_amount, pi.content_unit, pi.requires_overnight,
       pi.ingredient_qty_is_per_recipe_batch, pi.recipe_output_amount,
       (SELECT string_agg(COALESCE(ri.name, 'prep: ' || sp.name) || ' ' || pii.quantity_per_unit, ', ')
          FROM prep_item_ingredients pii
          LEFT JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
          LEFT JOIN prep_items sp ON sp.id = pii.sub_prep_item_id
         WHERE pii.prep_item_id = pi.id) AS recept
FROM prep_items pi
WHERE pi.name IN ('Rose lemonade', 'Rose lemonade mix')
ORDER BY pi.name;

-- Controle 2: de kostprijs van "Lemonade" moet 46,113 cent blijven (13,18%).
SELECT menu_item_name, computed_cost_cents, food_cost_pct
FROM computed_menu_item_food_cost WHERE menu_item_name = 'Lemonade';
