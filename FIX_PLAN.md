# Mima Ordering — Fix-plan als Claude Code prompts

*Op basis van de fable-code-audit, 22 juli 2026. Geprioriteerd op impact op dagelijks gebruik.*

## Hoe je dit gebruikt

Plak de prompts **één voor één** in Claude Code, in volgorde. Elke prompt is zelfstandig, verwijst naar de betrokken bestanden en eindigt met "test + commit". Regels die je Claude Code laat aanhouden:

- **Werk op een branch per fix**, commit na elke werkende wijziging, push meteen. Nooit weken ongecommit laten staan.
- **Config hoort in de database, niet in nieuwe migraties.** Migraties alleen voor schema.
- **Draai `npm run dev:clean`** als de dev-server rare dingen doet (oude cache) — zie `docs/DEV_SERVER_LOCK.md`.
- Laat Claude Code na elke fix `npm run build` en `npm run lint` draaien voordat het commit.

Begin met **Prompt 0** (eenmalig): dat verankert de werkwijze zodat werk niet meer kwijtraakt.

---

## Prompt 0 — Werkwijze verankeren (eenmalig, doet dit werk-verlies stoppen)

```
Lees docs/DEV_SERVER_LOCK.md en de bestanden in .cursor/rules/. Maak een CLAUDE.md in de repo-root die als vaste werkinstructie geldt, met minimaal:
- Commit na elke werkende wijziging en push direct naar origin/main; nooit werk lang ongecommit laten staan. Eén logische wijziging = één commit.
- Database-config (colli, pack sizes, prijzen, MOQ, leveranciers-instellingen) hoort in de database via Admin-schermen, NIET in nieuwe SQL-migraties. Migraties zijn alleen voor schema-wijzigingen.
- Draai npm run build en npm run lint voor elke commit.
- UI-tekst is Engels (zie bestaande .cursor rule).
- Voordat je zegt dat een feature werkt: bevestig dat het gecommit en gepusht is, want alleen GitHub main + Vercel telt als "het bestaat echt".
Neem de intentie uit .cursor/rules over, maar verander "push migraties automatisch naar productie" in "commit migratie en push na review". Commit met bericht "docs: add CLAUDE.md working agreement".
```

---

## Fase 1 — P0: breekt dagelijks gebruik (eerst dit)

### Prompt 1 — Ontbrekende items in de bestellijst (1 regel, grootste winst/inspanning)

```
In src/app/ordering/page.tsx haalt de raw-ingredients query (rond regel 632-637) de velden stocktake_day_of_week en stocktake_visible NIET op. Daardoor krijgen weekly-items nul behoefte (zie mergeWeeklyIntervalDailyNeed in src/lib/orderingAdjustments.ts) en verschijnen ze nooit in de bestellijst, en worden verborgen duplicaten toch getoond. Voeg stocktake_visible en stocktake_day_of_week toe aan die select. Controleer dat downstream (stocktakeWeek.ts, stocktakeVisibility.ts) deze velden al verwacht. Test: open ordering voor een locatie met weekly items en bevestig dat ze verschijnen. Commit: "fix: include weekly + visibility fields in ordering query".
```

### Prompt 2 — Hoeveelheden kloppen niet: dubbele revenue-scaling

