-- 260: waste / stock loss registration (Pijp feedback 09-10, Marc go 19-10-2026).
-- Unexpected losses (fridge broke down, spoiled, dropped) are recorded per product. A loss logged
-- after the latest count is subtracted from that count in the prep list and the order suggestion,
-- so the app does not think the stock is still there until the next count.
-- quantity: base units (g / ml / pcs, as daily_stock_counts) for raw ingredients,
--           containers (as daily_prep_counts) for prep items.
create table if not exists stock_losses (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  date date not null default current_date,
  raw_ingredient_id uuid references raw_ingredients(id) on delete cascade,
  prep_item_id uuid references prep_items(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  unit_label text,
  reason text not null check (reason in ('equipment_failure', 'spoiled_expired', 'dropped_damaged', 'quality', 'other')),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  check (num_nonnulls(raw_ingredient_id, prep_item_id) = 1)
);
create index if not exists idx_stock_losses_location_date on stock_losses (location_id, date desc);

alter table stock_losses enable row level security;
-- Same access as daily_stock_counts / daily_prep_counts.
drop policy if exists kitchen_anon_all on stock_losses;
create policy kitchen_anon_all on stock_losses for all to anon using (true) with check (true);
drop policy if exists stock_losses_select on stock_losses;
create policy stock_losses_select on stock_losses for select to authenticated using (has_location_access(location_id));
drop policy if exists stock_losses_manage on stock_losses;
create policy stock_losses_manage on stock_losses for all to authenticated
  using (has_permission('operations.manage') and has_location_access(location_id))
  with check (has_permission('operations.manage') and has_location_access(location_id));

select count(*) as stock_losses_rows from stock_losses;
