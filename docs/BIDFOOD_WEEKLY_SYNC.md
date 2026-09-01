# Bidfood weekly assortment sync (Gmail route)

Bidfood mails the complete customer assortment (Type 03 artikelbericht, `.xlsx`)
to `marc@mimafood.nl` every **Sunday around 21:45**. This is how that file ends
up in the app without anyone touching it.

```
Gmail (marc@mimafood.nl)
   │  Google Apps Script, Monday ~07:00
   ▼
POST /functions/v1/bidfood-gmail-sync      (x-api-token: shared token)
   │  base64 of the .xlsx
   ▼
runBidfoodAssortmentSync()                 (supabase/functions/sync-bidfood-assortment/bidfoodAssortment.ts)
   ├── supplier_ingredients : bf_is_active, bf_last_status, article code, EAN
   ├── ingredient_prices    : net price refresh (see below)
   └── bidfood_assortment_runs : one log row per run
   ▼
Report mail via Resend → marc@mimafood.nl  (only when there is something to see)
```

## What the sync changes

Only existing Bidfood mappings in `supplier_ingredients` are touched; the file
is never used to create new ingredients.

| Situation in the file | What happens |
| --- | --- |
| Article present, voorraadcode ≠ 2 | `bf_is_active = true`, article name/EAN/UOM filled in if still empty |
| Voorraadcode 2 (out of assortment) **with** a usable replacement article | Mapping is moved to the replacement code, old code kept in `bf_replacement_article_code` |
| Voorraadcode 2 **without** usable replacement | `bf_is_active = false` → `dispatch-order` refuses to order that line |
| Article not in the file at all | `bf_is_active = false` + reported ("add to the Bidfood order list or remove the mapping") |

Safety net: if fewer than 50% of the mappings match the file, the run aborts
rather than deactivating everything.

## Prices

The net price (column O, incl. customer conditions) is written to
`ingredient_prices` as a new row with `source = 'bidfood_weekly_sync'`, so the
price history stays intact and the latest row wins.

Deliberately conservative, because the pack size decides cost-per-gram:

- Only when the article number **and** UOM are unchanged — the pack size and
  label are inherited from the previous price row, only the amount changes.
- No previous price row → not written, only reported (pack size unknown).
- Auto-replaced article → not written, only reported (pack size may differ).
- Move larger than ±50% → not written, only reported.

## Report mail

Sent to `marc@mimafood.nl` (override with the `BIDFOOD_SYNC_REPORT_TO` secret)
whenever there are inactive articles, articles missing from the file, price
changes, prices that need a look, or errors. A clean week with no price moves
sends nothing.

## The Apps Script

Lives in Marc's Google account (script.google.com), file
`BidfoodAssortmentSync.gs`. It searches
`from:bidfood.nl has:attachment filename:xlsx subject:assortiment newer_than:21d`
minus the label `Bidfood-sync-done`, posts the newest `.xlsx`, and labels the
thread on success. Failures throw, so Apps Script mails Marc the error.

- `testBidfoodAssortmentDryRun()` — parse and report, no database changes
- `syncBidfoodAssortment()` — the real run (what the weekly trigger calls)
- `installWeeklyTrigger()` — (re)installs the Monday 07:00 trigger

Missed a week? The next run picks up the newest unlabelled mail; the file is a
full snapshot, so nothing is lost by skipping one.

## Auth

`bidfood-gmail-sync` is deployed with `--no-verify-jwt` and authenticates on a
shared token: the SHA-256 hash lives in `public.integration_tokens`
(name `bidfood_gmail_sync`, migration 212), the plain token sits in the Apps
Script. To rotate: generate a new token, update both the hash in the table and
the constant in the script.

## Older route (not in use)

`docs/BIDFOOD_INBOUND_SETUP.md` describes a Resend inbound-mail route to
`bidfood-inbound-email`. That function is still deployed and still works, but it
needs MX records for a receiving domain — the Gmail route above replaced it.