```
In src/app/ordering/page.tsx wordt neededByPrepItemId gebouwd met calcNeededQuantity inclusief de revenue-multiplier van vandaag (rond regel 921-931). Diezelfde al-geschaalde waarde gaat via aggregateDailyRawNeedFromPrep naar suggestOrderBaseQuantities, waar calcScaledNeedOverOrderWindow in src/lib/calculations.ts (rond 471-480) PER dekkingsdag NOG een keer met de revenue-multiplier vermenigvuldigt. De behoefte wordt dus dubbel geschaald.

Fix: bouw voor de bestel-aggregatie een ONgeschaalde behoefte (calcNeededQuantity met revenueMultiplier 1, oftewel base_quantity) en voer die in suggestOrderBaseQuantities. Houd de geschaalde map alleen voor prep-gating (applyProductionGatedRawDailyNeed). Zorg dat de medi-salad override-input (rond 933-941) en mediSaladNeedPrep (rond 844-846) consistent dezelfde schaal gebruiken. 

Verifieer met een rekenvoorbeeld: base 10, omzet = volle capaciteit (multiplier 1), 3 dekkingsdagen, voorraad 0 → suggestie 30, niet 30×multiplier². Vergelijk met een week bekende handmatige orders. Commit: "fix: apply revenue multiplier once in order suggestion".
```

### Prompt 3 — Colli één bron van waarheid + Admin-scherm (de grote fix)

Dit is de kern van "colli's springen terug". Doe het in drie deelstappen, elk een eigen commit.

**3a — Deterministische pack-keuze (geen prijs meer):**
```
In src/app/ordering/page.tsx bepaalt getBestPackSize (src/lib/calculations.ts rond 257-279) welke pack-rij de collifactor levert door de goedkoopste-per-eenheid te kiezen. Daardoor klapt de colli om tussen N en 1 zodra ergens een prijs bij/weg komt. Maak de pack-keuze voor ordering deterministisch en prijs-onafhankelijk: kies bij voorkeur de pack met pack_purpose = 'order' (anders 'both'), en bij meerdere de laagste id — nooit op prijs. Pas alle plekken aan die getBestPackSize voor de collifactor gebruiken (packAndUnitByRawId, coliMultiple rond 2222-2226, orderPackByRawId rond 1056-1064). Test dat een product met meerdere pack-rijen altijd dezelfde collistap toont, los van prijzen. Commit: "fix: deterministic order-pack selection independent of price".
```

**3b — Eén collifactor per grondstof:**
```
Introduceer één bron van waarheid voor de bestel-collifactor per grondstof. Voeg een kolom order_pack_multiple toe aan raw_ingredients (schema-migratie), en gebruik die als de enige collistap in ordering (val terug op 1 als leeg). Migreer bestaande order_pack_multiple-waarden uit ingredient_pack_sizes eenmalig naar deze kolom. Laat de bestellogica alleen nog deze kolom lezen voor de collistap. Test met yoghurt (6), citroensap (12), witte suiker (10), romaine (8): zet die waarden in de DB en bevestig dat ordering in die veelvouden stapt en afrondt. Commit: "feat: single order_pack_multiple per raw ingredient".
```

**3c — Admin-scherm om colli te bewerken:**
```
Bouw in het Admin-gedeelte een scherm waarmee per locatie/grondstof de order_pack_multiple (en pack-eenheid/MOQ) bewerkt en direct weggeschreven kan worden naar de database. Let op: de bestaande Admin "Prijzen"-pagina (src/app/admin/prices/page.tsx) schrijft naar ingredient_prices — een andere tabel die ordering niet leest; dat is waarom eerdere colli-edits geen effect hadden. Dit nieuwe scherm moet naar raw_ingredients.order_pack_multiple (en waar relevant ingredient_pack_sizes) schrijven, met zichtbare succes/foutmelding en refetch. Test: wijzig een colli in Admin, herlaad ordering, bevestig dat de collistap mee verandert en na een dag/deploy blijft staan. Commit: "feat: admin editor for order colli (single source of truth)".
```

