/** Same soak callout as prep list — dry kg rounded to 5 kg steps. */
export function ChickpeaSoakCallout({ kg, className = "" }: { kg: number; className?: string }) {
  if (kg <= 0) return null;
  return (
    <div
      className={`mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100 print:border-zinc-800 print:bg-zinc-50 print:text-zinc-900 ${className}`.trim()}
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
