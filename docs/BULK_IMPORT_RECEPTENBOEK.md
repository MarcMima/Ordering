# Bulk import receptenboek → Admin Products + Ingredients

Je spreadsheet heeft grofweg:

| prep_item_name | raw_ingredient | quantity (gram) |
|----------------|----------------|-----------------|

- **Admin → Products** = tabel `prep_items` → vullen met **unieke** `prep_item_name`, unit **`g`**.
- **Admin → Ingredients** = tabel `raw_ingredients` → vullen met **unieke** grondstoffen, unit **`g`**, gekoppeld aan een **locatie**.
- **Receptregels** = tabel `prep_item_ingredients` → koppelt prep item ↔ grondstof met `quantity_per_unit` in **gram**.

## Stappen in Supabase

1. **Vervang** in het SQL-script hieronder:
   - `'JOUW-LOCATION-UUID'` door je `locations.id` (bijv. Mima Amsterdam).
2. **Vul** het blok `recipe_rows (prep_item_name, raw_ingredient_name, quantity_per_unit)` met je data (één regel per ingredient-regel uit je sheet).  
   - Gebruik **exact dezelfde spelling** als in je sheet; het script matcht op naam (trim + case-insensitive voor prep_items/raw_ingredients waar nodig).
3. Run het script in **Supabase → SQL Editor**.

## Optioneel: alle nieuwe producten aan locatie koppelen

Na het script verschijnen de producten onder **Admin → Products**. Voor **Stocktake** moet elk product nog aan de locatie gekoppeld worden (`location_prep_items`). Dat kan:

- handmatig: **Admin → Locations → Manage products**, of
- met een extra SQL-blok onderaan hetzelfde bestand (alle `prep_items` die nog niet aan die locatie hangen, in één keer koppelen).

Zie `supabase/migrations/014_bulk_seed_from_recipe_sheet.sql` voor het uitvoerbare SQL-template.

---

## Bulk import: unit + inhoud per fles/container (018)

Als je na 014 alles nog op `g` hebt staan maar wilt tellen in **flessen / GN / zakjes**, kun je in één keer **unit**, **content_amount** en **content_unit** zetten:

1. Migratie **017** moet gedraaid zijn.
2. Open **`supabase/migrations/018_bulk_prep_item_units.sql`**.
3. Vul `INSERT INTO unit_rows … VALUES` met jouw productnamen (moeten matchen met `prep_items.name`, zelfde logica als 014).
4. Run in SQL Editor — mag **opnieuw**; alleen rijen in `unit_rows` worden toegepast.

Zie ook `docs/KITCHEN_MODEL_ADVICE.md` (content per count unit).
