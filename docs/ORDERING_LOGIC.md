# Ordering-logica — canonieke kaart

> **Doel van dit document:** dé plek om te begrijpen hoe het besteladvies werkt,
> zodat je niet de hele pijplijn hoeft te reverse-engineeren. **Bij elke wijziging
> aan de bestel-logica: werk dit document bij in dezelfde commit.**
> Laatst herzien: 14 aug 2026 (branch `fix/ordering-advice-consistency`).

## Kerninvariant (sinds aug 2026)

1. **De order-pack ís de leveranciers-besteleenheid.** De pack die
   `getOrderPackDeterministic` kiest (`ingredient_pack_sizes`, purpose
   `order`/`both`) moet exact overeenkomen met `supplier_ingredients.order_unit`,
   want `dispatch-order` (edge function) stuurt `order_line_items.quantity`
   **onvertaald** door met die UOM. Voorbeelden: aubergine puree = blik 2,83 kg
   (Bidfood `BL`), Greek yoghurt = emmer 1 kg (`EM`), tomaat = kist 6 kg
   (Van Gelder `KST6ST`), Charlie's = tray 12 (`TR`).
2. **`order_pack_multiple` is een stap, geen deler.** "Bestel in veelvouden van
   N packs" — `applyOrderPackMultipleRounding` = `roundUpToMultiple`
   (`calculations.ts`). Voorbeelden: medi salad per 2 tubs, tahini per 12
   emmers, lijnzaad per 6, flatbreads MOQ 65 zakjes.
   `raw_ingredients.order_pack_multiple` overschrijft de pack-rij.
3. **Advies = bestelling.** Het getal op het bestelscherm is hetzelfde getal dat
   naar de leverancier gaat, in dezelfde eenheid.

## De pijplijn (alles client-side in `src/app/ordering/page.tsx`, één groot useEffect)

```
1. Dagbehoefte op volle capaciteit
   location_prep_items.base_quantity × prep_item_ingredients.quantity_per_unit
   (aggregateDailyRawNeedFromPrep, calculations.ts)
2. Correcties op dagbehoefte (orderingAdjustments.ts)
   medi-salad VG-tub-override (Pijp/Zuidas), multipliers (DB kolommen →
   hardcoded maps), production-gated raws, weekly-interval items
3. Dekkingsvenster (suggestOrderBaseQuantities, calculations.ts)
   leverdagen van de voorkeursleverancier → dek [eerstvolgende levering …
   dag vóór de levering erna]; "dagelijkse" leveranciers (Java, Van Gelder)
   dekken alleen morgen
4. Omzet-schaling (calcScaledNeedOverOrderWindow)
   per dag × (daily_revenue_targets / locations.full_capacity_revenue)
   + ⅔ avondslice van de besteldag. Ontbrekende toekomstige dag erft de
   prognose van de besteldag (fallback sinds aug 2026); pas als er nergens
   een prognose is geldt multiplier 1.
5. Voorraad eraf
   daily_stock_counts (vandaag, anders laatste telling ≤7 dagen terug; nooit
   geteld = 0!) + prep-credit (whitelist in prepStockRawCredit.ts, flatbread-
   pool, pickled, kip: Grilled chicken-bakken × 10 kg)
6. Uitzonderingsketen (volgorde in page.tsx ~1340-1440)
   prep-batch-shortfall → stock-par (DB kolommen stock_par_* op
   raw_ingredients, anders map in stockPar.ts) → drink-tray-pars → mint →
   caps/floors → medi-salad cleanup → gates (baking powder, lemon juice,
   bloem <2 kg, knoflook) → aubergine/sabich → pita-credit → production-gate
   → West-suppress → supplier-exclude
7. Base → packs (baseAmountsToPackCounts) → colli-stap (roundUpToMultiple)
8. Order lines (buildOrderLinesFromSuggestion; zelfde pack-picker als stap 7)
   → handmatige overrides (order_drafts per locatie+dag) → dispatch-order
```

## Regels per product (stand 14 aug 2026)

| Product | Regel |
|---|---|
| **Bloem** | Bestelpunt: niets tot voorraad < 2 kg, dan 1 doos (10 kg). Gate in `orderingAdjustments.applyFlourOrderGate` + DB par 2000 g. |
| **Kip** | Raw = "Marinated chicken" (Bidfood 172799, doos 10 kg). Prep = "Grilled chicken" (bak = 10 kg raw). Beide tellingen tellen mee. Vraag = 5 bakken/dag vol → vr dekt za+zo+⅔vr. |
| **Pita (beide)** | Puur dekkingsvenster: 50 st/dag vol × omzet, minus diepvries + afgewerkte prep (per soort). Geen par meer op wholewheat. |
| **Flatbreads** | Java, MOQ 65 zakjes (à 5 st). Bestelpunt: onder 35 zakjes (raw + defrosted) → 65 zakjes. DB par 12 250 g. |
| **Medi salad 3kg** | VG tub (`ST`), per 2. Alleen Pijp/Zuidas (vervangt losse komkommer+tomaat voor die prep). |
| **Mint** | VG zakje 80 g; 1/6 GN = 40 g; par 1 zakje. |
| **Komkommer Pijp** | Brunoise 10mm 1 kg (VG 161341), kist van 6 (`KST6ST`), telling per zak 1 kg. Raw heet bewust nog "Cucumber" (code koppelt op naam). |
| **Vanille** | Dawn Aroma Mauritius fles 1 kg, Bidfood 381760 (`FL`). |
| **Charlie's** | "Orange Mandarin" (165077) + "Grapefruit" (144466), tray 12, par 1 tray. |
| **Aubergine puree** | Blik 2,83 kg (`BL`), per 6; par 5 660 g (±2 blikken). |
| **Greek yoghurt** | Emmer 1 kg (`EM`), per 6; par 6 emmers. |
| **Tomaat** | Kist 6×1 kg (`KST6ST`); telling per kilo-doos (aparte stocktake-pack). |

## Waar config leeft

- **DB (leidend, via Admin of SQL-editor):** `raw_ingredients`
  (`order_pack_multiple`, `stock_par_*`, `ordering_*`, stocktake-velden),
  `ingredient_pack_sizes`, `supplier_ingredients` (artikel + `order_unit`),
  `supplier_delivery_schedules` (0=ma!), `raw_ingredient_location_ordering`,
  `location_prep_items.base_quantity`, `daily_revenue_targets`, `locations`.
- **Alleen in code (naam-gebaseerd, DB kan het niet overschrijven):** de gates
  (bloem, baking powder, lemon juice, knoflook), drink-tray-pars, mint-,
  pita-, flatbread-, medi-salad- en kip-uitzonderingen, en de fallback-maps in
  `stockPar.ts` / `orderingAdjustments.ts`. Nieuwe naam in DB? Check of een map
  in code mee moet.

## Valkuilen

- Een raw die nooit geteld is = voorraad 0 → vol advies.
- `supplier_delivery_schedules.day_of_week`: 0 = **maandag** (conversie in
  `supplierScheduleDayToJsDay`).
- Handmatige bewerkingen bevriezen als draft (`order_drafts`, per locatie+dag);
  "Recalculate from stocktake" is de enige refresh.
- Config-tabellen zijn anon **read-only** (migratie 194): schrijven kan alleen
  ingelogd (admin-schermen) of via de Supabase SQL-editor.
- Docs `KITCHEN_MODEL_ADVICE.md` en `INGREDIENTS_SUPPLIERS_ORDERING.md` zijn
  verouderd (april); dit document is leidend.
