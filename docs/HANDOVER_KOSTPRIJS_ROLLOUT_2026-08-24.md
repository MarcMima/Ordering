# Handover — rollout kostprijs/food cost (migraties 202–205)

**Datum:** 24 augustus 2026
**Project:** mima-kitchen · Supabase ref `olcqzhxirqhkfgzgjnnw` · GitHub MarcMima/Ordering
**Status:** afgerond, met 3 openstaande punten (zie onderaan)

---

## 1. Wat er is uitgerold

Vier migraties staan op productie (`supabase migration list` toont local == remote t/m 205):

| # | Bestand | Inhoud |
|---|---|---|
| 202 | `202_channel_settings_and_menu_channel_prices.sql` | channel_settings + verkoopprijzen per kanaal op menu items |
| 203 | `203_import_kostprijs_prijzen_251126.sql` | import kostprijzen uit Excel 25-11-26 |
| 204 | `204_menu_verkoopprijzen_251126.sql` | menu verkoopprijzen 25-11-26 |
| 205 | `205_fix_food_cost_location_duplication.sql` | fix dubbeltelling food cost per locatie + auditview `prep_scaling_issues` |

Gecommit en gepusht als `20cc6fb` op `main`.

## 2. Handmatige datacorrectie na de migratie

Migratie 205 voegt de auditview `prep_scaling_issues` toe maar past **bewust geen data aan**
(handmatige config, spec §7). Die view gaf twee items met een kapotte denominator — de kostprijs
werd door een denominator van 10 gedeeld in plaats van door de batchgrootte, waardoor kipgerechten
op ~€800 uitkwamen.

Handmatig gezet in `prep_items`:

| prep item | `ingredient_qty_is_per_recipe_batch` | `recipe_output_amount` | `recipe_output_unit` | `content_amount` |
|---|---|---|---|---|
| Grilled chicken | `true` | 10000 | `g` | 10 kg — **niet aangeraakt** |
| Pickling liquid | `true` | 7882,5 | `g` | 10 L — **niet aangeraakt** |

Waarom `g` en niet `kg`: de kostenfunctie rekent `g` 1:1 door, dus 7882,5 gaat er exact in
zonder afrondingsverlies. De waarden komen uit `sum_line_qty` van de view, dus rechtstreeks
uit de receptregels — niet uit een schatting.

`content_amount` is met opzet ongemoeid gelaten: dat is de teleenheid voor de stocktake en
staat los van de receptbatch.

**Let op bij het teruglezen van oudere notities:** het prep item heet *Grilled chicken*,
het rauwe ingrediënt eronder heet *Marinated chicken*. Die twee worden makkelijk verwisseld.

Na de correctie geeft `SELECT * FROM prep_scaling_issues;` **0 rijen**.

## 3. Controle food cost

`computed_menu_item_food_cost` na de fix — hoogste food cost is 27,5%, ruim onder de grens van 50%.

| gerecht | kostprijs | food cost |
|---|---|---|
| Pita za'atar | €0,69 | 27,5% |
| Pita Cauliflower | €2,13 | 20,3% |
| Pita Falafel | €2,10 | 20,0% |
| Pita Sabich | €2,09 | 19,9% |
| Pita Chicken | €1,65 | 14,4% |
| Bowl Chicken | €1,44 | 10,7% |
| Flatbread Chicken | €0,88 | 7,7% |

De kipgerechten zijn van ~€800 naar €0,88–€1,65 gegaan. Dat is lager dan de verwachte ~€3;
niet fout, maar het verdient een vergelijking met de eigen calculatie.

## 4. Openstaande punten

### a. Drie gerechten op €0,00 food cost
Niet veroorzaakt door deze rollout — ontbrekende inkoopprijzen.

- **Mezze Grilled chicken** — component aanwezig, maar raw ingredient *Marinated chicken* heeft `has_price = false`
- **Flatbread** — component aanwezig, raw ingredient *Frozen flatbreads* heeft `has_price = false`
- **Brownie** — geen componenten gekoppeld

De eerste twee staan ook in de reviewlijst (regels *Flatbread* en *AH Reep puur*), dus die lossen
zich mogelijk op zodra die zijn afgehandeld.

### b. 40 openstaande regels in `kostprijs_import_review`
Marc loopt deze zelf na:

```sql
SELECT * FROM kostprijs_import_review WHERE NOT resolved ORDER BY categorie, excel_name;
```

Verdeling: verpakking 10 · menu_item 8 · drank 3 · food 19.

Twee dingen die opvielen:
- **Carrots en Wortelen** staan er allebei op met identieke prijs (€3,50/kg) en leverancier
  (Van Gelder) — vrijwel zeker één product, dubbel geïmporteerd.
- **Bladpeterselie gesneden 3mm** is als enige met een echte opmerking niet geïmporteerd:
  *"zou botsen met Parsley (flat leaf) als Parsley-prijs bij Van Gelder — ander product?"*
- **Mezze Mediterranean salad** heeft geen verkoopprijs in de Excel.

De `kandidaten`-kolom bevat fuzzy matches die grotendeels onbruikbaar zijn
(Paprika → "Paper bag (brownies)", Chocolate chip → "Coca Cola"). Negeren.

### c. Verkoopprijzen instore/online nog niet ingevoerd
De 8 `menu_item`-regels in de reviewtabel dragen de prijzen in de `opmerking`-kolom
(bv. Charlies 2,75 instore / 3,00 online). Die zijn nog niet naar `menu_item_channel_prices`
geschreven.

## 5. Toolchain — wat er is veranderd op de machine

Dit blokkeerde de rollout een tijd en is nu opgelost:

- **Supabase CLI** bijgewerkt 2.84.2 → 2.115.0 (`brew upgrade supabase`).
  De CLI-versie was overigens niet de oorzaak van het connectieprobleem.
- **`libpq` geïnstalleerd** voor `psql` — die stond niet op de machine.
  Zit in `/opt/homebrew/opt/libpq/bin`, staat **niet** in PATH.
- **Databasewachtwoord** stond verouderd in `~/.bashrc` regel 1 en is door Marc vervangen.

Verbinden met productie:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
psql -h aws-1-eu-west-1.pooler.supabase.com -p 5432 \
     -U postgres.olcqzhxirqhkfgzgjnnw -d postgres
```

Bij `SASL auth failed` / `SQLSTATE 28P01`: wachtwoord verlopen. Resetten via
Project Settings → Database en regel 1 van `~/.bashrc` vervangen. Er is **geen** service-role key
in `.env.local` (alleen de anon key), dus PostgREST is geen alternatief voor config-tabellen —
die zitten achter RLS sinds migratie 194.

Nog een detail: er lag een stale `.git/index.lock` in de repo die committen blokkeerde.
Verwijderd. Als dat terugkomt: controleer of er geen editor een git-commit open heeft staan.
