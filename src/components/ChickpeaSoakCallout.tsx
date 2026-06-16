/** Same soak callout as prep list — dry kg rounded to 5 kg steps. */
export function ChickpeaSoakCallout({ kg, className = "" }: { kg: number; className?: string }) {
  if (kg <= 0) return null;
  return (
    <div
      className={`alert-warning mb-4 rounded-xl border-2 p-4 print:border-brand-green/20 print:bg-background print:text-ink ${className}`.trim()}
    >
      <p className="text-base font-bold uppercase tracking-wide">Soak today (dry chickpeas)</p>
      <p className="mt-2 text-lg font-semibold tabular-nums">{kg} kg dry chickpeas</p>
      <p className="mt-2 text-sm leading-relaxed opacity-95 print:opacity-100">
        Round up to full 5&nbsp;kg bags. Soak today for Falafel / Hummus prep on the following day (after overnight
        soak).
      </p>
    </div>
  );
}
