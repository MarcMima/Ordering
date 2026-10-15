"use client";

// Loans (Marc only). Gate: middleware + /api/finance/* check the signed-in email
// (src/lib/financeOwners.ts). Tables have RLS without policies; only the service role reads them.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import {
  addMonths,
  compareScenario,
  contractSchedule,
  loanState,
  previousQuarter,
  type Loan,
  type LoanPayment,
  type LoanState,
  type PrepayMode,
  type ScenarioResult,
} from "@/lib/loans";

type Report = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  recipients: string[];
  subject: string | null;
  error: string | null;
  created_at: string;
};

const eur0 = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const fmt0 = (x: number) => eur0.format(Math.round(x));
const fmt2 = (x: number) => eur2.format(x);
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const monthLabel = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "n/a";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ALT_PRESETS = [
  { label: "Savings at ING / Rabo", rate: 0.013, hint: "Business savings, Oct 2026" },
  { label: "Best savings", rate: 0.03, hint: "Highest business savings rate, Oct 2026" },
  { label: "Bank loan instead", rate: 0.06, hint: "If prepaying means borrowing more for location 4" },
];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="eyebrow">{label}</div>
      <div className={`font-heading mt-1 text-2xl ${tone === "warn" ? "text-accent-terracotta" : "text-ink"}`}>{value}</div>
      {sub && <div className="help-text mt-0.5">{sub}</div>}
    </div>
  );
}

function Bar({ share }: { share: number }) {
  const w = Math.max(0, Math.min(100, share * 100));
  return (
    <div className="h-1.5 w-full" style={{ background: "#EFE9DF" }}>
      <div className="h-1.5" style={{ width: `${w}%`, background: "var(--brand-green)" }} />
    </div>
  );
}

