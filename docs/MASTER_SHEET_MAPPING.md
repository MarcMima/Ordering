# Master sheet ↔ database

De app leest **geen** Google Sheet direct. De bron staat in [`scripts/generate_028_master_sync.py`](../scripts/generate_028_master_sync.py) (ingebouwde TSV). Daaruit worden SQL-migraties gegenereerd die Supabase vullen.

## Kolommen A–J

| Kolom | Betekenis | Waar in Postgres |
|-------|-----------|------------------|
| **A** `product` | Weergavenaam | `raw_ingredients.name` |
| **B** `stocktaking_unit` | Hoe je telt (bag, box, …) | `raw_ingredients.stocktake_unit_label` én `ingredient_pack_sizes.display_unit_label` (sync houdt beide gelijk) |
| **C** `stocktaking_content_amount` | Hoeveelheid per verpakking | `raw_ingredients.stocktake_content_amount` én `ingredient_pack_sizes.size` |
| **D** `stocktaking_content_unit` | Eenheid van die inhoud (kg, g, pcs, …) | `raw_ingredients.stocktake_content_unit` én `ingredient_pack_sizes.size_unit` |
| **E–G** | Bestellen (order packaging) | Tweede pack-rij met `pack_purpose = 'order'` waar van toepassing |
| **H** `supplier` | Leveranciersnaam | `suppliers` + `supplier_ingredients` (per locatie) |
| **I** `visible` | `0` = niet op stocktake-lijst; anders wel | `raw_ingredients.stocktake_visible` |
| **J** `weekly` | `1` = wekelijkse stocktake (aparte **Weekly**-tab in de app; sync zet weekdag op maandag = `1`) | `raw_ingredients.stocktake_day_of_week` (`NULL` = **Daily**-tab). `order_interval_days = 7` blijft voor order-suggesties. |

## Stocktake-lijstvolgorde (app)

De volgorde van **raw ingredients** op de stocktake-pagina is **`raw_ingredients.stocktake_display_order`** (niet uit de sheet). In de app: **Reorder list (drag)** onder Daily/Weekly (grip vasthouden en slepen). **Finished products** gebruiken **`location_prep_items.display_order`** met dezelfde drag-modus. Daily en Weekly raws hebben elk een eigen volgorde.

## Recept- vs stocktake-eenheid

- `raw_ingredients.unit` is de **basis voor recepten en voorraad** (`g`, `ml`, `pcs`).
- B–D beschrijven **hoe je op stocktake telt**; de app rekent om naar die basis (zie stocktake UI: `getDefaultPack` / `packSizeToBaseAmount`).

## Sync workflow

1. TSV in het Python-script aanpassen.
2. `python3 scripts/generate_028_master_sync.py` — vult o.a. `028`, `031`, `033` en `034_master_stocktake_bcd_on_raw_ingredients.sql` (master B–D op `raw_ingredients`).
3. Migraties naar Supabase pushen / `supabase db reset` (lokaal).

**Multi-locatie:** de gegenereerde `028`/`031` lopen over **alle** rijen in `locations`, zodat elke locatie dezelfde master-catalogus krijgt (na reset of eerste apply).

**Al bestaande database** waar oude `028` al is gedraaid: `032` → `033` (I/J); daarna **`034_master_stocktake_bcd_on_raw_ingredients.sql`** voor master B–C–D op `raw_ingredients` (stocktake-eenheid in de app zonder afhankelijkheid van alleen `ingredient_pack_sizes`).

## Tabelnaam `ingredient_pack_sizes`

Historische naam voor “verpakking / tel-eenheid”. Inhoud = master **B–D** (plus order-pack E–G als tweede rij).