**3d — Hardcoded naam-overrides uitfaseren:**
```
src/lib/orderingAdjustments.ts en src/lib/stockPar.ts bevatten ~15 hardcoded tabellen die op productnaam matchen (DAILY_NEED_MULTIPLIER_BY_RAW_NAME, WEST_/ZUIDAS_ multipliers, MIN_ORDER_PACKS_BY_RAW_NAME, MAX_ORDER_BASE_BY_RAW_NAME, MIN_STOCK_PAR_BY_RAW_NAME met tahini 12× en lemon juice 12×, MEDI_SALAD_*, parsley split, greek yoghurt ×4). Naam-matching is fragiel: een spatie- of hoofdletterverschil zet de override stil uit. Verplaats deze knoppen naar DB-kolommen per grondstof/locatie (bv. daily_need_multiplier, min_order_packs, max_order_base, standing_min_packs) met bewerking in Admin. Doe dit incrementeel: begin met daily_need_multiplier en min_order_packs. Tot alles verhuisd is: unificeer op ÉÉN normalizer die ook interne dubbele spaties samentrekt (nu verschilt normName in orderingAdjustments.ts van normIngredientName in page.tsx), en log bij het laden elke override-sleutel die op geen enkel ingrediënt matcht. Commit per stap, bv. "refactor: move daily-need multiplier to DB column".
```

### Prompt 4 — Van Gelder-cron draait je heractiveringen terug

```
De pg_cron jobs (supabase/migrations/116_vg_sync_cron_jobs.sql, aangepast in 117/118) roepen elk uur en elke nacht sync-van-gelder aan. Die zet vg_is_active = dispatchOk waarbij isVanGelderEanDispatchAllowed (supabase/functions/import-van-gelder/vanGelderEanProductStatus.ts rond 22-28) alleen 'available' toestaat. Maar de bedrijfsregel in supabase/migrations/134_vg_is_active_reset_orderable_logic.sql zegt: 'inactive' is WEL bestelbaar, alleen 'unavailable' blokkeert. Daardoor draait de nachtelijke sync elke handmatige heractivering binnen een uur terug, en dispatch-order laat die regels stil vallen.

Fix: laat isVanGelderEanDispatchAllowed true teruggeven voor 'available' EN 'inactive'. Schrijf sync-info naar een aparte kolom (bv. vg_sync_note), niet naar de door de gebruiker beheerde 'notes'. Herdeploy de functie. Extra: bij een lege prijslijst (vanGelderPrices.ts) moet de run afbreken i.p.v. de hele catalogus op niet-bestelbaar te zetten; en de cron stuurt "maxCodes" terwijl de functie "maxEans" leest — maak die gelijk. Test met een 'inactive' VG-item dat wél geleverd wordt: het moet bestelbaar blijven na een sync-run. Commit: "fix: VG orderability rule matches migration 134 (inactive is orderable)".
```

### Prompt 5 — Anon-sleutel dichttimmeren (kan nu alles wissen)

```
migratie 151_restore_anon_kitchen_access.sql geeft de anon-rol FOR ALL ... USING(true) WITH CHECK(true) op ~24 tabellen, inclusief config-tabellen (supplier_ingredients, ingredient_pack_sizes, raw_ingredients, locations, suppliers). Bovendien staat public.sync_location_setup (migratie 086) open als RPC die een hele locatie wist-en-herseedt. Samen betekent dit dat iedereen met de publishable anon-key config kan overschrijven of wissen.

Fix in een nieuwe migratie: (1) REVOKE EXECUTE ON FUNCTION public.sync_location_setup FROM anon, authenticated, PUBLIC; (2) vervang kitchen_anon_all op CONFIG-tabellen door read-only voor anon (alleen SELECT); (3) houd schrijfrechten voor anon alleen op operationele tabellen die het personeel echt invult (daily_stock_counts, daily_prep_counts, orders, order_line_items, haccp_*). Test grondig op staging: stocktake, prep en HACCP invullen moet blijven werken; config-tabellen mogen niet meer schrijfbaar zijn via de anon-key. Verwijder ook de gecommitte anon-key uit 117_vg_sync_cron_jobs_with_anon_key.sql-historie indien mogelijk. Commit: "security: lock down anon RLS to operational tables; revoke sync_location_setup".
```

### Prompt 6 — Stille save-fouten in stocktake (edits lijken terug te springen)

