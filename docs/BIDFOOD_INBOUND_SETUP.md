# Bidfood assortiment: mail doorsturen → automatische sync

Wekelijks stuurt Bidfood een Excel (**Type 03**, sheet met artikelbericht) naar `integratie-klant@bidfood.nl`.  
Na eenmalige setup hoef je alleen die mail **door te sturen**; de rest gebeurt automatisch.

## Wat er gebeurt

1. Gmail (of je mailclient) stuurt de Bidfood-mail door naar een **Resend inbound**-adres.
2. Resend roept de edge function **`bidfood-inbound-email`** aan.
3. De bijlage (`.xlsx`) wordt gedownload en verwerkt door **`sync-bidfood-assortment`**:
   - Alleen bestaande Bidfood-koppelingen in `supplier_ingredients` worden bijgewerkt.
   - Uit assortiment (`Voorraadcode = 2`) → waar mogelijk **automatisch vervangen** door vervangend artikelnummer uit het bestand.
   - Anders: regel gemarkeerd als inactief; bestellen via de app wordt geblokkeerd voor die regel.
4. Je krijgt alleen een **rapport-mail als er iets handmatigs nodig is** (inactief, niet in bestand, of fout). Alles OK = geen mail.

## Eenmalige setup (±15 min)

### 1. Resend Inbound

1. [Resend Dashboard](https://resend.com) → **Domains** → `mimafood.nl` (of je domein).
2. **Receiving** inschakelen en MX-records zetten zoals Resend aangeeft (als dat nog niet staat).
3. Maak een receiving-adres, bijv. `bidfood-assortment@mimafood.nl`.

### 2. Resend Webhook

1. **Webhooks** → nieuwe webhook.
2. Event: **`email.received`**.
3. URL (vervang `PROJECT_REF`):

   `https://PROJECT_REF.supabase.co/functions/v1/bidfood-inbound-email`

4. Kopieer het **webhook signing secret** → Supabase secret `RESEND_WEBHOOK_SECRET`.

### 3. Supabase secrets

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
supabase secrets set BIDFOOD_SYNC_REPORT_TO=abdulhadi@mimafood.nl
# optioneel, voor handmatige test zonder Svix:
supabase secrets set BIDFOOD_INBOUND_SECRET=<random-string>
```

`FROM_EMAIL` (bijv. `ordering@mimafood.nl`) staat waarschijnlijk al voor order-mails.

### 4. Database + functions deployen

```bash
supabase db push --yes
supabase functions deploy bidfood-inbound-email --no-verify-jwt
supabase functions deploy sync-bidfood-assortment
supabase functions deploy dispatch-order
```

Migratie **124** voegt o.a. `bf_is_active` en `bidfood_assortment_runs` toe.

### 5. Gmail doorsturen

In Gmail (account dat `integratie-klant@bidfood.nl` ontvangt, of een alias):

1. **Instellingen** → **Filters en geblokkeerde adressen** → nieuw filter.
2. Van: `integratie-klant@bidfood.nl` (of `bidfood.nl`).
3. Onderwerp bevat: `assortiment` (optioneel, extra veilig).
4. Actie: **Doorsturen naar** → `bidfood-assortment@mimafood.nl`.

Je kunt ook elke week handmatig **Doorsturen** doen naar dat adres; het filter is alleen gemak.

## Jouw wekelijkse routine

1. Bidfood-mail binnen → niets doen als het filter draait.  
   Of: open mail → **Doorsturen** naar `bidfood-assortment@mimafood.nl`.
2. Binnen een paar minuten: rapport-mail als er iets handmatigs nodig is.
3. Anders: klaar. Codes en “actief”-status staan in de database.

## Handmatig testen (zonder echte inbound-mail)

Met base64 van het XLS-bestand:

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/sync-bidfood-assortment" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"xlsx_base64":"...","dry_run":true}'
```

Of inbound simuleren (als `BIDFOOD_INBOUND_SECRET` staat):

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/bidfood-inbound-email" \
  -H "Content-Type: application/json" \
  -H "x-bidfood-inbound-secret: $BIDFOOD_INBOUND_SECRET" \
  -d @test-webhook-payload.json
```

## Veelgestelde vragen

**Worden nieuwe MIMA-producten automatisch toegevoegd?**  
Nee. Alleen bestaande Bidfood-mappings worden bijgewerkt. Nieuwe artikelen eerst koppelen in Admin (zoals na de Excel-review).

**Wat als alles OK is?**  
Je krijgt een korte mail met onderwerp `… all OK` of alleen bij issues (afhankelijk van rapport-inhoud).

**Bestellen met inactieve code?**  
`dispatch-order` slaat die regels over en mailt de locatie-manager als de rest van de order wel doorging.
