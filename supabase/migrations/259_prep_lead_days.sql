-- 259: lead time per prep item (Marc, 19-10-2026: "hummus and rose lemonade when stock is low").
-- The prep list made enough for one day (base x multiplier - stock). Hummus needs soaked chickpeas
-- (start the day before) and rose lemonade needs the mix made the day before, so with 3 hummus or
-- 13 bottles in stock the kitchen already has to start, while the list said "make 0" (Pijp, 16-09).
-- lead_days = extra days the "make" decision looks ahead; 0 = today only (unchanged behaviour).
alter table prep_items add column if not exists lead_days smallint not null default 0;
comment on column prep_items.lead_days is
  'Extra days the prep list covers when deciding what to make (needs starting the day before). 0 = one day.';

update prep_items set lead_days = 1 where name in ('Hummus', 'Rose lemonade') and lead_days = 0;

select name, lead_days from prep_items where lead_days > 0;
