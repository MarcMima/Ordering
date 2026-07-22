# Volledige rollout — Mima Ordering (niks overgeslagen)

Zorg dat je in Claude Code op branch `fix/reliability-sweep` zit. Plak onderstaande prompt. De agent maakt eerst de twee resterende features af (bestel-concept bewaren + alle overrides naar de database) en rolt daarna uit naar productie. Hij pauzeert vóór elk `supabase`-commando en vóór de merge naar `main`.

**Timing:** alles vóór de merge is veilig op elk moment (de nieuwe code staat dan nog op de branch). Het gevoelige moment is de merge naar `main` — laat de agent daar wachten tot de keuken rustig is als er service draait.

## Prompt om te plakken

```
Je werkt in de Mima ordering-app op branch `fix/reliability-sweep`. We maken nu ALLES af en rollen daarna uit naar productie. Werk voorzichtig; vraag mijn OK vóór elk `supabase`-commando (db push / functions deploy) en vóór het mergen naar main. Draai nooit `supabase db reset`. Draai npm run build en npm run lint vóór elke commit; commit per logische stap en push. Zorg dat je op branch fix/reliability-sweep zit.

DEEL 1 — RESTERENDE FEATURES AFMAKEN (code op de branch):
A. Prompt 12 (bestel-concept bewaren): persisteer het order-concept naar een nieuwe tabel `order_drafts` (upsert op location_id + date, gedebounced) i.p.v. alleen sessionStorage, zodat een aangepast concept bewaard blijft over tabs/apparaten/dagen en niet door een verse suggestie wordt overschreven. Voeg een schema-migratie toe voor `order_drafts` MET anon lees- én schrijfrechten (operationele data, net als daily_stock_counts — NIET opnemen in de config-lockdown van migratie 194). Toon een "concept hersteld"-indicatie.
B. Prompt 3d volledig (hardcoded overrides naar de database): verplaats de resterende naam-gekoppelde override-tabellen uit src/lib/orderingAdjustments.ts en src/lib/stockPar.ts (daily_need_multiplier, min_order_packs, max_order_base, min stock par/MOQ, medi-salad pair, parsley split) naar DB-kolommen per raw_ingredient (en per locatie waar de override locatie-specifiek is). Voeg een schema-migratie toe voor die kolommen en seed ze EENMALIG met de huidige hardcoded waarden zodat het gedrag exact gelijk blijft. Voeg admin-bewerking toe voor deze velden. Laat de bestellogica deze DB-waarden lezen i.p.v. de constanten; verwijder de constanten pas als de DB-weg werkt en getest is.
C. BELANGRIJK voor A, B en het bestaande colli-scherm (3c): al deze admin-config-schrijfacties moeten blijven werken nadat migratie 194 de config-tabellen alleen-lezen maakt voor anon. Laat admin-config-writes daarom via server-side API-routes met de service-role key lopen (zelfde patroon als src/app/api/admin/*).
D. Maak de HACCP unique-index migraties (195, 196) dedupe-veilig: eerst dubbele rijen verwijderen (behoud per groep de meest recente/meest gevulde), dan de UNIQUE INDEX. Idempotent.
E. Zorg dat migratie 194 de nieuwe operationele tabel order_drafts NIET op alleen-lezen zet, en de nieuwe 3d-config-kolommen wél als config behandelt.
Commit en push alles. Loopt een onderdeel vast, commit wat werkt, meld het, en ga door — laat de bestaande bestellogica nooit kapot achter.

DEEL 2 — UITROL NAAR PRODUCTIE (pauzeer en vraag mijn OK vóór elk supabase-commando):
1. Controleer of de Supabase CLI aan het project gekoppeld is; zo niet, stop en meld het.
2. Pas alle openstaande migraties toe met supabase db push (193 kolom, 195/196 dedupe+index, de nieuwe order_drafts- en 3d-migraties, en 194 RLS-lockdown). Deze zijn additief en veilig voor de nu-live oude code; 194 raakt alleen admin-config-writes, niet de operationele schermen.
3. Deploy de edge functions: supabase functions deploy sync-van-gelder en supabase functions deploy sync-bidfood-assortment.
4. STOP en meld mij dat database en functions bij zijn. Ik geef dan groen licht om naar main te mergen (dan gaat de nieuwe code live).
5. Na mijn groen licht: help me de merge te doen en geef me een testlijst: bestelscherm + colli-stap, een colli opslaan in admin, een 3d-override opslaan in admin, stocktake invullen, HACCP invullen, en een bestel-concept aanpassen + verversen om te zien of het bewaard blijft.
6. Werkt iets niet, stel direct een fix of terugdraai voor.

Geef aan het eind een kort statusoverzicht.
```

## Waar jij bij betrokken bent
- **Vóór de merge (Deel 2, stap 4):** de agent stopt en vraagt jouw groen licht. Kom dan terug naar de chat met Claude (Cowork), dan doen we de merge + tests samen.
- **Tests na de merge:** bestelscherm/colli, colli opslaan, 3d-override opslaan, stocktake, HACCP, en bestel-concept bewaren.