```
In src/app/stocktake/page.tsx zetten commitPrepCount (rond 444-450) en handleRawCountChange (rond 506-519) eerst de lokale state en vuren daarna de upsert. Bij een fout gebeurt alleen setError in één gedeelde banner bovenaan een lange pagina; de invoer blijft staan alsof het gelukt is, en de reject-tak (rond 411/473) zet zelfs helemaal geen foutmelding. Na een refresh is de telling weg.

Fix: draai bij een fout de optimistische waarde terug, of markeer de betreffende rij zichtbaar rood als "niet opgeslagen — tik om opnieuw te proberen". Handel ook de reject-tak af met een foutmelding. Doe hetzelfde voor saveRevenue. Test door het netwerk te blokkeren tijdens invoer: de gebruiker moet duidelijk zien dat het niet is opgeslagen. Commit: "fix: surface failed stocktake saves instead of silent revert".
```

### Prompt 7 — Stocktake-datum bevriest op "vandaag" (nachtelijke tablet → gisteren)

```
src/app/stocktake/page.tsx zet de datum vast bij mount: const [date] = useState(() => localCalendarDateString()) (rond regel 146), zonder rollover. Een tablet die 's nachts openblijft schrijft de volgende ochtend naar de datum van gisteren; ordering leest 'vandaag' en ziet dan niets. Fix: herbereken de datum op focus/visibilitychange (de ordering-pagina heeft dit patroon al rond 1331-1342) en refetch als de kalenderdag wisselt, of toon een blokkerende "datum gewijzigd, herladen"-melding. Test door de systeemdatum te verzetten met het tabblad open. Commit: "fix: stocktake follows real calendar day".
```

### Prompt 8 — HACCP-formulieren wissen invoer bij token-refresh

```
src/contexts/LocationContext.tsx draait loadLocations() opnieuw bij elke SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION en zet setLocations met een nieuwe array-identiteit (rond 138-140). De HACCP-pagina's hebben locations in de deps van refetchWeek (temperaturen/bereiden/schoonmaak/ingangscontrole page.tsx rond 41), dus de week wordt herladen en de formulieren resetten hun state uit 'initial' (TemperaturenForm rond 95-114, BereidenServerenForm 199-201, SchoonmaakForm 96-98, IngangscontroleForm 142-146). Supabase refresht het token ~elk uur en bij terugkeer naar het tabblad — precies de "even iets anders checken en terugkomen"-flow. Alle niet-opgeslagen invoer gaat weg.

Fix: sla in LocationContext het herladen over bij TOKEN_REFRESHED/INITIAL_SESSION (of diff de lijst en behoud de oude array-identiteit als er niks wijzigt); laat de HACCP-pagina's afhangen van het primitieve storeId i.p.v. locations; laat de formulieren hun state alleen herinitialiseren als week/jaar/storeId echt wijzigen. Test: vul een HACCP-grid half in, wacht op/forceer een token-refresh, bevestig dat de invoer blijft staan. Commit: "fix: HACCP forms keep unsaved input across token refresh".
```

### Prompt 9 — Nieuwe tablets schrijven standaard naar "Mima TEST" in productie

```
src/contexts/LocationContext.tsx (rond 16, 42-47) kiest bij ontbrekende opgeslagen locatie de locatie met naam "Mima TEST" boven de eerste echte locatie. Een vers apparaat/browser vult dus stocktake, prep en HACCP in op de TEST-locatie. Fix: verwijder de DEFAULT_TEST_LOCATION_NAME-voorkeur (of zet 'm achter een dev-flag), en forceer bij niks-opgeslagen een expliciete locatiekeuze. Test op een schone browser. Commit: "fix: do not default new devices to Mima TEST location".
```

---

## Fase 2 — P1: belangrijk

