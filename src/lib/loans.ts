// Loan engine for the Marc-only "Loans" section (/admin/finance/loans).
//
// Pure functions, no imports: used by the page, the API routes, the quarterly
// lender statement and the node:test suite (src/lib/__tests__/loans.test.ts).
//
// Model (matches the Excel schedules on the NAS, 06_Financials/05_Financing):
// - Monthly annuity, fixed rate, interest = balance x rate / 12 per instalment.
// - Every due instalment is assumed to be split interest-first; the outstanding
//   principal follows the contractual annuity path.
// - Money actually received is compared with money due: the difference is
//   "arrears" (behind schedule, > 0) and is reported separately, not capitalised.
// - Extra repayments (kind "extra") reduce principal before the next instalment's
//   interest is calculated. Default effect: same instalment, shorter term.

export type PaymentKind = "instalment" | "extra" | "correction";
export type PrepayMode = "shorten" | "keepterm";

export type Loan = {
  id: string;
  code: string;
  name: string;
  borrower_entity: string;
  lender_name: string;
  lender_email: string | null;
  lender_greeting: string | null;
  principal: number;
  annual_rate: number;
  term_months: number;
  first_payment_date: string; // YYYY-MM-DD
  disbursed_on: string | null;
  contract_end: string | null;
  direct_debit: boolean;
  prepayment_penalty: boolean;
  prepay_mode: PrepayMode;
  statement_language: "nl" | "en";
  notes: string | null;
};

export type LoanPayment = {
  id: string;
  loan_id: string;
  paid_on: string; // YYYY-MM-DD
  amount: number;
  kind: PaymentKind;
  source: string;
  ledger_ref: string | null;
  note: string | null;
};

export type RowStatus = "due" | "assumed" | "future";

export type ScheduleRow = {
  n: number;
  dueDate: string;
  payment: number;
  interest: number;
  principal: number;
  extra: number;
  balance: number;
  status: RowStatus;
};

/** Days after the due date before an instalment counts as "should have been paid". */
export const GRACE_DAYS = 20;

/** Differences below this (rounding of instalments) are not shown as arrears. */
export const ARREARS_TOLERANCE = 1;

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parseIso(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, last));
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function annuityPayment(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return principal;
  const i = annualRate / 12;
  if (i === 0) return principal / months;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
}

/** The original contractual schedule, no extras, every instalment paid. */
export function contractSchedule(loan: Loan): ScheduleRow[] {
  const i = loan.annual_rate / 12;
  const pay = annuityPayment(loan.principal, loan.annual_rate, loan.term_months);
  let bal = loan.principal;
  const rows: ScheduleRow[] = [];
  for (let k = 0; k < loan.term_months && bal > 0.005; k++) {
    const interest = bal * i;
    const payment = Math.min(pay, bal + interest);
    const principal = payment - interest;
    bal -= principal;
    rows.push({
      n: k + 1,
      dueDate: addMonths(loan.first_payment_date, k),
      payment,
      interest,
      principal,
      extra: 0,
      balance: Math.max(0, bal),
      status: "future",
    });
  }
  return rows;
}

export type LoanState = {
  loan: Loan;
  asOf: string;
  instalment: number;
  rows: ScheduleRow[]; // full path: history (with real extras) + projection
  dueCount: number;
  balance: number; // outstanding principal on asOf, if every due instalment was paid
  arrears: number; // money due minus money received (> 0 = behind schedule)
  outstanding: number; // balance + arrears: what the lender is owed
  principalRepaid: number; // principal - outstanding (conservative)
  interestPaid: number; // interest part of the due instalments
  extraPaid: number;
  regularDue: number;
  regularReceived: number; // recorded + assumed
  assumed: ScheduleRow[]; // due instalments not (yet) recorded, assumed paid by direct debit
  lastRecordedPayment: string | null;
  contractBalance: number; // what the original plan says on asOf
  aheadOfPlan: number; // contractBalance - balance (> 0 = ahead thanks to extras)
  nextDue: ScheduleRow | null;
  expectedEnd: string | null;
  remainingInterest: number;
  totalInterest: number;
};

function isDue(dueDate: string, asOf: string): boolean {
  return addDays(dueDate, GRACE_DAYS) <= asOf;
}

/** Full schedule with extras applied, starting at the loan's beginning. */
function pathWithExtras(loan: Loan, extras: { date: string; amount: number }[], mode: PrepayMode): ScheduleRow[] {
  const i = loan.annual_rate / 12;
  let pay = annuityPayment(loan.principal, loan.annual_rate, loan.term_months);
  let bal = loan.principal;
  const sorted = [...extras].sort((a, b) => a.date.localeCompare(b.date));
  let x = 0;
  const rows: ScheduleRow[] = [];
  for (let k = 0; k < loan.term_months + 600 && bal > 0.005; k++) {
    const dueDate = addMonths(loan.first_payment_date, k);
    let extra = 0;
    while (x < sorted.length && sorted[x].date < dueDate) {
      extra += sorted[x].amount;
      x++;
    }
    if (extra > 0) {
      extra = Math.min(extra, bal);
      bal -= extra;
      if (mode === "keepterm" && bal > 0.005) {
        pay = annuityPayment(bal, loan.annual_rate, Math.max(1, loan.term_months - k));
      }
    }
    if (bal <= 0.005) {
      rows.push({ n: k + 1, dueDate, payment: 0, interest: 0, principal: 0, extra, balance: 0, status: "future" });
      break;
    }
    const interest = bal * i;
    const payment = Math.min(pay, bal + interest);
    const principal = payment - interest;
    bal -= principal;
    rows.push({ n: k + 1, dueDate, payment, interest, principal, extra, balance: Math.max(0, bal), status: "future" });
  }
  return rows;
}

