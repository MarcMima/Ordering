-- ============================================================================
-- Migration 253: sales forecast for the shadow order suggestion
--
-- The order suggestion scales the prep base by the day's revenue target. Those
-- targets are typed in (or carried forward) and are nearly flat, while real
-- revenue differs strongly by weekday (Zuidas: target EUR 3 200-3 700 every
-- day, actual Fri-Sun EUR 1 300-1 700). This migration adds an automatic
-- forecast from Butlaroo, used ONLY in a shadow run next to the normal
-- suggestion. Nothing here changes what managers see or order.
--
--   pos_channel_daily      per location, day and sales channel: orders,
--                          orders with a discount, gross and discount.
--                          Filled nightly by push_pos_sales.py (mima-data).
--   planned_promotions     Uber Eats / Thuisbezorgd actions announced in
--                          advance (location optional = all locations).
--   fn_revenue_forecast    expected revenue per date, as known on an as-of
--                          date (only sales before that date are used).
--   order_suggestion_snapshots.shadow_lines / shadow_revenue
--                          what the forecast-based run advised, stored next to
--                          the real suggestion so both can be compared.
--
-- Measure: gross incl. VAT PLUS the discount given, i.e. the menu-price value
-- of what was sold. During a promotion the discount lowers revenue per dish;
-- the menu-price value follows the food that leaves the kitchen.
--
-- Forecast per channel: the average of the last 6 same weekdays before the
-- as-of date (days with sales only). On Uber Eats / Thuisbezorgd, promotion
-- days (>= 30% of orders discounted, >= 5 orders) are left out of that
-- baseline, and a promotion uplift is applied when a promotion is planned for
-- the date or is running (promotion on both of the last two days; assumed to
-- last up to 3 more days). The uplift is learned from the location's own past
-- promotion days (menu-price value vs the non-promotion baseline), with 1.4
-- as the fallback until there is history.
-- ============================================================================
begin;

create table if not exists pos_channel_daily (
  location_id     uuid not null references locations(id) on delete cascade,
  date            date not null,
  channel         text not null,
  orders          integer not null default 0,
  promo_orders    integer not null default 0,
  gross_cents     bigint not null default 0,
  discount_cents  bigint not null default 0,
  loaded_at       timestamptz not null default now(),
  primary key (location_id, date, channel)
);
comment on table pos_channel_daily is
  'Per location, day and Butlaroo order channel (kiosk, pos, webshop, uber_eats, just_eat, ...): '
  'orders, orders with a discount, gross incl. VAT and discount. Filled by push_pos_sales.py.';

