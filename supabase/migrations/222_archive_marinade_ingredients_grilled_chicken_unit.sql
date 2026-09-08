-- Marc, 8 sept 2026 (al toegepast op productie via MCP, hier voor de historie):
-- 1. Marinade wordt niet meer zelf gemaakt (gemarineerde kip komt kant-en-klaar), dus
--    zonnebloemolie, vetsin en tomatenpuree gaan uit de telling en de selector. "Tomato" bleek
--    al de gesneden tomaat van Van Gelder (161452, brunoise 1 kg): hernoemd; alleen West gebruikt
--    hem nog (Medi salad in eigen keuken), Pijp/Zuidas krijgen de kant-en-klare Medi salad 3kg.
-- 2. Turmeric rice gebruikte zonnebloemolie → olijfolie (zelfde hoeveelheid, zelfde locatie).
-- 3. Grilled chicken werd geteld als "bag 10 kg"; in werkelijkheid is een gegrilde portie een
--    container van 5 kg. Receptopbrengst (6.232 g per 10 kg rauw) blijft gelijk.

UPDATE prep_item_ingredients pii
SET raw_ingredient_id = o.id
FROM raw_ingredients s, raw_ingredients o, prep_items p
WHERE pii.raw_ingredient_id = s.id AND s.name = 'Sunflower oil'
  AND o.name = 'Olive oil' AND o.location_id = s.location_id
  AND p.id = pii.prep_item_id AND p.name = 'Turmeric rice'
  AND NOT EXISTS (SELECT 1 FROM prep_item_ingredients x WHERE x.prep_item_id = pii.prep_item_id AND x.raw_ingredient_id = o.id);

UPDATE raw_ingredients SET stocktake_visible = false, updated_at = now()
WHERE name IN ('Sunflower oil', 'MSG (Ve Tsin)', 'Tomato puree');

UPDATE raw_ingredients SET name = 'Tomato brunoise 20mm (1 kg)', updated_at = now() WHERE name = 'Tomato';
UPDATE raw_ingredients r SET stocktake_visible = (l.name = 'Mima Amsterdam'), updated_at = now()
FROM locations l WHERE l.id = r.location_id AND r.name = 'Tomato brunoise 20mm (1 kg)';

UPDATE prep_items SET unit = 'container', content_amount = 5, content_unit = 'kg', updated_at = now()
WHERE name = 'Grilled chicken';