export function loanState(
  loan: Loan,
  payments: LoanPayment[],
  asOf: string,
  opts: { assumeDirectDebit?: boolean } = {},
): LoanState {
  const assumeDD = opts.assumeDirectDebit ?? loan.direct_debit;
  const mine = payments.filter((p) => p.loan_id === loan.id && p.paid_on <= asOf);
  const extras = mine.filter((p) => p.kind === "extra").map((p) => ({ date: p.paid_on, amount: Number(p.amount) }));
  const regular = mine.filter((p) => p.kind !== "extra");
  const regularRecorded = regular.reduce((s, p) => s + Number(p.amount), 0);
  const lastRecorded = regular.length ? regular.map((p) => p.paid_on).sort().slice(-1)[0] : null;

  const rows = pathWithExtras(loan, extras, loan.prepay_mode);
  const assumed: ScheduleRow[] = [];
  let dueCount = 0;
  for (const r of rows) {
    if (isDue(r.dueDate, asOf)) {
      dueCount++;
      if (assumeDD && r.payment > 0 && (!lastRecorded || r.dueDate > lastRecorded)) {
        r.status = "assumed";
        assumed.push(r);
      } else {
        r.status = "due";
      }
    }
  }
  const dueRows = rows.slice(0, dueCount);
  const regularDue = dueRows.reduce((s, r) => s + r.payment, 0);
  const assumedAmount = assumed.reduce((s, r) => s + r.payment, 0);
  const regularReceived = regularRecorded + assumedAmount;
  const arrears = round2(regularDue - regularReceived);

  // Balance on asOf: after the last due instalment, minus extras paid since then
  // (extras before that date are already inside the path).
  const lastDue = dueRows.length ? dueRows[dueRows.length - 1] : null;
  const extrasSince = extras
    .filter((e) => !lastDue || e.date >= lastDue.dueDate)
    .reduce((s, e) => s + e.amount, 0);
  const balance = Math.max(0, (lastDue ? lastDue.balance : loan.principal) - extrasSince);

  const contract = contractSchedule(loan);
  const contractDue = contract.filter((r) => isDue(r.dueDate, asOf));
  const contractBalance = contractDue.length ? contractDue[contractDue.length - 1].balance : loan.principal;

  const future = rows.slice(dueCount).filter((r) => r.payment > 0);
  const interestPaid = dueRows.reduce((s, r) => s + r.interest, 0);
  const remainingInterest = future.reduce((s, r) => s + r.interest, 0);
  const outstanding = round2(balance + (arrears > ARREARS_TOLERANCE ? arrears : 0));

  return {
    loan,
    asOf,
    instalment: annuityPayment(loan.principal, loan.annual_rate, loan.term_months),
    rows,
    dueCount,
    balance: round2(balance),
    arrears,
    outstanding,
    principalRepaid: round2(loan.principal - outstanding),
    interestPaid: round2(interestPaid),
    extraPaid: round2(extras.reduce((s, e) => s + e.amount, 0)),
    regularDue: round2(regularDue),
    regularReceived: round2(regularReceived),
    assumed,
    lastRecordedPayment: lastRecorded,
    contractBalance: round2(contractBalance),
    aheadOfPlan: round2(contractBalance - balance),
    nextDue: future[0] ?? null,
    expectedEnd: future.length ? future[future.length - 1].dueDate : lastDue?.dueDate ?? null,
    remainingInterest: round2(remainingInterest),
    totalInterest: round2(interestPaid + remainingInterest),
  };
}

// ---- Scenarios -------------------------------------------------------------

export type Scenario = {
  lumpSum: number;
  lumpDate: string; // paid on this date (before the next instalment)
  extraMonthly: number; // added to every instalment from extraFrom
  extraFrom: string;
  mode: PrepayMode;
};

export type ProjectionRow = { dueDate: string; payment: number; interest: number; principal: number; extra: number; balance: number };

