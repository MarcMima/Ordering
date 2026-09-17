-- Non-food op par i.p.v. "één verpakking per week" (feedback De Pijp, 17 sept 2026).
--
-- Tot nu toe kreeg elk non-food-artikel zonder receptverbruik een aangenomen verbruik van
-- 1 verpakking per order_interval_days (mergeWeeklyIntervalDailyNeed). Sinds 17-09 slaat die
-- fallback non-food over; non-food wordt alleen nog via de par-regel voorgesteld. Artikelen
-- zonder par zouden dan nooit meer verschijnen, vandaar deze standaard:
--   stock_par_kind = 'packs', stock_par_min_packs = 1, stock_par_order_packs = 1
-- = pas voorstellen als er minder dan één volle verpakking ligt, en dan één verpakking.
--
-- Raakt alleen non_food-rijen waar nog géén par op staat (oude waarde: alle drie NULL).
-- Bestaande pars (Garbage bags: min 1, order NULL) blijven ongemoeid. Idempotent.

BEGIN;

UPDATE raw_ingredients
SET stock_par_kind        = 'packs',
    stock_par_min_packs   = 1,
    stock_par_order_packs = 1,
    updated_at            = now()
WHERE item_kind = 'non_food'
  AND stock_par_kind IS NULL
  AND stock_par_min_packs IS NULL
  AND stock_par_order_packs IS NULL;

COMMIT;

-- Controle: verwacht per locatie 0 non-food zonder par.
SELECT l.name AS locatie,
       count(*) FILTER (WHERE r.stock_par_kind IS NULL) AS non_food_zonder_par,
       count(*) AS non_food_totaal
FROM raw_ingredients r
JOIN locations l ON l.id = r.location_id
WHERE r.item_kind = 'non_food'
GROUP BY l.name
ORDER BY l.name;
