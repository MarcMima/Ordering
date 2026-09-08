-- Marc, 8 sept 2026: de selector moet alleen zijn lijst bevatten. De 21 extra Bidfood non-food
-- regels uit 221 (schoonmaakmiddelen, werkdoeken, kleine keukenspullen) zijn verwijderd; 221 is
-- in de repo op dezelfde lijst teruggebracht, dus op een verse database doet dit niets.
DO $$
DECLARE names text[] := ARRAY[
  'Aluminium catering tray 55 cm (pack 10)','Detectable plasters (box 100)','Vacuum bags 30x40 (pack 100)',
  'Garbage bags 60x80 (roll 20)','Piping bags blue 51 cm (box 72)','Squeeze bottle 70 cl','Thermal till roll 57x30 (box 10)',
  'Tea towels blue (pack 6)','Clear Dry Classic rinse aid 5 L','Work cloths yellow 38x38 (box 50)','Work cloths blue 38x38 (box 50)',
  'Kitchen cleaner / degreaser 5 L','Degreaser spray 750 ml','Sanitary cleaner 1 L','Glass cleaner Glassex (2 x 750 ml)',
  'Floor cleaner 5 L','Oven & grill cleaner 5 L','Limescale spray Antikal 800 ml','Drain unblocker gel 1 L','Cif cream scouring 2 L','Washing powder 8 kg'];
BEGIN
  DELETE FROM ingredient_prices     WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE name = ANY(names));
  DELETE FROM supplier_ingredients  WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE name = ANY(names));
  DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE name = ANY(names));
  DELETE FROM raw_ingredients WHERE name = ANY(names);
END $$;
