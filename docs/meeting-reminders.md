# Meeting-reminders (mails vast aan de Mima-meetings)

Endpoint `GET /api/meeting-reminders` stuurt de voorbereidings-mails die aan de meeting-ritmiek vastzitten. Vercel Cron roept het aan; alle datum-logica zit server-side in Europe/Amsterdam. Geen losse scheduler of connector nodig, verzending via Resend (zelfde conventie als `plaud-webhook`).

## De drie reminders

| # | Wanneer | Naar | Inhoud |
|---|---------|------|--------|
| 1 | **Elke vrijdag, 16:00** (14:00 UTC) | Team (Marc, Michiel, Hadi) | "Update/klik je MMMM to-do's weg vóór de weekly maandag." |
| 2 | **Elke dinsdag, ~09:00** (07:00 UTC) | Team* | "MMMM is verwerkt — loop je *Drafts for review* na en pas aan waar nodig." |
| 3 | **De maandag 8 dagen (een week + een dag) vóór de MMM** | Team | "MMM (eerste dinsdag v/d maand) komt eraan — update je data en bereid voor." |

\* Reminder 2 gaat standaard naar het hele team (iedere owner loopt zijn eigen drafts na). Alleen Marc laten cureren? Zet `DRAFTS_REVIEW_RECIPIENTS = [MARC]` bovenin `route.ts`.

De MMM is in de agenda de **eerste dinsdag van de maand** (1 sep, 6 okt, 3 nov, 1 dec …). De endpoint rekent "eerste dinsdag − 8 dagen" zelf uit; verschuif je de meeting, dan blijft de regel kloppen zolang het de eerste dinsdag is. Wijkt de MMM structureel af, pas dan `firstTuesday`/`preMMMTarget` aan.

Alle mail is **Engelstalig** — Hadi (Operations) leest mee.

## Deploy

1. Voeg toe aan `MarcMima/Ordering` (origin/main): `src/app/api/meeting-reminders/route.ts` en `vercel.json` (of pas de meegeleverde patch toe).
2. Zet in Vercel → Project → Settings → Environment Variables (Production):
   - `CRON_SECRET` = een lange random string. Vercel Cron stuurt die automatisch mee als `Authorization: Bearer <CRON_SECRET>`; de endpoint weigert (401) zonder.
   - `RESEND_API_KEY` en `FROM_EMAIL` — bestaan al (gebruikt door `plaud-webhook`). Niets te doen.
   - Optioneel `TASKS_DB_URL` — link naar de Tasks-DB in de mail (default staat al goed).
3. Commit + push → Vercel deployt en registreert de crons uit `vercel.json` automatisch.

> Vercel Cron: `vercel.json` staat op 2 cron-entries (Hobby-limiet = 2). Op Pro kun je desgewenst per reminder een eigen tijd nemen.
> Zomer-/wintertijd: crons draaien op UTC. In de winter (CET) verschuift de vrijdag-mail naar 15:00 en de ochtend-mails naar 08:00 lokaal. Voor exact 16:00 in de winter: zet `0 15 * * 5`.

## Testen (zonder tot vrijdag te wachten)

```
curl "https://ordering-alpha.vercel.app/api/meeting-reminders?secret=<CRON_SECRET>&test=preMMMM"
```

`test`-waarden: `preMMMM` | `postMMMM` | `preMMM`. Forceert die ene mail (echt verstuurd naar het team), ongeacht de datum — puur om verzending/deliverability te checken. Haal de test-call weg zodra het werkt.

Een gewone call zonder `test` (`?secret=…`) stuurt alleen wat vandaag daadwerkelijk aan de beurt is — op een niet-matchende dag dus niets.