create table if not exists planned_promotions (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid references locations(id) on delete cascade,
  channel      text not null check (channel in ('uber_eats', 'just_eat')),
  starts_on    date not null,
  ends_on      date not null,
  label        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
comment on table planned_promotions is
  'Uber Eats / Thuisbezorgd promotions known in advance. location_id NULL = all locations. '
  'Read by fn_revenue_forecast.';

alter table order_suggestion_snapshots add column if not exists shadow_lines jsonb;
alter table order_suggestion_snapshots add column if not exists shadow_revenue jsonb;
comment on column order_suggestion_snapshots.shadow_lines is
  'Shadow run: the same suggestion, computed with fn_revenue_forecast instead of the revenue target. Not shown to managers.';
comment on column order_suggestion_snapshots.shadow_revenue is
  'Per date: {forecast_cents, baseline_cents, promo_channels} used in the shadow run, plus _target_cents (revenue target of the snapshot date).';

create or replace function fn_revenue_forecast(p_location uuid, p_from date, p_to date, p_as_of date)
returns table (date date, forecast_cents bigint, baseline_cents bigint, promo_channels text[])
language plpgsql stable security definer set search_path = public as $$
declare
  d date;
  ch record;
  v_base numeric;
  v_total numeric;
  v_baseline numeric;
  v_promos text[];
  v_uplift numeric;
  v_active boolean;
begin
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    v_total := 0; v_baseline := 0; v_promos := '{}';
    for ch in
      select distinct c.channel from pos_channel_daily c
      where c.location_id = p_location and c.date < p_as_of and c.date >= p_as_of - 84
    loop
      -- baseline: last 6 same weekdays with sales, promotion days left out
      select avg(v) into v_base from (
        select coalesce(x.gross_cents + x.discount_cents, 0) as v
        from (select distinct c2.date from pos_channel_daily c2
              where c2.location_id = p_location and c2.date < p_as_of
                and extract(isodow from c2.date) = extract(isodow from d)) days
        left join pos_channel_daily x
          on x.location_id = p_location and x.date = days.date and x.channel = ch.channel
        where not (ch.channel in ('uber_eats','just_eat')
                   and coalesce(x.orders,0) >= 5 and x.promo_orders >= 0.3 * x.orders)
        order by days.date desc
        limit 6
      ) b;
      v_base := coalesce(v_base, 0);
      v_baseline := v_baseline + v_base;

      v_active := false;
      if ch.channel in ('uber_eats','just_eat') then
        v_active := exists (
          select 1 from planned_promotions pp
          where pp.channel = ch.channel and (pp.location_id is null or pp.location_id = p_location)
            and d between pp.starts_on and pp.ends_on)
          or (d <= p_as_of + 3 and 2 = (
            select count(*) from pos_channel_daily y
            where y.location_id = p_location and y.channel = ch.channel
              and y.date in (p_as_of - 1, p_as_of - 2)
              and y.orders >= 5 and y.promo_orders >= 0.3 * y.orders));
      end if;

      if v_active then
        -- learned uplift: promotion days vs the same-weekday non-promotion average before them
        select sum(p.gross_cents + p.discount_cents) / nullif(sum(base.v), 0) into v_uplift
        from pos_channel_daily p
        cross join lateral (
          select avg(q.gross_cents + q.discount_cents) as v
          from pos_channel_daily q
          where q.location_id = p.location_id and q.channel = p.channel
            and q.date < p.date and q.date >= p.date - 42
            and extract(isodow from q.date) = extract(isodow from p.date)
            and not (q.orders >= 5 and q.promo_orders >= 0.3 * q.orders)
        ) base
        where p.location_id = p_location and p.channel = ch.channel
          and p.date < p_as_of and p.date >= p_as_of - 180
          and p.orders >= 5 and p.promo_orders >= 0.3 * p.orders
          and base.v is not null;
        v_uplift := coalesce(v_uplift, 1.4);
        v_total := v_total + v_base * v_uplift;
        v_promos := array_append(v_promos, ch.channel);
      else
        v_total := v_total + v_base;
      end if;
    end loop;
    date := d;
    forecast_cents := round(v_total);
    baseline_cents := round(v_baseline);
    promo_channels := v_promos;
    return next;
  end loop;
end $$;
comment on function fn_revenue_forecast(uuid, date, date, date) is
  'Expected menu-price revenue (gross incl. VAT + discount) per date for a location, using only '
  'sales before p_as_of. See migration 253.';

alter table pos_channel_daily enable row level security;
alter table planned_promotions enable row level security;
drop policy if exists pos_channel_daily_select on pos_channel_daily;
create policy pos_channel_daily_select on pos_channel_daily for select to authenticated using (true);
drop policy if exists planned_promotions_select on planned_promotions;
create policy planned_promotions_select on planned_promotions for select to authenticated using (true);
drop policy if exists planned_promotions_write on planned_promotions;
create policy planned_promotions_write on planned_promotions for all to authenticated using (true) with check (true);
revoke all on pos_channel_daily, planned_promotions from anon;
-- The ordering page can run in kitchen mode on the anon key; the forecast is no more
-- sensitive than daily_revenue_targets, which anon can already read. Security definer,
-- so the raw channel table itself stays closed to anon.
revoke all on function fn_revenue_forecast(uuid, date, date, date) from public;
grant execute on function fn_revenue_forecast(uuid, date, date, date) to anon, authenticated;

commit;
