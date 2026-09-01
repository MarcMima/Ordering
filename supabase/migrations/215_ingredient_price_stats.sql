-- Price statistics per ingredient x supplier, normalised to cents per kg so a
-- pack size change does not distort the comparison. Averages are the mean of
-- the recorded price points in the window (prices land weekly via the Bidfood
-- sync, so points are roughly evenly spaced).

CREATE OR REPLACE VIEW ingredient_price_stats AS
WITH base AS (
  SELECT
    ip.raw_ingredient_id,
    ip.supplier_id,
    ip.effective_date,
    ip.price_cents,
    ip.pack_size_grams,
    (ip.price_cents::numeric / NULLIF(ip.pack_size_grams, 0)) * 1000 AS cents_per_kg
  FROM ingredient_prices ip
),
latest AS (
  SELECT DISTINCT ON (raw_ingredient_id, supplier_id) *
  FROM base
  ORDER BY raw_ingredient_id, supplier_id, effective_date DESC
)
SELECT
  l.raw_ingredient_id,
  ri.name                                   AS ingredient_name,
  l.supplier_id,
  s.name                                    AS supplier_name,
  l.effective_date                          AS last_change_on,
  l.price_cents                             AS current_price_cents,
  l.pack_size_grams                         AS current_pack_size_grams,
  ROUND(l.cents_per_kg, 2)                  AS current_cents_per_kg,
  ROUND(st.avg_4w, 2)                       AS avg_cents_per_kg_4w,
  ROUND(st.avg_12w, 2)                      AS avg_cents_per_kg_12w,
  ROUND(st.avg_52w, 2)                      AS avg_cents_per_kg_52w,
  ROUND(st.min_52w, 2)                      AS min_cents_per_kg_52w,
  ROUND(st.max_52w, 2)                      AS max_cents_per_kg_52w,
  st.points_52w,
  st.first_seen_on,
  prev.price_cents                          AS price_cents_1m_ago,
  CASE
    WHEN prev.price_cents > 0
      THEN ROUND(100.0 * (l.price_cents - prev.price_cents)::numeric / prev.price_cents, 2)
  END                                       AS change_pct_vs_1m_ago,
  CASE
    WHEN st.avg_12w > 0
      THEN ROUND(100.0 * (l.cents_per_kg - st.avg_12w) / st.avg_12w, 2)
  END                                       AS pct_vs_avg_12w
FROM latest l
JOIN raw_ingredients ri ON ri.id = l.raw_ingredient_id
LEFT JOIN suppliers s   ON s.id = l.supplier_id
LEFT JOIN LATERAL (
  SELECT
    AVG(b.cents_per_kg) FILTER (WHERE b.effective_date >= CURRENT_DATE - 28)  AS avg_4w,
    AVG(b.cents_per_kg) FILTER (WHERE b.effective_date >= CURRENT_DATE - 84)  AS avg_12w,
    AVG(b.cents_per_kg) FILTER (WHERE b.effective_date >= CURRENT_DATE - 364) AS avg_52w,
    MIN(b.cents_per_kg) FILTER (WHERE b.effective_date >= CURRENT_DATE - 364) AS min_52w,
    MAX(b.cents_per_kg) FILTER (WHERE b.effective_date >= CURRENT_DATE - 364) AS max_52w,
    COUNT(*)            FILTER (WHERE b.effective_date >= CURRENT_DATE - 364) AS points_52w,
    MIN(b.effective_date)                                                     AS first_seen_on
  FROM base b
  WHERE b.raw_ingredient_id = l.raw_ingredient_id
    AND b.supplier_id IS NOT DISTINCT FROM l.supplier_id
) st ON TRUE
LEFT JOIN LATERAL (
  SELECT b.price_cents
  FROM base b
  WHERE b.raw_ingredient_id = l.raw_ingredient_id
    AND b.supplier_id IS NOT DISTINCT FROM l.supplier_id
    AND b.effective_date <= CURRENT_DATE - 30
  ORDER BY b.effective_date DESC
  LIMIT 1
) prev ON TRUE;

COMMENT ON VIEW ingredient_price_stats IS
  'Per ingredient/supplier: current price, 4/12/52-week averages in cents per kg, range, and change vs one month ago. Feeds the monthly price report.';

GRANT SELECT ON ingredient_price_stats TO authenticated;

-- Monthly food-cost snapshot, so price moves can be traced through to dishes.
CREATE OR REPLACE FUNCTION snapshot_food_costs(p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM food_cost_snapshots WHERE snapshot_date = p_date;

  INSERT INTO food_cost_snapshots (menu_item_id, snapshot_date, cost_cents, price_cents, food_cost_pct, calculation_details)
  SELECT
    c.menu_item_id,
    p_date,
    c.computed_cost_cents,
    c.price_cents,
    c.food_cost_pct,
    jsonb_build_object('missing_price_lines', c.missing_price_lines, 'source', 'monthly_price_report')
  FROM computed_menu_item_food_cost c
  WHERE c.computed_cost_cents IS NOT NULL;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION snapshot_food_costs IS
  'Writes today''s computed food cost per menu item into food_cost_snapshots (idempotent per date).';

-- Scheduling (applied by hand on production, kept here for reference):
--
--   select cron.schedule('weekly_food_cost_snapshot', '0 8 * * 1',
--     $$ select snapshot_food_costs(); $$);
--
--   select cron.schedule('monthly_price_report', '0 6 1 * *', $$
--     select net.http_post(
--       url := 'https://<project>.supabase.co/functions/v1/price-change-report',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-api-token', (select decrypted_secret from vault.decrypted_secrets
--                         where name = 'monthly_price_report_token')),
--       body := '{}'::jsonb);
--   $$);