/** Outstanding balance over time: plan (all loans) vs scenario. */
function BalanceChart({ series }: { series: { name: string; color: string; dash?: boolean; points: { date: string; value: number }[] }[] }) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const dates = all.map((p) => p.date).sort();
  const t0 = Date.parse(dates[0]);
  const t1 = Date.parse(dates[dates.length - 1]);
  const vmax = Math.max(...all.map((p) => p.value)) * 1.05;
  const W = 720, H = 220, L = 56, R = 12, T = 12, B = 28;
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / vmax) * (H - T - B);
  const years: string[] = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) years.push(`${yr}-01-01`);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * vmax);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Outstanding balance over time">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(44,51,32,0.08)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8A8C7E">{`€${Math.round(v / 1000)}k`}</text>
          </g>
        ))}
        {years.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8A8C7E">{d.slice(0, 4)}</text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dash ? "5 4" : undefined}
            points={s.points.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.name} className="help-text inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-5" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(todayIso());
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);

  // scenario
  const [target, setTarget] = useState<string>("");
  const [lump, setLump] = useState(50000);
  const [lumpDate, setLumpDate] = useState(todayIso());
  const [monthly, setMonthly] = useState(0);
  const [mode, setMode] = useState<PrepayMode>("shorten");
  const [altRate, setAltRate] = useState(0.013);
  const [taxRate, setTaxRate] = useState(0.19);

  // statement
  const [periodEnd, setPeriodEnd] = useState(previousQuarter(todayIso()).end);
  const [stmt, setStmt] = useState<{ subject: string; html: string; warnings: string[]; to: string[] }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/finance/loans", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? `Error ${res.status}`);
      setLoading(false);
      return;
    }
    setLoans(json.loans ?? []);
    setPayments(json.payments ?? []);
    setReports(json.reports ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const states: LoanState[] = useMemo(() => loans.map((l) => loanState(l, payments, asOf)), [loans, payments, asOf]);
  const targetState = states.find((s) => s.loan.id === target) ?? [...states].sort((a, b) => b.loan.annual_rate - a.loan.annual_rate)[0];

  const totals = useMemo(() => {
    const principal = states.reduce((s, x) => s + x.loan.principal, 0);
    const outstanding = states.reduce((s, x) => s + x.outstanding, 0);
    return {
      principal,
      outstanding,
      repaid: principal - outstanding,
      interestPaid: states.reduce((s, x) => s + x.interestPaid, 0),
      remainingInterest: states.reduce((s, x) => s + x.remainingInterest, 0),
      monthly: states.reduce((s, x) => s + (x.balance > 0 ? x.instalment : 0), 0),
      arrears: states.reduce((s, x) => s + Math.max(0, x.arrears), 0),
      weightedRate: outstanding ? states.reduce((s, x) => s + x.outstanding * x.loan.annual_rate, 0) / outstanding : 0,
    };
  }, [states]);

  const result: ScenarioResult | null = useMemo(() => {
    if (!targetState) return null;
    return compareScenario(
      targetState,
      { lumpSum: lump, lumpDate, extraMonthly: monthly, extraFrom: addMonths(lumpDate.slice(0, 8) + "01", 1), mode },
      altRate,
      taxRate,
    );
  }, [targetState, lump, lumpDate, monthly, mode, altRate, taxRate]);

  const ladder = useMemo(() => {
    const sums = [25000, 50000, 100000, 250000];
    return states.map((s) => ({
      loan: s.loan,
      cells: [...sums, s.balance].map((amt) =>
        compareScenario(s, { lumpSum: amt, lumpDate: todayIso(), extraMonthly: 0, extraFrom: "9999-01-01", mode: "shorten" }, altRate, taxRate),
      ),
    }));
  }, [states, altRate, taxRate]);

  const chartSeries = useMemo(() => {
    if (!states.length) return [];
    // plan: total outstanding per month across loans (actual path incl. recorded extras)
    const byMonth = new Map<string, number>();
    for (const s of states) {
      const start = s.loan.first_payment_date;
      byMonth.set(start.slice(0, 7), (byMonth.get(start.slice(0, 7)) ?? 0) + s.loan.principal);
      for (const r of s.rows) byMonth.set(r.dueDate.slice(0, 7), (byMonth.get(r.dueDate.slice(0, 7)) ?? 0));
    }
    const months = [...byMonth.keys()].sort();
    const balAt = (rows: { dueDate: string; balance: number }[], principal: number, firstDue: string, m: string) => {
      if (m < firstDue.slice(0, 7)) return principal;
      let b = principal;
      for (const r of rows) {
        if (r.dueDate.slice(0, 7) <= m) b = r.balance;
        else break;
      }
      return b;
    };
    const plan = months.map((m) => ({
      date: `${m}-01`,
      value: states.reduce((acc, s) => acc + balAt(s.rows, s.loan.principal, s.loan.first_payment_date, m), 0),
    }));
    const out: { name: string; color: string; dash?: boolean; points: { date: string; value: number }[] }[] = [
      { name: "Both loans, current plan", color: "#5A713F", points: plan },
    ];
    if (result && targetState && (lump > 0 || monthly > 0)) {
      const today = asOf.slice(0, 7);
      const scenRows = result.scen;
      const pts = months
        .filter((m) => m >= today)
        .map((m) => {
          const others = states
            .filter((s) => s.loan.id !== targetState.loan.id)
            .reduce((acc, s) => acc + balAt(s.rows, s.loan.principal, s.loan.first_payment_date, m), 0);
          let b = targetState.balance;
          for (const r of scenRows) {
            if (r.dueDate.slice(0, 7) <= m) b = r.balance;
            else break;
          }
          return { date: `${m}-01`, value: others + b };
        });
      out.push({ name: `With extra repayment on ${targetState.loan.name}`, color: "#CDAF7A", dash: true, points: pts });
    }
    return out;
  }, [states, result, targetState, lump, monthly, asOf]);

  async function patchLoan(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/finance/loans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setNotice(json.error ?? "Could not save");
    else {
      setNotice("Saved");
      void load();
    }
  }

  async function addPayment(form: HTMLFormElement, loanId: string) {
    const fd = new FormData(form);
    const res = await fetch("/api/finance/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loan_id: loanId,
        paid_on: fd.get("paid_on"),
        amount: Number(String(fd.get("amount")).replace(",", ".")),
        kind: fd.get("kind"),
        note: fd.get("note") || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setNotice(json.error ?? "Could not save the payment");
    else {
      form.reset();
      setNotice("Payment recorded");
      void load();
    }
  }

  async function confirmAssumed(s: LoanState) {
    for (const r of s.assumed) {
      await fetch("/api/finance/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loan_id: s.loan.id, paid_on: r.dueDate.slice(0, 8) + "12", amount: Math.round(r.payment * 100) / 100, kind: "instalment", source: "direct_debit", note: "Confirmed direct debit" }),
      });
    }
    setNotice(`${s.assumed.length} instalment(s) confirmed`);
    void load();
  }

  async function deletePayment(id: string) {
    if (!window.confirm("Delete this manually added payment?")) return;
    const res = await fetch(`/api/finance/loans/payments/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setNotice(json.error ?? "Could not delete");
    void load();
  }

  async function statement(action: "render" | "preview" | "send") {
    if (action === "send") {
      const to = stmt?.flatMap((s) => s.to).join(", ") || "the lender";
      if (!window.confirm(`Send the statement to ${to}, with you in cc?`)) return;
    }
    setBusy(action);
    setNotice(null);
    const res = await fetch("/api/finance/loans/statement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, periodEnd }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNotice(json.error ?? "Something went wrong");
    if (action === "render") setStmt(json.statements ?? []);
    else {
      const results = (json.results ?? []) as { ok: boolean; error?: string }[];
      setNotice(results.every((r) => r.ok) ? (action === "send" ? "Statement sent to the lender" : "Preview sent to you") : results.map((r) => r.error).join("; "));
      void load();
    }
  }

  const verdict = result
    ? result.netValueToday >= 0
      ? `Worth ${fmt0(result.netValueToday)} in today's money compared with keeping the cash at ${pct(altRate, 1)}.`
      : `Costs ${fmt0(-result.netValueToday)} in today's money compared with keeping the cash at ${pct(altRate, 1)}.`
    : "";

  const quarterOptions = useMemo(() => {
    const out: string[] = [];
    let q = previousQuarter(addMonths(todayIso(), 3));
    for (let k = 0; k < 8; k++) {
      out.push(q.end);
      q = previousQuarter(q.start);
    }
    return out;
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6">
        <Link href="/admin" className="help-text hover:text-ink">← Admin</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Finance · private</div>
            <h1 className="page-title mt-1">Loans</h1>
            <p className="help-text mt-2">Only visible to you. Figures as of the date on the right; instalments are collected by direct debit around the 12th.</p>
          </div>
          <label className="text-sm">
            <span className="label">As of</span>
            <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
        </div>

        {notice && <div className="mt-4 border border-hairline bg-surface-muted px-4 py-2 text-sm text-ink">{notice}</div>}
        {error && <div className="mt-6 border border-accent-terracotta px-4 py-3 text-sm text-ink">{error}</div>}
        {loading && !error && <p className="help-text mt-8">Loading…</p>}

        {!loading && !error && (
          <>
            {/* ---- Overview ---- */}
            <section className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Outstanding" value={fmt0(totals.outstanding)} sub={`of ${fmt0(totals.principal)}`} />
              <Stat label="Repaid" value={fmt0(totals.repaid)} sub={pct(totals.repaid / Math.max(1, totals.principal))} />
              <Stat label="Interest paid" value={fmt0(totals.interestPaid)} sub={`${fmt0(totals.remainingInterest)} still to come`} />
              <Stat
                label={totals.arrears > 0.05 ? "Behind schedule" : "Monthly debt service"}
                value={totals.arrears > 0.05 ? fmt2(totals.arrears) : fmt0(totals.monthly)}
                sub={totals.arrears > 0.05 ? "see the loan below" : `blended rate ${pct(totals.weightedRate, 2)}`}
                tone={totals.arrears > 0.05 ? "warn" : undefined}
              />
            </section>

            <section className="mt-8">
              <BalanceChart series={chartSeries} />
            </section>

            {/* ---- Per loan ---- */}
            {states.map((s) => {
              const l = s.loan;
              const mine = payments.filter((p) => p.loan_id === l.id).sort((a, b) => b.paid_on.localeCompare(a.paid_on));
              const contract = contractSchedule(l);
              return (
                <section key={l.id} className="mt-12 border-t border-hairline pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="eyebrow">{l.lender_name}</div>
                      <h2 className="section-title mt-1">{l.borrower_entity}</h2>
                      <p className="help-text mt-1">
                        {fmt0(l.principal)} at {pct(l.annual_rate, 2)} · {l.term_months / 12} years · instalment {fmt2(s.instalment)} · {l.prepayment_penalty ? "prepayment fee applies" : "no prepayment fee"}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-heading text-2xl text-brand-green">{fmt0(s.outstanding)}</div>
                      <div className="help-text">outstanding · last instalment {monthLabel(s.expectedEnd)}</div>
                    </div>
                  </div>
                  <div className="mt-4"><Bar share={s.principalRepaid / l.principal} /></div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <div><span className="text-ink-muted">Repaid </span>{fmt0(s.principalRepaid)} ({pct(s.principalRepaid / l.principal)})</div>
                    <div><span className="text-ink-muted">Interest paid </span>{fmt0(s.interestPaid)}</div>
                    <div><span className="text-ink-muted">Interest to come </span>{fmt0(s.remainingInterest)}</div>
                    <div><span className="text-ink-muted">Next </span>{s.nextDue ? `${fmt2(s.nextDue.payment)} · ${monthLabel(s.nextDue.dueDate)}` : "none"}</div>
                  </div>

                  {(s.arrears > 0.05 || s.assumed.length > 0 || s.aheadOfPlan > 1) && (
                    <div className="mt-4 space-y-2">
                      {s.arrears > 0.05 && (
                        <div className="border-l-2 border-accent-terracotta pl-3 text-sm text-ink">
                          Received {fmt2(s.regularReceived)} against {fmt2(s.regularDue)} due, so <strong className="font-medium">{fmt2(s.arrears)} behind schedule</strong>. Record a catch-up payment (kind “correction”) once it is paid.
                        </div>
                      )}
                      {s.assumed.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 border-l-2 border-brand-tan pl-3 text-sm text-ink">
                          {s.assumed.length} instalment(s) since {s.lastRecordedPayment ?? "the start"} are assumed paid by direct debit ({s.assumed.map((r) => monthLabel(r.dueDate)).join(", ")}).
                          <button type="button" className="btn-secondary !py-1" onClick={() => void confirmAssumed(s)}>Confirm as paid</button>
                        </div>
                      )}
                      {s.aheadOfPlan > 1 && (
                        <div className="border-l-2 border-brand-green pl-3 text-sm text-ink">{fmt0(s.aheadOfPlan)} ahead of the original plan thanks to extra repayments.</div>
                      )}
                    </div>
                  )}

                  <div className="mt-6 grid gap-8 lg:grid-cols-2">
                    <div>
                      <div className="eyebrow mb-2">Payments received</div>
                      <div className="max-h-72 overflow-y-auto">
                        <table className="table-base w-full text-sm">
                          <thead><tr><th className="text-left">Date</th><th className="text-right">Amount</th><th className="text-left">Kind</th><th /></tr></thead>
                          <tbody>
                            {mine.map((p) => (
                              <tr key={p.id} title={p.note ?? undefined}>
                                <td>{p.paid_on}</td>
                                <td className="text-right">{fmt2(Number(p.amount))}</td>
                                <td className="text-ink-muted">{p.kind}{p.source === "ledger" ? " · ledger" : p.source === "direct_debit" ? " · direct debit" : ""}</td>
                                <td className="text-right">{p.source !== "ledger" && <button type="button" className="help-text hover:text-ink" onClick={() => void deletePayment(p.id)}>Delete</button>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <form className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); void addPayment(e.currentTarget, l.id); }}>
                        <input name="paid_on" type="date" required className="input sm:col-span-1" defaultValue={todayIso()} />
                        <input name="amount" inputMode="decimal" required placeholder="Amount" className="input" />
                        <select name="kind" className="input" defaultValue="extra">
                          <option value="extra">Extra repayment</option>
                          <option value="instalment">Instalment</option>
                          <option value="correction">Catch-up</option>
                        </select>
                        <input name="note" placeholder="Note" className="input" />
                        <button type="submit" className="btn-secondary">Add</button>
                      </form>
                    </div>
                    <div>
                      <div className="eyebrow mb-2">Statement settings</div>
                      <div className="grid gap-2">
                        <label className="text-sm"><span className="label">Lender email</span>
                          <input className="input" defaultValue={l.lender_email ?? ""} placeholder="Where the quarterly statement goes" onBlur={(e) => e.target.value !== (l.lender_email ?? "") && void patchLoan(l.id, { lender_email: e.target.value })} />
                        </label>
                        <label className="text-sm"><span className="label">Greeting</span>
                          <input className="input" defaultValue={l.lender_greeting ?? ""} placeholder="Beste mevrouw Kruize" onBlur={(e) => e.target.value !== (l.lender_greeting ?? "") && void patchLoan(l.id, { lender_greeting: e.target.value })} />
                        </label>
                        <label className="text-sm"><span className="label">Statement language</span>
                          <select className="input" value={l.statement_language} onChange={(e) => void patchLoan(l.id, { statement_language: e.target.value })}>
                            <option value="nl">Dutch</option>
                            <option value="en">English</option>
                          </select>
                        </label>
                      </div>
                      {l.notes && <p className="help-text mt-3">{l.notes}</p>}
                    </div>
                  </div>

                  <button type="button" className="btn-ghost mt-4 !px-0" onClick={() => setOpenSchedule(openSchedule === l.id ? null : l.id)}>
                    {openSchedule === l.id ? "Hide schedule" : "Show full schedule"}
                  </button>
                  {openSchedule === l.id && (
                    <div className="mt-2 max-h-96 overflow-y-auto">
                      <table className="table-base w-full text-sm">
                        <thead><tr><th className="text-left">#</th><th className="text-left">Due</th><th className="text-right">Instalment</th><th className="text-right">Interest</th><th className="text-right">Principal</th><th className="text-right">Extra</th><th className="text-right">Balance</th><th className="text-right">Original plan</th><th className="text-left">Status</th></tr></thead>
                        <tbody>
                          {s.rows.map((r, idx) => (
                            <tr key={r.n} className={r.status === "future" ? "text-ink-muted" : ""}>
                              <td>{r.n}</td>
                              <td>{monthLabel(r.dueDate)}</td>
                              <td className="text-right">{fmt2(r.payment)}</td>
                              <td className="text-right">{fmt2(r.interest)}</td>
                              <td className="text-right">{fmt2(r.principal)}</td>
                              <td className="text-right">{r.extra ? fmt2(r.extra) : ""}</td>
                              <td className="text-right">{fmt2(r.balance)}</td>
                              <td className="text-right text-ink-quiet">{contract[idx] ? fmt2(contract[idx].balance) : ""}</td>
                              <td>{r.status === "due" ? "paid" : r.status === "assumed" ? "direct debit" : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}

            {/* ---- Prepayment analysis ---- */}
            {targetState && result && (
              <section className="mt-14 border-t border-hairline pt-6">
                <div className="eyebrow">Analysis</div>
                <h2 className="section-title mt-1">What if we repay faster?</h2>
                <p className="help-text mt-1 max-w-3xl">
                  Neither loan has a prepayment fee. The question is whether a euro is better used to repay {pct(targetState.loan.annual_rate, 2)} debt, or kept as cash (or for location 4).
                  Interest is tax deductible and interest earned is taxed, so both sides are compared after corporate tax.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  <label className="text-sm"><span className="label">Loan</span>
                    <select className="input" value={targetState.loan.id} onChange={(e) => setTarget(e.target.value)}>
                      {states.map((s) => <option key={s.loan.id} value={s.loan.id}>{s.loan.name} ({pct(s.loan.annual_rate, 2)})</option>)}
                    </select>
                  </label>
                  <label className="text-sm"><span className="label">One-off extra</span>
                    <input className="input" inputMode="numeric" value={lump} onChange={(e) => setLump(Number(e.target.value.replace(/\D/g, "")) || 0)} />
                  </label>
                  <label className="text-sm"><span className="label">Paid on</span>
                    <input className="input" type="date" value={lumpDate} onChange={(e) => setLumpDate(e.target.value)} />
                  </label>
                  <label className="text-sm"><span className="label">Extra per month</span>
                    <input className="input" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(Number(e.target.value.replace(/\D/g, "")) || 0)} />
                  </label>
                  <label className="text-sm"><span className="label">Effect</span>
                    <select className="input" value={mode} onChange={(e) => setMode(e.target.value as PrepayMode)}>
                      <option value="shorten">Same instalment, shorter</option>
                      <option value="keepterm">Same end date, lower instalment</option>
                    </select>
                  </label>
                  <label className="text-sm"><span className="label">Corporate tax</span>
                    <select className="input" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
                      <option value={0.19}>19% (first €200k)</option>
                      <option value={0.258}>25.8%</option>
                      <option value={0}>Ignore tax</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4">
                  <span className="label">Compare with: what the cash otherwise earns or costs</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {ALT_PRESETS.map((p) => (
                      <button key={p.label} type="button" title={p.hint} onClick={() => setAltRate(p.rate)} className={Math.abs(altRate - p.rate) < 1e-6 ? "btn-primary !py-1" : "btn-secondary !py-1"}>
                        {p.label} · {pct(p.rate, 1)}
                      </button>
                    ))}
                    <input className="input !w-24" type="number" step="0.1" value={(altRate * 100).toFixed(1)} onChange={(e) => setAltRate(Number(e.target.value) / 100)} />
                    <span className="help-text">%</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                  <Stat label="Interest saved" value={fmt0(result.interestSaved)} sub={`${fmt0(result.interestSavedAfterTax)} after tax`} />
                  <Stat label="Paid off" value={monthLabel(result.payoffScen)} sub={result.monthsSaved > 0 ? `${result.monthsSaved} months earlier` : `plan: ${monthLabel(result.payoffBase)}`} />
                  <Stat label="Extra cash out, 12 months" value={fmt0(result.cashOutFirst12)} sub="less liquidity for location 4" />
                  <Stat label="Net value today" value={fmt0(result.netValueToday)} sub={`vs cash at ${pct(altRate, 1)}`} tone={result.netValueToday < 0 ? "warn" : undefined} />
                </div>
                <p className="mt-4 text-sm text-ink">{verdict}</p>

                <div className="mt-8">
                  <div className="eyebrow mb-2">Net value of a one-off repayment today, vs cash at {pct(altRate, 1)} ({taxRate ? `${pct(taxRate, 1)} tax` : "no tax"})</div>
                  <table className="table-base w-full text-sm">
                    <thead><tr><th className="text-left">Loan</th><th className="text-right">€25k</th><th className="text-right">€50k</th><th className="text-right">€100k</th><th className="text-right">€250k</th><th className="text-right">Everything</th></tr></thead>
                    <tbody>
                      {ladder.map((row) => (
                        <tr key={row.loan.id}>
                          <td>{row.loan.name} · {pct(row.loan.annual_rate, 2)}</td>
                          {row.cells.map((c, i) => (
                            <td key={i} className={`text-right ${c.netValueToday < 0 ? "text-accent-terracotta" : ""}`} title={`Interest saved ${fmt0(c.interestSaved)}; paid off ${monthLabel(c.payoffScen)}`}>
                              {fmt0(c.netValueToday)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="help-text mt-2">If you prepay at all, start with the loan with the highest rate. Hover a cell for interest saved and payoff month.</p>
                </div>
              </section>
            )}

            {/* ---- Lender statement ---- */}
            <section className="mt-14 border-t border-hairline pt-6">
              <div className="eyebrow">Lender statement</div>
              <h2 className="section-title mt-1">Quarterly overview for the lender</h2>
              <p className="help-text mt-1 max-w-3xl">
                On the 2nd day of each quarter you get a preview by email. Nothing reaches the lender until you press Send here; you are always in cc.
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm"><span className="label">Quarter ending</span>
                  <select className="input" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setStmt(null); }}>
                    {quarterOptions.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => void statement("render")}>{busy === "render" ? "Building…" : "Show statement"}</button>
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => void statement("preview")}>{busy === "preview" ? "Sending…" : "Email preview to me"}</button>
                <button type="button" className="btn-primary" disabled={!!busy || !stmt || !stmt.some((s) => s.to.length)} onClick={() => void statement("send")}>{busy === "send" ? "Sending…" : "Send to lender"}</button>
              </div>
              {stmt?.map((s, i) => (
                <div key={i} className="mt-5">
                  {s.warnings.length > 0 && (
                    <ul className="mb-3 space-y-1 border-l-2 border-brand-tan pl-3 text-sm text-ink">{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  )}
                  {!s.to.length && <p className="mb-3 text-sm text-accent-terracotta">Add the lender email above to be able to send.</p>}
                  <div className="help-text mb-2">Subject: {s.subject}{s.to.length ? ` · to ${s.to.join(", ")}` : ""}</div>
                  <iframe title="Statement preview" srcDoc={s.html} className="h-[900px] w-full border border-hairline bg-white" />
                </div>
              ))}
              {reports.length > 0 && (
                <div className="mt-6">
                  <div className="eyebrow mb-2">History</div>
                  <table className="table-base w-full text-sm">
                    <thead><tr><th className="text-left">When</th><th className="text-left">Quarter</th><th className="text-left">Status</th><th className="text-left">To</th></tr></thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} title={r.error ?? undefined}>
                          <td>{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                          <td>{r.period_start} to {r.period_end}</td>
                          <td className={r.status === "failed" ? "text-accent-terracotta" : ""}>{r.status.replace(/_/g, " ")}</td>
                          <td className="text-ink-muted">{r.recipients.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
