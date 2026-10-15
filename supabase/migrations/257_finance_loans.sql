-- 257_finance_loans.sql
-- Marc-only "Loans" section (/admin/finance/loans): the two private loans from
-- A.C. Kruize-Schuitemaker to Mima Pijp B.V. and Mima Zuidas B.V., their payments,
-- and a log of the quarterly lender statements.
--
-- Access: RLS on, NO policies, and no grants to anon/authenticated. Only the
-- service role (server routes that first check the signed-in user is Marc) can
-- read or write. Kitchen mode (NEXT_PUBLIC_AUTH_DISABLED) can never reach it.
--
-- Data: one-off import of factual base data (allowed exception in CLAUDE.md):
--   loans    from the signed loan agreements + Excel schedules on the NAS
--            (06_Financials/05_Financing & accountant/Financing, read 15-10-2026)
--   payments the bank (BNK) lines in Twinfield, mima-data silver_twinfield_gl_lines,
--            accounts 0531/6725 (Pijp) and 0501/6725 (Zuidas), through 12-09-2026.
-- Idempotent; one transaction; control select at the end.

begin;

create table if not exists public.finance_loans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  borrower_entity text not null,
  lender_name text not null,
  lender_email text,
  lender_greeting text,
  principal numeric(12,2) not null check (principal > 0),
  annual_rate numeric(7,5) not null check (annual_rate >= 0),
  term_months integer not null check (term_months > 0),
  first_payment_date date not null,
  disbursed_on date,
  contract_end date,
  direct_debit boolean not null default true,
  prepayment_penalty boolean not null default false,
  prepay_mode text not null default 'shorten' check (prepay_mode in ('shorten','keepterm')),
  statement_language text not null default 'nl' check (statement_language in ('nl','en')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.finance_loans(id) on delete cascade,
  paid_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  kind text not null default 'instalment' check (kind in ('instalment','extra','correction')),
  source text not null default 'manual' check (source in ('ledger','manual','direct_debit')),
  ledger_ref text,
  note text,
  created_at timestamptz not null default now(),
  unique (loan_id, ledger_ref)
);
create index if not exists finance_loan_payments_loan_date on public.finance_loan_payments (loan_id, paid_on);

create table if not exists public.finance_loan_reports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  loan_ids uuid[] not null,
  status text not null check (status in ('preview_sent','sent_to_lender','failed')),
  recipients text[] not null default '{}',
  subject text,
  html text,
  error text,
  created_at timestamptz not null default now()
);

alter table public.finance_loans enable row level security;
alter table public.finance_loan_payments enable row level security;
alter table public.finance_loan_reports enable row level security;
revoke all on public.finance_loans, public.finance_loan_payments, public.finance_loan_reports from anon, authenticated;

-- ---- Loans ---------------------------------------------------------------
insert into public.finance_loans (code, name, borrower_entity, lender_name, principal, annual_rate, term_months,
  first_payment_date, disbursed_on, contract_end, notes)
select 'pijp', 'Mima Pijp', 'Mima Pijp B.V.', 'A.C. Kruize-Schuitemaker', 567700, 0.0402, 120,
  date '2025-05-01', date '2024-09-01', date '2034-12-31',
  'Agreement: 4.02% per year, 10 years, min. 10% repayment per year, larger repayments allowed (art. 4), no prepayment fee. '
  || 'Practice: monthly annuity by direct debit from May 2025 (Excel "Repayment schedule_Alle locaties"). '
  || 'Co-signed by Mima Fresh Mediterranean B.V. and both UBOs (art. 6d).'
where not exists (select 1 from public.finance_loans where code = 'pijp');

insert into public.finance_loans (code, name, borrower_entity, lender_name, principal, annual_rate, term_months,
  first_payment_date, disbursed_on, contract_end, notes)
