# Ingrediënten, leveranciers, stocktake vs ordering

Dit document beschrijft het **doelmodel** en hoe je de huidige app-tabellen gebruikt (of uitbreidt). Geen vervanging van migraties — wel het overzicht dat je miste sinds 017+.

**Master sheet-kolommen A–J ↔ database:** zie [MASTER_SHEET_MAPPING.md](./MASTER_SHEET_MAPPING.md).

---

## 1. Eén product, meerdere leveranciers (bv. aluminiumfolie)

**Principe:** In de keuken is er **één logische grondstof** (`raw_ingredients` = één regel op de stocktake). Leveranciers zijn **alternatieve bronnen**, geen dubbele ingredienten.

| Concept | Tabel / veld |
|--------|----------------|
| Wat tel je? | `raw_ingredients` (één rij: “Aluminium foil”) |
| Wie kan het leveren? | `supplier_ingredients`: meerdere rijen met **zelfde** `raw_ingredient_id`, **verschillende** `supplier_id` |
| Voorkeur | `supplier_ingredients.is_preferred` (één “default” leverancier voor suggesties) |

**Stocktake:** blijft **één** regel per `raw_ingredient`.  
**Ordering:** toon hetzelfde artikel onder **elke** gekoppelde leverancier, of alleen onder de preferred + link “andere leverancier”. Dat is UI-keuze; het datamodel ondersteunt meerdere leveranciers al.

**Te vermijden:** twee `raw_ingredients` “Foil A” / “Foil B” voor hetzelfde product — dan dubbelt de stocktake.

---

## 2. Masterlijst-leveranciers matchen met leveranciers in de app

**Probleem:** Sheet zegt “Bidfood”, app heeft “Bidfood BV” of typo.

**Oplossingen (van simpel naar stevig):**

1. **Naamnormalisatie in import**  
   `lower(trim(name))` + handmatige **mappingtabel** (in sheet of DB):  
   `master_supplier_name` → `suppliers.id` (of canonical name).

2. **Stabiele code (aanbevolen op termijn)**  
   Kolom op `suppliers`, bv. `external_code` of `slug` (`bidfood`, `van_gelder`).  
   Masterlijst heeft dezelfde code → geen twijfel bij import.

3. **Eenmalige reconciliatie**  
   Na import: query “suppliers in master zonder match in app” → in Admin aanmaken of alias toevoegen.

De app **matcht niet magisch**; jij levert ofwel normalisatie + mapping, ofwel codes.

---

## 3. Stocktake-eenheid ≠ ordering-eenheid (bv. bowls: sleeve 50 vs doos 6×50 = 300)

**Principe:** Voorraad in de database in **één basis-eenheid** (hier: **stuks bowls**). Packs zijn **vertalingen** voor tellen of bestellen.

| Doel | Modellering |
|------|-------------|
| Tellen in sleeves van 50 | `ingredient_pack_sizes`: bv. `size=50`, `size_unit=pcs`, optioneel `purpose`/vlag *voor stocktake* |
| Bestellen in doos 300 | Tweede pack: `size=300`, `size_unit=pcs` (of 6 “sleeves” als je tussenlaag wilt — zie hieronder) |

**Aanbevolen uitbreiding (als je het strict wilt):**

- Op `ingredient_pack_sizes` een veld zoals `usage` / `pack_role`:  
  `stocktake` | `order` | `both`  
  Dan: stocktake-UI kiest alleen `stocktake` (of `both`); ordering-UI toont vooral `order`.

**Hiërarchie (doos = 6 sleeves):** optioneel later:

- `parent_pack_size_id` of `contains_count` + link naar child-pack, **of**
- géén hiërarchie: twee vlakke packs (50 en 300) volstaat vaak; de 300-pack is “6 sleeves” documentatie in `notes`/label.

**Opslag:** `daily_stock_counts.quantity` blijft in **bowls** (stuks). Invoer “3 sleeves” → `3 × 50` bowls opgeslagen.

---

## 4. Recepten alleen uit masterlijst

**Technisch heb je dit al bijna:** `prep_item_ingredients.raw_ingredient_id` verwijst naar `raw_ingredients`.

**Wat je nog moet afdwingen:**

1. **Admin UI:** ingredient kiezen **alleen** uit dropdown `raw_ingredients` voor die locatie — geen vrije tekst voor “nieuwe” grondstof in het receptenscherm.
2. **Optioneel DB:**  
   - `raw_ingredients.is_catalog` / `archived` — verborgen in recept-dropdown als `archived`.  
   - Of aparte tabel `ingredient_catalog` — meestal overkill; `raw_ingredients` **is** je master per locatie.

