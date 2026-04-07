# Gearchiveerde SQL-migraties

Deze bestanden staan **niet** meer in `supabase/migrations/` en worden door `supabase db push` / nieuwe omgevingen **niet** meer uitgevoerd.

## Waarom

Ze zijn **vervangen** door:

- **`027_ingredient_pack_purpose_and_display.sql`** — `pack_purpose`, `display_unit_label`, `order_interval_days` op `raw_ingredients`
- **`028_sync_master_catalog_from_sheet.sql`** — upsert master producten (leveranciers, packs, weekly, multi-supplier)
- **`031_delete_raw_ingredients_not_on_master_sheet.sql`** — verwijdert alles wat **niet** op de sheet staat (geen merge)

## Wat er hier nog voor is

| Bestand | Was |
|--------|-----|
| `019` | Simpele bulk raw list |
| `020` | Raw + supplier uit sheet |
| `021` | Pack sizes uit oude sheet-match |
| `022` | Handmatige name_map / supplier_map reconcile |
| `023` | Exacte naam-match leverancierssheet → packs |
| `024` | Alias-namen → sheet producten |
| `025` | Merge baking powder + `grams_per_piece` voorbeeld |
| `026` | `order_interval_days` kolom + optionele spice seeds |
| `030_deprecated_merge_aliases_do_not_use.sql` | Afgewezen alias-merge (gebruik **031** i.p.v.) |

**Historische referentie** (oude `location_id`, handmatige `INSERT`s). Gebruik alleen als je oude logica wilt vergelijken.

## Nieuwe dataflow

1. Pas de TSV aan in `scripts/generate_028_master_sync.py`
2. `python3 scripts/generate_028_master_sync.py`
3. Commit `028_sync_master_catalog_from_sheet.sql` **en** `031_delete_raw_ingredients_not_on_master_sheet.sql`

Zie ook `docs/INGREDIENTS_SUPPLIERS_ORDERING.md`.

## Bestaande productie

Als database **019–026 al heeft gedraaid**: niets terugdraaien nodig. Archiveren wijzigt alleen **nieuwe** clones / lege DB’s.

Als je ooit een **specifieke** oude patch opnieuw nodig hebt, kopieer het bestand tijdelijk terug naar `migrations/` met een **nieuw hoger nummer** (bijv. `029_...`) en pas aan — niet de archiefversie zomaar terugzetten op het oude nummer (migratiehistory).
