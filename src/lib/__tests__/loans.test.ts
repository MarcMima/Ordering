import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annuityPayment,
  compareScenario,
  contractSchedule,
  loanState,
  previousQuarter,
  type Loan,
  type LoanPayment,
} from "../loans.ts";

const base = {
  lender_name: "A.C. Kruize-Schuitemaker",
  lender_email: null,
  lender_greeting: null,
  disbursed_on: null,
  contract_end: null,
  direct_debit: true,
  prepayment_penalty: false,
  prepay_mode: "shorten" as const,
  statement_language: "nl" as const,
  notes: null,
};
const pijp: Loan = { ...base, id: "p", code: "pijp", name: "Mima Pijp", borrower_entity: "Mima Pijp B.V.", principal: 567700, annual_rate: 0.0402, term_months: 120, first_payment_date: "2025-05-01" };
const zuidas: Loan = { ...base, id: "z", code: "zuidas", name: "Mima Zuidas", borrower_entity: "Mima Zuidas B.V.", principal: 400000, annual_rate: 0.0339, term_months: 120, first_payment_date: "2026-01-01" };

const near = (a: number, b: number, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("annuity matches the Excel schedules", () => {
  near(annuityPayment(567700, 0.0402, 120), 5753.08);
  near(annuityPayment(400000, 0.0339, 120), 3934.86);
});

test("contract schedule matches Excel row 1 and month 17", () => {
  const rows = contractSchedule(pijp);
  near(rows[0].interest, 1901.8);
  near(rows[0].principal, 3851.29);
  assert.equal(rows[16].dueDate, "2026-09-01");
  near(rows[16].balance, 500443.7);
  assert.equal(rows.length, 120);
  near(rows[119].balance, 0);
});

const pay = (loan_id: string, paid_on: string, amount: number, kind: LoanPayment["kind"] = "instalment"): LoanPayment => ({
  id: `${loan_id}-${paid_on}-${amount}`, loan_id, paid_on, amount, kind, source: "ledger", ledger_ref: null, note: null,
});

test("Pijp: bank payments incl. the April catch-up match the schedule", () => {
  const ps = [
    ...["2025-05-12", "2025-06-12", "2025-07-12", "2025-08-12", "2025-09-12", "2025-10-12", "2025-11-12", "2025-12-12", "2026-01-14", "2026-02-12", "2026-03-12"].map((d) => pay("p", d, 5584.54)),
    pay("p", "2026-04-10", 1041.51, "correction"),
    pay("p", "2026-04-10", 1348.32, "correction"),
    pay("p", "2026-04-12", 5801.8), pay("p", "2026-05-12", 5801.8), pay("p", "2026-06-12", 5119.72),
    pay("p", "2026-07-12", 5753.08), pay("p", "2026-08-12", 5753.08), pay("p", "2026-09-12", 5753.09),
  ];
  const s = loanState(pijp, ps, "2026-09-30");
  assert.equal(s.dueCount, 17);
  assert.equal(s.assumed.length, 0);
  near(s.balance, 500443.7);
  near(s.arrears, 0, 0.1);
  near(s.outstanding, 500443.7, 0.05);
});

test("Zuidas on schedule; October assumed by direct debit once past grace", () => {
  const ps = [pay("z", "2026-02-16", 7869.71), ...["2026-03-12", "2026-04-12", "2026-05-12", "2026-06-12", "2026-07-12", "2026-08-12", "2026-09-12"].map((d) => pay("z", d, 3934.86))];
  const s = loanState(zuidas, ps, "2026-09-30");
  near(s.arrears, 0, 0.05);
  near(s.balance, 374469.15);
  const later = loanState(zuidas, ps, "2026-10-31");
  assert.equal(later.assumed.length, 1);
  near(later.balance, 371592.17);
});

test("extra repayment shortens the term and saves interest", () => {
  const s = loanState(pijp, [], "2026-10-31", { assumeDirectDebit: true });
  const r = compareScenario(s, { lumpSum: 100000, lumpDate: "2026-11-15", extraMonthly: 0, extraFrom: "2026-12-01", mode: "shorten" }, 0.013, 0.19);
  assert.ok(r.interestSaved > 30000 && r.interestSaved < 40000, String(r.interestSaved));
  assert.ok(r.monthsSaved > 18);
  // paying 4.02% debt with cash that earns 1.3% creates value
  assert.ok(r.netValueToday > 0);
  // ...but not if the money would otherwise avoid a 6% bank loan
  const r2 = compareScenario(s, { lumpSum: 100000, lumpDate: "2026-11-15", extraMonthly: 0, extraFrom: "2026-12-01", mode: "shorten" }, 0.06, 0.19);
  assert.ok(r2.netValueToday < 0);
});

test("extra repayment recorded on the loan lowers the balance", () => {
  const s = loanState(zuidas, [pay("z", "2026-01-12", 3934.86), pay("z", "2026-02-12", 3934.86), pay("z", "2026-02-20", 50000, "extra")], "2026-02-28", { assumeDirectDebit: false });
  near(s.balance, 400000 - 2804.86 - 2812.78 - 50000, 0.05);
  assert.ok(s.aheadOfPlan > 49999);
});

test("previous quarter", () => {
  assert.deepEqual(previousQuarter("2026-10-02"), { year: 2026, q: 3, start: "2026-07-01", end: "2026-09-30" });
  assert.deepEqual(previousQuarter("2026-01-02"), { year: 2025, q: 4, start: "2025-10-01", end: "2025-12-31" });
});