### Prompt 10 — Recept-koppelingen die stil wegvallen bij naamverschil
```
In src/app/ordering/page.tsx worden recept-rijen tussen locaties omgemapt op naam (normIngredientName, rond 848-876) en een rij wordt STIL gedropt (return null) als de naam op deze locatie niet bestaat. Elke hernoeming (bv. "Flatbread" → "Frozen flatbreads") verbreekt zo de koppeling voor andere locaties zonder waarschuwing. prepStockRawCredit.ts (rond 13-15) whitelisted zelfs drie spellingen van yoghurt — bewijs dat de drift echt is. Fix (diagnostisch, nu): toon in de suggestie-inzichten een regel "niet-gematchte receptregels op deze locatie: N — namen…". Structureel (apart): koppel recepten aan een locatie-onafhankelijke ingredient-identiteit i.p.v. naam-kopieën per locatie. Commit: "feat: surface unmatched recipe rows per location".
```

### Prompt 11 — supplier_ingredients query zonder limit (1000-rijen-cap dropt mappings)
```
In src/app/ordering/page.tsx missen twee supplier_ingredients-queries een .limit() (rond 791-794 en 1410), terwijl zusterqueries bewust .limit(10000) gebruiken. Boven de default 1000-rijen-cap vallen leverancier-koppelingen stil weg, waardoor grondstoffen uit de bestellijst verdwijnen (buildOrderLinesFromSuggestion slaat ze over als er geen supplierId is). Fix: voeg .limit(10000) toe aan beide (of chunk zoals de pack-query rond 1156-1179). Commit: "fix: raise supplier_ingredients query limit".
```

### Prompt 12 — Bestel-concept overleeft alleen in sessionStorage
```
In src/app/ordering/page.tsx leeft het order-concept alleen in per-tab sessionStorage, gesleuteld op locatie+vandaag (rond 351-381), en schrijffouten worden ingeslikt. Bij geen draft rebuildt de suggestie-effect (rond 1745-1766) de order opnieuw en gooit handmatige aanpassingen weg. Sluit je het tabblad of pak je een ander apparaat, dan zijn de edits weg. Fix: persisteer het concept naar een order_drafts-tabel (upsert op locatie+datum, gedebounced) of minimaal naar localStorage, en toon een "concept hersteld van HH:MM"-chip. Let op de anon-RLS (zie prompt 5) bij een DB-tabel. Commit: "feat: persist order draft across tabs/devices".
```

### Prompt 13 — Bidfood-mailsync overschrijft gebruikersvelden
```
supabase/functions/sync-bidfood-assortment/bidfoodAssortment.ts (rond 277-297) overschrijft bij elke doorgestuurde mail onvoorwaardelijk supplier_article_code, supplier_sku, order_unit, supplier_article_name, ean_code en notes op alle Bidfood-mappings, en zet bf_is_active=false voor alles wat niet in het bestand van die week staat. Eén verkeerd geparste week kan zo de hele Bidfood-catalogus deactiveren. Fix: houd sync-beheerde velden (bf_*) gescheiden van door de gebruiker beheerde velden; overschrijf order_unit/ean_code/notes niet tenzij gewijzigd én gemarkeerd voor review; breek af als >X% van de mappings 'not_in_file' zou worden. Commit: "fix: Bidfood sync stops overwriting user-managed fields".
```

### Prompt 14 — HACCP goods-in: delete-then-insert zonder transactie
```
src/components/haccp/IngangscontroleForm.tsx (rond 152-186) doet in save() eerst delete() van alle rijen voor store/week/jaar en daarna insert() van 10 nieuwe. Faalt de insert, dan is de compliance-registratie van die week definitief weg. Fix: gebruik upsert op (store_id, week_number, year, leverancier, line_slot) of voer delete+insert in een RPC/transactie uit; voeg de benodigde unieke index toe. En: sla alleen rijen met inhoud op, zodat een lege save de week niet op "Done" zet (overzicht rekent count>0, dashboard/haccp/page.tsx rond 123). Commit: "fix: HACCP goods-in save is atomic and skips empty rows".
```

