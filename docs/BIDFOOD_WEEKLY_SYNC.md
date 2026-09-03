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
(name `bidfood_gmail_sync`, migration 214), the plain token sits in the Apps
Script. To rotate: generate a new token, update both the hash in the table and
the constant in the script.

## Older route (not in use)

`docs/BIDFOOD_INBOUND_SETUP.md` describes a Resend inbound-mail route to
`bidfood-inbound-email`. That function is still deployed and still works, but it
needs MX records for a receiving domain — the Gmail route above replaced it.

## Price history and the monthly report (added 01-09-2026)

`ingredient_prices` was already a full history table; the weekly sync is what
starts filling it. Two things sit on top of it:

- **`ingredient_price_stats`** (migration 215) — per ingredient x supplier: the
  current price, 4/12/52-week averages in cents per kg, the 52-week range, and
  the change versus a month ago. Averages are the mean of the recorded price
  points in the window, not time-weighted. Normalising to cents per kg keeps the
  comparison honest when a pack size changes.
- **`price-change-report`** — edge function, mailed monthly on the 1st at 06:00
  UTC by the pg_cron job `monthly_price_report` (token from Supabase Vault,
  hash in `integration_tokens` under `monthly_price_report`). It covers all
  suppliers, including manually entered prices: biggest risers and fallers,
  the products furthest from their 12-week average, and the effect on dish food
  cost.

Dish impact works off `food_cost_snapshots`: `snapshot_food_costs()` writes the
computed cost per menu item for a date, the pg_cron job
`weekly_food_cost_snapshot` runs it every Monday, and the report compares
today's snapshot with the newest one at least 20 days old. The first report has
no baseline and says so.

## Pack sizes come from the file too (02-09-2026)

The first real check of the file exposed the actual problem: prices were being
refreshed onto pack sizes inherited from the November 2025 cost model, and
several of those were wrong (20 kg for a 15 L box of oil, 25 kg for a 13,6 kg
box of rice flour, 600 g for a box of 12 × 600 g brown sugar). Column 76
"Netto Gewicht" gives the net weight of the sales unit, so price and pack now
come from the same row.

Rules:

- Pack differs more than 2% from the file → corrected, and listed in the mail
  under "Pack sizes corrected", because it moves cost per kg.
- The stored value is a COUNT, recognised by matching the sales factor and
  being under 200 (a tray of 24 cans) → left alone.
- The stored label mentions a drained weight ("uitlekgewicht", "drained") →
  left alone; that is a deliberate, lower figure (Kalamata olives: 5,2 kg gross,
  2,7 kg drained).
- No price on record yet and the file has a net weight → the file's price and
  pack are written as the first price, listed under "First price taken from the
  file".
- Deposit (statiegeld, column 78 "Emballagebedrag totaal") is ADDED to the
  price: Mima does not return the empties, so it never comes back and is part of
  the cost. A tray of 24 cola cans is EUR 18.06 + EUR 3.60 = EUR 21.66. The mail
  names the deposit on every line that carries one.

The ±50% guard now judges cost per kg instead of the price per ordered unit —
except when the pack was corrected, where it judges the unit price, since the
per-kg jump is the correction itself. Anything over the limit is reported and
not written.
