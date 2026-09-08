-- Marc, 8 sept 2026: de "Add item"-selector op de bestelpagina wordt gesplitst in
-- Food en Non-food. Daarvoor krijgt elk ruw ingrediënt een soort. Backfill:
-- alles wat aan GéDé gekoppeld is (verpakking/disposables/schoonmaak) plus de
-- bekende Bidfood non-food koppelingen wordt non_food; de rest blijft food.

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'food'
    CHECK (item_kind IN ('food', 'non_food'));

COMMENT ON COLUMN raw_ingredients.item_kind IS
  'food | non_food — groepeert de Add item-selector op de bestelpagina (migratie 220).';

UPDATE raw_ingredients r
SET item_kind = 'non_food'
WHERE r.item_kind = 'food'
  AND (
    EXISTS (
      SELECT 1 FROM supplier_ingredients si
      JOIN suppliers s ON s.id = si.supplier_id
      WHERE si.raw_ingredient_id = r.id
        AND lower(translate(s.name, 'éÉ', 'ee')) = 'gede'
    )
    OR EXISTS (
      SELECT 1 FROM supplier_ingredients si
      WHERE si.raw_ingredient_id = r.id
        AND si.supplier_article_code IN ('054362', '782790')  -- afvalzakken, handzeep
    )
    OR r.name IN ('Aluminium foil dispenser', 'Microfiber cloth', 'Stirrer')
  );