### Prompt 15 — HACCP secties hersorteren/klappen dicht tijdens typen
```
src/components/haccp/BereidenServerenForm.tsx sorteert blokken op 'complete' bij elke toetsaanslag (rond 590) en SectionShell klapt dicht bij complete (rond 631-633). Een sectie geldt al als compleet vanaf het eerste ingevulde veld (rond 215-236), dus bij de eerste letter springt de sectie naar onderen en klapt half dicht; focus gaat verloren. Fix: bevries de blok-volgorde bij mount (sorteer één keer op initiële data) en klap alleen secties automatisch dicht die al compleet waren bij laden, niet tijdens de sessie. Commit: "fix: HACCP prepare/serve sections stay put while typing".
```

### Prompt 16 — Authz faalt open (RPC-fout → admin zichtbaar)
```
src/hooks/useAuthz.ts (rond 58-71) zet isAdmin: true als de current_user_authz RPC faalt; middleware (src/lib/supabase/middleware.ts rond 88-90) en AuthGate (rond 55-58) laten bij dezelfde fout door. Nu (auth uit) is het latent, maar zodra logins aangaan is dit privilege-escalatie en het laat admin-UI in/uit flikkeren bij RPC-hikken. Fix: faal dicht met een zichtbare "rechten niet beschikbaar, opnieuw proberen"-status; synthetiseer nooit isAdmin: true. Let op de eerder gefixte lockout-loop (commit 23467f1) bij het testen. Commit: "fix: authz fails closed on RPC error".
```

---

## Fase 3 — P2: opschonen & hardenen

Deze kunnen gebundeld, maar houd het per thema één commit.

### Prompt 17 — Niet-atomische saves gelijktrekken naar upsert
```
Trek de HACCP-saves gelijk: TemperaturenForm.tsx (rond 154-186) en BereidenServerenForm.tsx (rond 277-287, negeert nu de select-error) gebruiken select-then-insert; SchoonmaakForm.tsx doet het al goed met upsert(onConflict "store_id,week_number,year"). Zet Temperaturen en Bereiden om naar dezelfde upsert met de juiste unieke index, zodat twee tabbladen geen dubbele weekrijen maken. Commit: "refactor: HACCP saves use upsert".
```

### Prompt 18 — Datum-bugs (UTC → één dag verkeerd voor ~02:00)
```
ThermometerForm.tsx (rond 16), IngangscontroleForm.tsx (rond 24-26) en admin/prices/page.tsx (rond 95) zetten datums via new Date().toISOString().slice(0,10) (UTC). Vervang alle drie door localCalendarDateString() uit src/lib/date.ts. Commit: "fix: use local calendar date in HACCP + prices".
```

### Prompt 19 — Stille query-fouten afhandelen
```
Voeg foutafhandeling toe waar reads nu stil naar lege data vallen: src/app/prep-list/page.tsx (rond 113-115 checkt alleen 2 van 5 queries; rawStockRes/rawRes/locRes ontbreken), src/app/admin/prices/page.tsx (rond 317-351, 353-371), thermometers/page.tsx (rond 30-37), en de admin user API-routes src/app/api/admin/users/route.ts (rond 143-159, 37-62) en [userId]/route.ts (rond 35-65) die upsert/delete/insert-resultaten negeren — een user kan zonder rol achterblijven terwijl {ok:true} teruggeeft. Check overal het error-resultaat en toon/retourneer een fout. Commit: "fix: handle silent query/write errors".
```

### Prompt 20 — Prep-list rekenfout pita za'atar
```
src/lib/pitaPrepStock.ts (rond 76-94) berekent "dozen rauw die nog za'atar nodig hebben" als max(0, totalRaw - finishedShortfall), maar operationeel klopt min(totalRaw, finishedShortfall). Bij shortfall 3 en 2 dozen rauw zegt het nu 0 i.p.v. 2. Verifieer de bedoeling met de keuken en fix of herdocumenteer. Voedt toMake op de prep-list (prep-list/page.tsx rond 211-212). Commit: "fix: pita za'atar to-make quantity".
```