/** Projects the loan from asOf onwards, starting from the current balance. */
export function project(state: LoanState, scenario: Scenario | null): ProjectionRow[] {
  const { loan } = state;
  const i = loan.annual_rate / 12;
  let bal = state.balance;
  const remainingMonths = Math.max(1, loan.term_months - state.dueCount);
  let pay = annuityPayment(bal, loan.annual_rate, remainingMonths);
  // keep the contractual instalment when nothing changes (avoids rounding drift)
  if (Math.abs(pay - state.instalment) < 1) pay = state.instalment;
  const start = state.nextDue?.dueDate ?? addMonths(loan.first_payment_date, state.dueCount);
  let lumpDone = !scenario || scenario.lumpSum <= 0;
  const rows: ProjectionRow[] = [];
  for (let k = 0; k < remainingMonths + 600 && bal > 0.005; k++) {
    const dueDate = addMonths(start, k);
    let extra = 0;
    if (!lumpDone && scenario && scenario.lumpDate < dueDate) {
      extra += scenario.lumpSum;
      lumpDone = true;
    }
    if (extra > 0) {
      extra = Math.min(extra, bal);
      bal -= extra;
      if (scenario?.mode === "keepterm" && bal > 0.005) pay = annuityPayment(bal, loan.annual_rate, Math.max(1, remainingMonths - k));
    }
    if (bal <= 0.005) {
      rows.push({ dueDate, payment: 0, interest: 0, principal: 0, extra, balance: 0 });
      break;
    }
    const interest = bal * i;
    const payment = Math.min(pay, bal + interest);
    let principal = payment - interest;
    bal -= principal;
    if (scenario && scenario.extraMonthly > 0 && dueDate >= scenario.extraFrom && bal > 0.005) {
      const m = Math.min(scenario.extraMonthly, bal);
      bal -= m;
      extra += m;
      if (scenario.mode === "keepterm" && bal > 0.005) pay = annuityPayment(bal, loan.annual_rate, Math.max(1, remainingMonths - k - 1));
    }
    principal = round2(principal);
    rows.push({ dueDate, payment, interest, principal, extra, balance: Math.max(0, bal) });
  }
  return rows;
}

export type ScenarioResult = {
  base: ProjectionRow[];
  scen: ProjectionRow[];
  interestBase: number;
  interestScen: number;
  interestSaved: number;
  interestSavedAfterTax: number;
  totalExtra: number;
  payoffBase: string | null;
  payoffScen: string | null;
  monthsSaved: number;
  cashOutFirst12: number; // extra cash leaving Mima in the next 12 months
  netValueToday: number; // > 0: prepaying beats keeping the cash at altRate (after tax, today's euros)
  altRate: number;
  taxRate: number;
};

/**
 * Compares a scenario with "just follow the schedule".
 * altRate: what the cash would otherwise earn (savings) or cost (a bank loan you would need instead).
 * taxRate: corporate income tax rate; interest paid is deductible, interest earned is taxed.
 */
export function compareScenario(state: LoanState, scenario: Scenario, altRate: number, taxRate: number): ScenarioResult {
  const base = project(state, null);
  const scen = project(state, scenario);
  const n = Math.max(base.length, scen.length);
  const j = (altRate * (1 - taxRate)) / 12;
  let npv = 0;
  let first12 = 0;
  for (let t = 0; t < n; t++) {
    const b = base[t];
    const s = scen[t];
    const outB = b ? b.payment + b.extra - b.interest * taxRate : 0;
    const outS = s ? s.payment + s.extra - s.interest * taxRate : 0;
    const d = outB - outS; // > 0: scenario leaves more cash this month
    npv += d / Math.pow(1 + j, t + 1);
    if (t < 12) first12 += (s ? s.payment + s.extra : 0) - (b ? b.payment + b.extra : 0);
  }
  const interestBase = base.reduce((s, r) => s + r.interest, 0);
  const interestScen = scen.reduce((s, r) => s + r.interest, 0);
  const last = (rows: ProjectionRow[]) => {
    const withPay = rows.filter((r) => r.payment > 0 || r.extra > 0);
    return withPay.length ? withPay[withPay.length - 1].dueDate : null;
  };
  const payoffBase = last(base);
  const payoffScen = last(scen);
  const monthsBetween = (a: string | null, b: string | null) => {
    if (!a || !b) return 0;
    const pa = parseIso(a);
    const pb = parseIso(b);
    return (pa.y - pb.y) * 12 + (pa.m - pb.m);
  };
  return {
    base,
    scen,
    interestBase: round2(interestBase),
    interestScen: round2(interestScen),
    interestSaved: round2(interestBase - interestScen),
    interestSavedAfterTax: round2((interestBase - interestScen) * (1 - taxRate)),
    totalExtra: round2(scen.reduce((s, r) => s + r.extra, 0)),
    payoffBase,
    payoffScen,
    monthsSaved: monthsBetween(payoffBase, payoffScen),
    cashOutFirst12: round2(first12),
    netValueToday: round2(npv),
    altRate,
    taxRate,
  };
}

// ---- Statement helpers -----------------------------------------------------

export function quarterOf(iso: string): { year: number; q: number; start: string; end: string } {
  const { y, m } = parseIso(iso);
  const q = Math.floor((m - 1) / 3) + 1;
  const startM = (q - 1) * 3 + 1;
  const start = toIso(y, startM, 1);
  const end = addDays(addMonths(start, 3), -1);
  return { year: y, q, start, end };
}

/** Last completed quarter before `today`. */
export function previousQuarter(today: string): { year: number; q: number; start: string; end: string } {
  const cur = quarterOf(today);
  return quarterOf(addDays(cur.start, -1));
}
