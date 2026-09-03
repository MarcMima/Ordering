# Werkafspraken — Mima Ordering app

Dit is een **live productie-app** (Next.js 16 + Supabase, deploys van GitHub `main` via Vercel). Houd je aan deze afspraken bij elke taak.

## Git & werk-veiligheid
- **Commit na elke werkende wijziging en push meteen.** Nooit werk lang ongecommit laten staan. Eén logische wijziging = één commit, met een duidelijke boodschap.
- Werk bij grotere klussen op een **branch per klus**; open een PR i.p.v. direct naar `main` te pushen, zodat er een Vercel preview is om te controleren.
- Een feature geldt pas als "af" als het gecommit én gepusht is. Localhost telt niet; GitHub `main` + Vercel is de enige echte test.
- Draai `npm run build` en `npm run lint` vóór elke commit.

## Database & config
- **Config (colli, pack sizes, prijzen, MOQ, leveranciers-instellingen) hoort in de database via Admin-schermen — NIET in nieuwe SQL-migraties.** Migraties zijn alleen voor schema-wijzigingen.
- Draai **nooit** `supabase db push`, `supabase functions deploy` of migraties tegen productie zonder expliciete bevestiging van Marc. Schrijf de bestanden wel, maar stop en vraag het voordat je ze uitrolt.
- `supabase db reset` is verboden (wist data).

## Overig
- UI-tekst is Engels.
- Bij een vastgelopen dev-server: `npm run dev:clean` (zie `docs/DEV_SERVER_LOCK.md`).

## Meetingpijplijn (Plaud → Notion)

Deze repo bevat naast de app ook `/api/plaud-webhook` en `/api/meeting-reminders`. Werking, payload en herstelstappen staan in `docs/plaud-pipeline.md` (Zapier + Plaud-watchdog via Supabase `plaud_watchdog_post`, migratie 217). Lees dat vóór je aan de webhook sleutelt.