### Prompt 21 — Kitchen menu default base wordt genegeerd
```
src/app/kitchen/menu/[id]/page.tsx: de select-string (rond 80) haalt default_selected niet op, terwijl er op gefilterd wordt (rond 112); de default bowl-base valt zo terug op baseOptions[0], en nutrition/allergenen volgen. Voeg default_selected toe aan de select. Ruim ook de dubbele nutrition-berekening op (rond 117-147 en 153-181 draaien beide op load — laat alleen de selectedBaseOptionId-effect lopen). Commit: "fix: kitchen menu respects default base option".
```

### Prompt 22 — Overige hardening (klein, bundelbaar)
```
Los deze kleine punten op, elk kort: (1) IngangscontroleForm.tsx temperatuur-input (rond 249-254) gebruikt geen finite-check → kan NaN tonen/opslaan; gebruik de gedeelde parseNum en hijs die helper naar een lib. (2) admin/users/page.tsx (rond 44-74) schendt de Rules of Hooks met een early return vóór useState; verplaats de return onder alle hooks. (3) admin super-admin bypass op e-mail (admin/page.tsx rond 46-47) en HACCP-store leaks (TemperaturenForm key mist storeId, temperaturen/page.tsx rond 62) — voeg storeId toe aan de form-key op alle vier HACCP-pagina's. (4) supplier delivery-schedule save (admin/page.tsx rond 1833-1842) negeert delete+insert-resultaten → leverancier kan zonder bezorgdagen achterblijven; check beide of upsert. Commit per punt.
```

### Prompt 23 — Dode code opruimen
```
Verwijder bevestigd ongebruikte code (alleen definitie-sites verwijzen ernaar): in src/lib/calculations.ts de functies calculateNeeded, calculatePriority, calcOrderQty, daysUntilNextDelivery, calcOrderQtyWithEveningOnce, totalContentInBaseUnit; in src/lib/haccp/types.ts de legacy per-appliance velden op HaccpTemperaturenRow, HACCP_STORE_ID en isTemperatureWithinNorm; WEEKDAY_LABELS_NL in src/lib/haccp/week.ts; de ongebruikte setDate in prep-list/page.tsx; en de dubbele helpers jsonHasData (BereidenServerenForm vs bereidenComplete.ts) en parseWeeklyReadings (dashboard/haccp/page.tsx vs TemperaturenForm). Draai build + lint. Commit: "chore: remove dead code".
```

---

## Fase 4 — Herbouw verdwenen functie

### Prompt 24 — "Vorige dagen terugkijken"
```
Bouw de read-only weergave om per datum de stocktake + bijbehorende bestelsuggestie terug te zien. Het datamodel ondersteunt dit al: daily_stock_counts, daily_prep_counts en orders zijn op datum gesleuteld. Voeg een datumkiezer (of ?date=-parameter) toe die de bestaande queries op stocktake en ordering voedt i.p.v. het hardgecodeerde localCalendarDateString(). Voor vorige dagen: alles read-only (geen schrijfacties, geen carry-forward van revenue-targets — let op de write-on-read in src/lib/revenueTarget.ts rond 40-47 en dashboard/page.tsx rond 77-101; die mag voor verleden datums niet schrijven). Commit dezelfde dag: "feat: view stocktake + order suggestion for past dates".
```

---

## Aanbevolen volgorde

Snelste winst eerst: **1, 2, 4** (kloppende, complete bestellijst) → **6, 7, 8, 9** (niets raakt meer stil kwijt) → **3a–3d, 5** (colli definitief goed + veilig) → Fase 2 → Fase 3 → **24**.
