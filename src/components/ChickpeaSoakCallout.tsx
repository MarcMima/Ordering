/** Same soak callout as prep list — dry kg rounded to 5 kg steps. */
export function ChickpeaSoakCallout({ kg, className = "" }: { kg: number; className?: string }) {
  if (kg <= 0) return null;
  return (
    <div
      className={`mb-4 rounded-xl border-2 border-accent-orange/70 bg-gradient-to-br from-brand-orange/20 via-brand-sand/90 to-brand-sand/60 p-5 shadow-md ring-2 ring-accent-orange/25 print:border-brand-green/20 print:bg-background print:text-ink print:shadow-none print:ring-0 ${className}`.trim()}
      role="status"
    >
      <p className="text-sm font-bold uppercase tracking-wider text-accent-orange">Soak today (dry chickpeas)</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{kg} kg dry chickpeas</p>
      <p className="mt-3 text-sm font-medium leading-relaxed text-ink-soft print:font-normal">
        Round up to full 5&nbsp;kg bags. Soak today for Falafel / Hummus prep on the following day (after overnight
        soak).
      </p>
    </div>
  );
}
