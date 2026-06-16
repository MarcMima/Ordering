import Link from "next/link";
import { formatWeekYearParam, shiftWeekYear } from "@/lib/haccp/week";

type Props = {
  title: string;
  week: number;
  year: number;
  basePath: string;
};

export function HaccpPageHeader({ title, week, year, basePath }: Props) {
  const wy = formatWeekYearParam(week, year);
  const prev = shiftWeekYear(week, year, -1);
  const next = shiftWeekYear(week, year, 1);
  const prevQ = formatWeekYearParam(prev.week, prev.year);
  const nextQ = formatWeekYearParam(next.week, next.year);

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-ink-soft/80 hover:text-ink"
          >
            ← HACCP overview
          </Link>
        </div>
        <div className="flex items-center gap-1 card rounded-lg p-1">
          <Link
            href={`${basePath}?week=${prevQ}`}
            className="rounded-md px-3 py-1.5 label hover:bg-brand-sand/50"
          >
            ← Week
          </Link>
          <span className="px-2 text-sm tabular-nums text-ink-soft">
            {year} · week {week}
          </span>
          <Link
            href={`${basePath}?week=${nextQ}`}
            className="rounded-md px-3 py-1.5 label hover:bg-brand-sand/50"
          >
            Week →
          </Link>
        </div>
      </div>
      <h1 className="section-title text-xl sm:text-2xl">{title}</h1>
    </div>
  );
}
