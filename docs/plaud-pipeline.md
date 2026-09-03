# Plaud → Notion meetingpijplijn (MMMM / MMM / QMM)

Runbook voor Marc. Stand: september 2026, na de herbouw n.a.v. de stille uitval van 2 sept.

## Ontwerpprincipes

1. **De opname is de bron, niet de AutoFlow-template.** Zonder `NEW TO-DO'S`-sectie in de summary haalt Claude de actiepunten uit het transcript.
2. **Niets faalt stil.** Elke opname van meeting-formaat (≥ 15 min) krijgt een rij in de Plaud Sync Log (Done / Failed / Ignored) en jij krijgt bij elke verwerking én elke fout een mail. Alleen korte memo's verdwijnen zonder spoor.
3. **Twee aanvoerroutes, één verwerker.** Zapier (snel, als AutoFlow vuurt) en de watchdog (dagelijks, onafhankelijk van AutoFlow). De webhook is idempotent, dus dubbel aanbieden kan geen kwaad.
4. **Positieve bevestiging.** De dinsdag-mail "MMMM processed" gaat alleen nog als de Sync Log dat bevestigt; anders krijg jij een alarm.

## Onderdelen

| Onderdeel | Waar | Rol |
|---|---|---|
| `/api/plaud-webhook` | deze repo, Vercel `ordering-alpha` | verwerker: type-detectie → meeting-record → Claude-extractie → Tasks (Drafts for review) → Sync Log → mail |
| Zapier-zap | Zapier | AutoFlow → POST `{title, create_time, transcript, summary}` met header `x-mmmm-secret` |
| Plaud-watchdog | geplande Claude-taak "Plaud-watchdog" (werkdagen 15:00) | leest Plaud via de Plaud-MCP, vraagt de webhook wat ontbreekt (`mode:"check"`), levert ontbrekende opnames aan (`source:"watchdog"`) |
| `plaud_watchdog_post` / `plaud_watchdog_response` | Supabase (migratie 217) | brug: de Claude-cloud kan geen HTTP naar Vercel, wél SQL; pg_net doet de POST met het secret uit Vault (`mmmm_webhook_secret`) |
| `/api/meeting-reminders` | deze repo, Vercel Cron | dinsdag: Sync Log-check → team-mail óf alarm; woensdag na de MMM: alarm als niets verwerkt |
| Plaud Sync Log | Notion | logboek: Status, Meeting type, Source (Zapier/Watchdog/Manual), Extraction (Template/Transcript), Plaud file ID, Duur, Note |

## Webhook-payload

```json
{
  "title": "…", "create_time": "2026-09-02T11:08:42Z",
  "transcript": "Speaker: …", "summary": "…",
  "file_id": "9ea4…", "duration_sec": 2702,
  "source": "watchdog", "meeting_type": "MMMM", "wait": true
}
```

`file_id`, `duration_sec`, `source`, `meeting_type` (override) en `wait` zijn optioneel. Zonder `wait` antwoordt de webhook direct met 202 en verwerkt hij op de achtergrond (`after()`); uitkomst zie je in de Sync Log en per mail.

Check-modus: `{"mode":"check","recordings":[{"file_id","title","create_time","duration_sec"}]}` → per opname `status: done|processing|failed|ignored|missing`.

## Beslislogica in de webhook

1. Kandidaat? `duration_sec ≥ 900` (of transcript ≥ 8000 tekens) óf summary bevat `DOMAIN UPDATES`. Anders: stil negeren (memo).
2. Al bekend? Sync Log op Plaud file ID → op Key (`sha256(create_time|title)`) → op zelfde dag + zelfde titel (legacy-rijen). Done/Processing → overslaan. Failed/Ignored → alleen opnieuw bij andere bron of expliciete `meeting_type`.
3. Type: `meeting_type`-override → regex (meeting-naam in eerste 4000 tekens, woordvolgorde-tolerant; los woord weekly/monthly/quarterly in eerste 600 tekens; titel) → Claude-classificatie. Geen management-meeting → rij **Ignored**. Management-meeting zonder type → rij **Failed** + mail.
4. Meeting-record in de juiste periode (week/maand/kwartaal, Europe/Amsterdam). Ontbreekt → **Failed** + mail.
5. Extractie: summary heeft `NEW TO-DO'S` → **Template** (1-op-1 bullets); anders **Transcript**.
6. Taken → Tasks-DB als "Drafts for review" (dedup laag 2 op Sync ID), meeting-record afronden, Sync Log **Done**, bevestigingsmail.

## Als er iets misgaat

- **Mail "niet gerouteerd / geen meeting-record / mislukt"**: lees de Note in de Sync Log-rij. Herstel meestal: vraag Claude *"draai de Plaud-watchdog voor opname X als MMM"* (override), of maak het ontbrekende meeting-record aan en laat de watchdog opnieuw draaien.
- **Dinsdag-alarm "Geen MMMM verwerkt"**: de watchdog van maandag 15:00 heeft niets gevonden of is niet gedraaid. Check of de opname in Plaud staat (gesynct?) en vraag Claude de watchdog te draaien.
- **Watchdog meldt "Plaud niet bereikbaar"**: de Plaud-connector in Claude moet opnieuw geautoriseerd worden (Claude → Connectors → Plaud).
- **Handmatig aanbieden vanuit Claude**: `select public.plaud_watchdog_post('{…payload…}'::jsonb)` via de Supabase MCP, daarna `select * from public.plaud_watchdog_response(<id>)`.
- **Secret roteren**: nieuw secret in Vercel (`MMMM_WEBHOOK_SECRET`), in Zapier (header) en in Vault: `select vault.update_secret((select id from vault.secrets where name='mmmm_webhook_secret'), '<nieuw>')`.

## AutoFlow (Plaud-app) — nu optioneel

De pijplijn hangt niet meer aan de AutoFlow-keywords; AutoFlow → Zapier is alleen nog de snelle route. Blijf de meeting-naam wel in de opening uitspreken ("Mima Monday Morning Meeting" / "Mima Monthly Meeting" / "Quarterly Mima Meeting"): de regex herkent ook varianten en verhaspelingen, maar de naam is het sterkste signaal. Samengevoegde opnames (`_merge_`) krijgen geen AutoFlow; de watchdog pakt die op.

## Bekende beperkingen

- Vercel Hobby: runtime-logs 1 uur, max 2 crons. Daarom logt de webhook alles wat telt in de Sync Log en mail, niet alleen in Vercel-logs.
- De transcript-route is minder strak dan de template-route: reken op een paar extra of te ruim geformuleerde drafts. Het reviewmoment ("Drafts for review") is de vangrail.
- De watchdog draait als Claude-taak met jouw connectors; verloopt de Plaud-autorisatie, dan mailt hij dat (en faalt niet stil).
