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
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← HACCP weekoverzicht
          </Link>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-600 dark:bg-zinc-800">
          <Link
            href={`${basePath}?week=${prevQ}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            ← Week
          </Link>
          <span className="px-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-300">
            {year} · week {week}
          </span>
          <Link
            href={`${basePath}?week=${nextQ}`}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Week →
          </Link>
        </div>
      </div>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">{title}</h1>
    </div>
  );
}
