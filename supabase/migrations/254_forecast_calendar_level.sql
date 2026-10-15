-- 254: sales forecast v2 — holidays, school holidays, level correction, promo calendars
--
-- What changes in fn_revenue_forecast (migration 253):
--   1. forecast_calendar: per location and date a factor for public holidays and
--      school holidays (region Noord). Filled nightly by mima-data
--      (pipeline/push_forecast_calendar.py), which learns the factors from the full
--      sales history since 2024 (Lightspeed, Sides, Butlaroo). Factor 0 = closed
--      (Kings Day, Christmas, Boxing Day in every year so far).
--   2. Calendar days are left out of the same-weekday baseline, so a holiday no
--      longer drags the next six weeks down.
--   3. Level correction: half of the gap between actual sales and the baseline over
--      the last 14 normal days (clamped 0.8–1.25), so the forecast follows a rising
--      or falling trend faster than a 6-week average does.
--   4. planned_promotions.source: 'manual' (Admin page) or 'sheet_jet' / 'sheet_uber'
--      (marketing calendars from Thuisbezorgd and the Uber Eats tracker, pushed nightly).
--
-- Backtest Jan 2025–Oct 2026, all three locations, forecast made two days ahead
-- (daily revenue, WAPE): 18.6% before, 16.8% after. Holiday days alone: 66% → 37%.
-- Weather and end-of-month were tested and left out: no measurable gain.

begin;

create table if not exists forecast_calendar (
  location_id uuid not null references locations(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('public_holiday', 'school_holiday')),
  label       text not null,
  factor      numeric not null check (factor >= 0 and factor <= 3),
  n_obs       int not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (location_id, date, kind)
);
comment on table forecast_calendar is
  'Holiday and school-holiday factors per location and date for fn_revenue_forecast. '
  'Written nightly by mima-data push_forecast_calendar.py; do not edit by hand.';

alter table planned_promotions add column if not exists source text not null default 'manual';
alter table planned_promotions drop constraint if exists planned_promotions_source_check;
alter table planned_promotions add constraint planned_promotions_source_check
  check (source in ('manual', 'sheet_jet', 'sheet_uber'));
comment on column planned_promotions.source is
  'manual = entered on Admin > Delivery promotions; sheet_* = pushed nightly from the platform marketing calendars (replaced on every run).';

alter table forecast_calendar enable row level security;
drop policy if exists forecast_calendar_select on forecast_calendar;
create policy forecast_calendar_select on forecast_calendar for select to authenticated using (true);
revoke all on forecast_calendar from anon;

-- Menu-price total (gross + discount) of one day, null when the location had no sales.
create or replace function fn_pos_day_total(p_location uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select sum(gross_cents + discount_cents)::numeric
  from pos_channel_daily where location_id = p_location and date = p_date
$$;
revoke all on function fn_pos_day_total(uuid, date) from public;

-- True for days that must not feed a baseline: calendar days and days with a
-- marketplace promotion on any channel.
create or replace function fn_forecast_skip_day(p_location uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from forecast_calendar fc
                 where fc.location_id = p_location and fc.date = p_date)
      or exists (select 1 from pos_channel_daily c
                 where c.location_id = p_location and c.date = p_date
                   and c.channel in ('uber_eats', 'just_eat')
                   and c.orders >= 5 and c.promo_orders >= 0.3 * c.orders)
$$;
revoke all on function fn_forecast_skip_day(uuid, date) from public;

-- Same signature as 253, so create or replace (no drop needed).
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
  v_cal numeric;
  v_label text;
  v_level numeric := 1;
  v_act numeric := 0;
  v_exp numeric := 0;
  v_n int := 0;
  j date;
  v_j_total numeric;
  v_j_base numeric;
begin
  -- Level correction over the last 14 normal days before p_as_of.
  for j in select generate_series(p_as_of - 14, p_as_of - 1, interval '1 day')::date loop
    continue when fn_forecast_skip_day(p_location, j);
    v_j_total := fn_pos_day_total(p_location, j);
    continue when v_j_total is null;
    select avg(t) into v_j_base from (
      select fn_pos_day_total(p_location, h.dd) as t
      from (select distinct c.date as dd from pos_channel_daily c
            where c.location_id = p_location and c.date < j and c.date >= j - 126
              and extract(isodow from c.date) = extract(isodow from j)) h
      where not fn_forecast_skip_day(p_location, h.dd)
      order by h.dd desc limit 6) b;
    continue when v_j_base is null or v_j_base <= 0;
    v_act := v_act + v_j_total; v_exp := v_exp + v_j_base; v_n := v_n + 1;
  end loop;
  if v_n >= 5 and v_exp > 0 then
    v_level := 1 + 0.5 * (least(greatest(v_act / v_exp, 0.8), 1.25) - 1);
  end if;

  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    v_total := 0; v_baseline := 0; v_promos := '{}';

    select coalesce(exp(sum(ln(nullif(fc.factor, 0)))), 1),
           string_agg(fc.label, ', ' order by fc.kind),
           bool_or(fc.factor = 0)
      into v_cal, v_label, v_active
    from forecast_calendar fc where fc.location_id = p_location and fc.date = d;
    if coalesce(v_active, false) then v_cal := 0; end if;

    for ch in
      select distinct c.channel from pos_channel_daily c
      where c.location_id = p_location and c.date < p_as_of and c.date >= p_as_of - 84
    loop
      -- baseline: last 6 same weekdays with sales, calendar days and (for this
      -- marketplace channel) promotion days left out
      select avg(v) into v_base from (
        select coalesce(x.gross_cents + x.discount_cents, 0) as v
        from (select distinct c2.date from pos_channel_daily c2
              where c2.location_id = p_location and c2.date < p_as_of
                and extract(isodow from c2.date) = extract(isodow from d)
                and not exists (select 1 from forecast_calendar fc2
                                where fc2.location_id = p_location and fc2.date = c2.date)) days
        left join pos_channel_daily x
          on x.location_id = p_location and x.date = days.date and x.channel = ch.channel
        where not (ch.channel in ('uber_eats','just_eat')
                   and coalesce(x.orders,0) >= 5 and x.promo_orders >= 0.3 * x.orders)
        order by days.date desc
        limit 6
      ) b;
      v_base := coalesce(v_base, 0) * v_cal * v_level;
      v_baseline := v_baseline + v_base;

      v_active := false;
      if ch.channel in ('uber_eats','just_eat') and v_cal > 0 then
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
        v_uplift := least(greatest(coalesce(v_uplift, 1.4), 1), 3);
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
  'sales before p_as_of. Same-weekday baseline x calendar factor x level correction, plus '
  'marketplace promo uplift. See migrations 253 and 254.';
revoke all on function fn_revenue_forecast(uuid, date, date, date) from public;
grant execute on function fn_revenue_forecast(uuid, date, date, date) to anon, authenticated;

commit;
