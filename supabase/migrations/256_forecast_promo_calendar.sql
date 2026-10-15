-- 256: promotion days from the platform marketing calendars
--
-- Until now a marketplace day counted as a promotion day when 30% or more of its
-- orders had a discount. That also caught Uber's always-on offer (30% off falafel
-- and cauliflower for new customers, since 1 July 2026), which on busy days at
-- De Pijp reaches 30-40% of Uber orders. A promotion day is now:
--   - a day in planned_promotions: the Thuisbezorgd marketing calendar and the
--     Uber Eats JBP 'Marketing Plan' campaigns (pushed nightly by mima-data,
--     source sheet_jet / sheet_uber), plus manual entries; or
--   - a day on which at least 50% of the channel's orders had a discount
--     (fallback for campaigns that are not in a calendar).
-- Backtest 7 Sep-14 Oct 2026 (WAPE): West 16.7 -> 16.2, De Pijp 16.8 -> 16.2,
-- Zuidas 15.9 -> 14.6; bias from about -5% to about -2%.

begin;

create or replace function fn_is_promo_day(p_location uuid, p_channel text, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_channel in ('uber_eats', 'just_eat') and (
    exists (select 1 from planned_promotions pp
            where pp.channel = p_channel and (pp.location_id is null or pp.location_id = p_location)
              and p_date between pp.starts_on and pp.ends_on)
    or exists (select 1 from pos_channel_daily c
               where c.location_id = p_location and c.channel = p_channel and c.date = p_date
                 and c.orders >= 5 and c.promo_orders >= 0.5 * c.orders))
$$;
revoke all on function fn_is_promo_day(uuid, text, date) from public;
comment on function fn_is_promo_day(uuid, text, date) is 'Marketplace promotion day: in the platform marketing calendars / planned_promotions, or at least half of the orders discounted. Always-on offers (about 20-40% of Uber orders) stay below that line. Migration 256.';

create or replace function fn_forecast_skip_day(p_location uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from forecast_calendar fc where fc.location_id = p_location and fc.date = p_date)
      or fn_is_promo_day(p_location, 'uber_eats', p_date)
      or fn_is_promo_day(p_location, 'just_eat', p_date)
$$;
revoke all on function fn_forecast_skip_day(uuid, date) from public;

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
  v_np int;
  v_promo_normal boolean;
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
      -- baseline: last 6 same weekdays with sales (18 weeks back at most), calendar
      -- days and (for this marketplace channel) promotion days left out
      select avg(v), count(*) into v_base, v_np from (
        select coalesce(x.gross_cents + x.discount_cents, 0) as v
        from (select distinct c2.date from pos_channel_daily c2
              where c2.location_id = p_location and c2.date < p_as_of and c2.date >= p_as_of - 126
                and extract(isodow from c2.date) = extract(isodow from d)
                and not exists (select 1 from forecast_calendar fc2
                                where fc2.location_id = p_location and fc2.date = c2.date)) days
        left join pos_channel_daily x
          on x.location_id = p_location and x.date = days.date and x.channel = ch.channel
        where not fn_is_promo_day(p_location, ch.channel, days.date)
        order by days.date desc
        limit 6
      ) b;
      v_promo_normal := false;
      if ch.channel in ('uber_eats','just_eat') and v_np < 3 then
        -- promotion is the normal state on this weekday: take all days
        select avg(v) into v_base from (
          select coalesce(x.gross_cents + x.discount_cents, 0) as v
          from (select distinct c2.date from pos_channel_daily c2
                where c2.location_id = p_location and c2.date < p_as_of and c2.date >= p_as_of - 126
                  and extract(isodow from c2.date) = extract(isodow from d)
                  and not exists (select 1 from forecast_calendar fc2
                                  where fc2.location_id = p_location and fc2.date = c2.date)) days
          left join pos_channel_daily x
            on x.location_id = p_location and x.date = days.date and x.channel = ch.channel
          order by days.date desc
          limit 6
        ) b;
        v_promo_normal := true;
      end if;
      v_base := coalesce(v_base, 0) * v_cal * v_level;
      v_baseline := v_baseline + v_base;
      v_active := false;
      if ch.channel in ('uber_eats','just_eat') and v_cal > 0 and not v_promo_normal then
        v_active := exists (
          select 1 from planned_promotions pp
          where pp.channel = ch.channel and (pp.location_id is null or pp.location_id = p_location)
            and d between pp.starts_on and pp.ends_on)
          or (d <= p_as_of + 3 and 2 = (
            select count(*) from pos_channel_daily y
            where y.location_id = p_location and y.channel = ch.channel
              and y.date in (p_as_of - 1, p_as_of - 2)
              and y.orders >= 5 and y.promo_orders >= 0.5 * y.orders));
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
            and not fn_is_promo_day(q.location_id, q.channel, q.date)
        ) base
        where p.location_id = p_location and p.channel = ch.channel
          and p.date < p_as_of and p.date >= p_as_of - 180
          and fn_is_promo_day(p.location_id, p.channel, p.date)
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

commit;