**Workflow:** masterlijst → import → `raw_ingredients` vullen → recepten mogen alleen die ids kiezen.

---

## 5. Ordering: 6 kg nodig → 1×5 kg + 1×1 kg (optimale combinaties)

Dit is een **combinatie-/knapsack-achtig** probleem: gegeven doelhoeveelheid (in g) en beschikbare pack-gewichten, minimale verspilling of minimaal aantal colli.

**Fasering:**

1. **Nu:** meerdere `ingredient_pack_sizes` per grondstof; gebruiker kiest handmatig in de ordering-dropdown (5 kg + 1 kg).
2. **Volgende stap (automatisering):**  
   - Functie “**Suggest packs**”: input = benodigde hoeveelheid (g), packs = [{5000, g}, {1000, g}], output = `{ 5kg: 1, 1kg: 1 }` (greedy op grootste past vaak; voor strikt minimum colli soms DP).  
   - Alleen zinvol als packs **exact in dezelfde eenheid** als de behoefte zitten (alles gram voor die ui).

**Randvoorwaarden:** zelfde `raw_ingredient` (één “gepelde witte ui”), meerdere SKUs als **meerdere pack-regels** metzelfde `raw_ingredient_id` maar verschillende `size` — eventueel per leverancier via `supplier_ingredients` + pack-koppeling als je packs per leverancier wilt scheiden (nu zijn packs aan raw gebonden; uitbreiding zou `supplier_id` op pack zijn).

---

## Samenvatting

| Vraag | Kort antwoord |
|-------|----------------|
| Meerdere suppliers, één stocktake-regel | Één `raw_ingredient`; meerdere `supplier_ingredients`; preferred voor default |
| Master ↔ app suppliers | Naam-mapping of `external_code` + import |
| Stocktake vs order units | Meerdere `ingredient_pack_sizes`; basisvoorraad in één eenheid (stuks/g); optioneel `pack_role` |
| Recepten alleen master | FK blijft; UI alleen dropdown; optioneel `archived` op raw |
| 6 kg → 5+1 kg | Meerdere packs + toekomstige “suggest packs”-logica |

---

## Wat jij nog kunt aanleveren (om dit in de app te bouwen)

1. **Master CSV** met kolommen: `canonical_name`, `unit`, `supplier_code` of `supplier_name`, `pack_for_stocktake`, `pack_for_order` (of ruwe omschrijving).  
2. **Beslissing:** blijft `daily_stock_counts` altijd in `raw_ingredients.unit` (g/ml/pcs)?  
3. **Per product als voorbeeld:** 1 rij “bowls” (sleeve/doos) en 1 rij “ui gepeld” (5 kg + 1 kg) — dan kan import/UX exact daarop worden getest.

---

## Geïmplementeerde master-kolom → database (027 + 028)

Jouw sheet-kolommen worden zo vertaald:

| Sheet | Database |
|-------|-----------|
| `product` | `raw_ingredients.name` (match op naam; nieuwe rijen worden toegevoegd) |
| `stocktaking_*` | `ingredient_pack_sizes` met `pack_purpose = 'stocktake'` (of `'both'` als er geen aparte order-pack is) |
| `ordering_*` | Tweede rij met `pack_purpose = 'order'`; `sleeves`/`stacks`/`rolls` worden omgerekend naar stuks of rollen × inhoud |
| `supplier` (meerdere met `;`) | Meerdere `supplier_ingredients` + `suppliers` aangemaakt indien nodig |
| `visible` 0/1 | `supplier_ingredients.is_preferred` (let op: bij meerdere leveranciers met `1` zijn ze nu allebei “preferred” — zo nodig handmatig één preferred zetten) |
| `weekly` 1 | `raw_ingredients.order_interval_days = 7` |

**Sync opnieuw genereren:** pas de TSV in `scripts/generate_028_master_sync.py` aan, run `python3 scripts/generate_028_master_sync.py`, commit **beide** gegenereerde bestanden: `028_sync_master_catalog_from_sheet.sql` en `031_delete_raw_ingredients_not_on_master_sheet.sql`.

**Alleen de master:** er is **geen** alias-merge. Na **028** draai je **031**: alle `raw_ingredients` voor die locatie die **niet** exact (case-insensitive) op de sheet staan, worden verwijderd — inclusief oude recept-seednamen (`All purpose f`, enz.). `prep_item_ingredients` naar die rijen verdwijnen (CASCADE). **Herstel recepten in Admin** door alleen nog master-ingrediënten te kiezen.

**Oude bulk-migraties (019–026)** + afgewezen merge-aanpak **`030_deprecated_merge_aliases_do_not_use.sql`** staan in **`supabase/migrations_archive/`**. Zie `migrations_archive/README.md`.