select 'zuidas', 'Mima Zuidas', 'Mima Zuidas B.V.', 'A.C. Kruize-Schuitemaker', 400000, 0.0339, 120,
  date '2026-01-01', date '2025-07-30', date '2035-12-31',
  'Agreement signed 30-07-2025: 3.39% per year, 10 years, min. 10% repayment per year, larger repayments allowed (art. 4), no prepayment fee. '
  || 'Practice: monthly annuity by direct debit from January 2026. Both owners co-sign privately (art. 1.2).'
where not exists (select 1 from public.finance_loans where code = 'zuidas');

-- ---- Payments (Twinfield BNK lines; ledger_ref = office/journal number) ----
insert into public.finance_loan_payments (loan_id, paid_on, amount, kind, source, ledger_ref, note)
select l.id, v.paid_on, v.amount, v.kind, 'ledger', v.ref, v.note
from (values
  ('pijp', date '2025-05-12', 5584.54, 'instalment', 'pijp/202500108', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-06-12', 5584.54, 'instalment', 'pijp/202500130', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-07-12', 5584.54, 'instalment', 'pijp/202500152', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-08-12', 5584.54, 'instalment', 'pijp/202500175', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-09-12', 5584.54, 'instalment', 'pijp/202500199', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-10-12', 5584.54, 'instalment', 'pijp/202500220', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-11-12', 5584.54, 'instalment', 'pijp/202500243', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2025-12-12', 5584.54, 'instalment', 'pijp/202500266', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2026-01-14', 5584.54, 'instalment', 'pijp/202600007', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2026-02-12', 5584.54, 'instalment', 'pijp/202600030', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2026-03-12', 5584.54, 'instalment', 'pijp/202600049', 'Collected at the 3.39% amount instead of 5,753.08'),
  ('pijp', date '2026-04-10', 1041.51, 'correction', 'pijp/202600070', 'Catch-up "Correctie aflossingen door wijziging van rentevoet"'),
  ('pijp', date '2026-04-12', 5801.80, 'instalment', 'pijp/202600071', 'Collected at the 4.2% amount'),
  ('pijp', date '2026-05-12', 5801.80, 'instalment', 'pijp/202600093', 'Collected at the 4.2% amount'),
  ('pijp', date '2026-06-12', 5119.72, 'instalment', 'pijp/202600118', '"Aflossing 14 aangepast voor rentevoet 4.02"'),
  ('pijp', date '2026-07-12', 5753.08, 'instalment', 'pijp/202600138', null),
  ('pijp', date '2026-08-12', 5753.08, 'instalment', 'pijp/202600162', null),
  ('pijp', date '2026-09-12', 5753.09, 'instalment', 'pijp/202600185', null),
  ('zuidas', date '2026-02-16', 7869.71, 'instalment', 'zuidas/202600033', 'January and February 2026 together'),
  ('zuidas', date '2026-03-12', 3934.86, 'instalment', 'zuidas/202600051', null),
  ('zuidas', date '2026-04-12', 3934.86, 'instalment', 'zuidas/202600071', null),
  ('zuidas', date '2026-05-12', 3934.86, 'instalment', 'zuidas/202600096', null),
  ('zuidas', date '2026-06-12', 3934.86, 'instalment', 'zuidas/202600118', null),
  ('zuidas', date '2026-07-12', 3934.86, 'instalment', 'zuidas/202600138', null),
  ('zuidas', date '2026-08-12', 3934.86, 'instalment', 'zuidas/202600162', null),
  ('zuidas', date '2026-09-12', 3934.86, 'instalment', 'zuidas/202600185', 'Ledger split 967.20 interest / 2,967.66 principal; schedule says 1,065.98 / 2,868.88')
) as v(code, paid_on, amount, kind, ref, note)
join public.finance_loans l on l.code = v.code
where not exists (
  select 1 from public.finance_loan_payments p where p.loan_id = l.id and p.ledger_ref = v.ref
);

commit;

-- Control: Pijp 18 payments / 96,454.02; Zuidas 8 payments / 35,413.73
select l.code, count(p.id) as payments, sum(p.amount) as received
from public.finance_loans l left join public.finance_loan_payments p on p.loan_id = l.id
group by l.code order by l.code;
