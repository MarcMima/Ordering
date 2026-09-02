# Werkafspraken — Mima Ordering app

Dit is een **live productie-app** (Next.js 16 + Supabase, deploys van GitHub `main` via Vercel). Houd je aan deze afspraken bij elke taak.

## Git & werk-veiligheid
- **Commit na elke werkende wijziging en push meteen.** Nooit werk lang ongecommit laten staan. Eén logische wijziging = één commit, met een duidelijke boodschap.
- Werk bij grotere klussen op een **branch per klus**; open een PR i.p.v. direct naar `main` te pushen, zodat er een Vercel preview is om te controleren.
- Een feature geldt pas als "af" als het gecommit én gepusht is. Localhost telt niet; GitHub `main` + Vercel is de enige echte test.
- Draai `npm run build` en `npm run lint` vóór elke commit.

## Database & config
- **Config (colli, pack sizes, prijzen, MOQ, leveranciers-instellingen) hoort in de database via Admin-schermen — NIET in nieuwe SQL-migraties.** Migraties zijn alleen voor schema-wijzigingen.
- **Uitzondering — eenmalige databronsanering.** Een grote, eenmalige correctie of import van feitelijke basisdata (yields, receptregels, verpakkingskoppelingen, ontbrekende menu-items) mag wél als migratie, omdat die niet handmatig via de Admin-schermen te doen is. Voorwaarden: idempotent (`if not exists` / `not exists`), één transactie, de oude waarde en de reden vastgelegd in het bestand of in een `*_note`-kolom, en een controle-`select` aan het eind. Terugkerende config blijft in de Admin-schermen. Zie migraties 212 en 213 als voorbeeld.
- Draai **nooit** `supabase db push`, `supabase functions deploy` of migraties tegen productie zonder expliciete bevestiging van Marc. Schrijf de bestanden wel, maar stop en vraag het voordat je ze uitrolt.
- `supabase db reset` is verboden (wist data).

## Overig
- UI-tekst is Engels.
- Bij een vastgelopen dev-server: `npm run dev:clean` (zie `docs/DEV_SERVER_LOCK.md`).

## Context & systeemlandschap
- Het grote plaatje van alle Mima-systemen (deze app, het mima-data-warehouse, de Plaud→Notion-meetingpijplijn, website 2.0) staat in Notion: Second Brain → Afdelingen → Systems → "Systeemlandschap — Mima". Lees dat bij twijfel over wat waar hoort.
- Deze repo bevat naast de app óók de automatiseringen `/api/plaud-webhook` (meetingpijplijn) en `/api/meeting-reminders` — wees daar voorzichtig mee bij refactors van de api-routes.
- Het datawarehouse (`MarcMima/mima-data`, Supabase `mima-data`) is bewust een apart systeem: deze app schrijft de operatie, het warehouse leest en analyseert. Analyse-features horen dáár, operationele features hier.
- Einde sessie: landschap of werkwijze veranderd → Systeemlandschap-pagina bijwerken en `/brein-oogst` draaien.
