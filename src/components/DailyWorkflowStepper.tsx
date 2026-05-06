"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const STEPS = [
  { path: "/stocktake", label: "Stocktake", short: "1" },
  { path: "/prep-list", label: "Prep list", short: "2" },
  { path: "/ordering", label: "Ordering", short: "3" },
] as const;

const DEFAULT_STOCKTAKE_INCOMPLETE_MSG =
  "Stocktake is nog niet compleet (finished products en/of raw ingredients). Toch doorgaan naar de volgende stap?";

export type DailyWorkflowStepperProps = {
  /** When true, clicking “Next” on Stocktake asks for confirmation before navigating. */
  warnStocktakeIncompleteNext?: boolean;
  stocktakeIncompleteMessage?: string;
};

export function DailyWorkflowStepper(props?: DailyWorkflowStepperProps) {
  const {
    warnStocktakeIncompleteNext = false,
    stocktakeIncompleteMessage = DEFAULT_STOCKTAKE_INCOMPLETE_MSG,
  } = props ?? {};
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const index = STEPS.findIndex((s) => s.path === pathname);
  if (index === -1) return null;

  const prevStep = index > 0 ? STEPS[index - 1] : null;
  const nextStep = index < STEPS.length - 1 ? STEPS[index + 1] : null;

  const confirmIfStocktakeIncomplete = () => {
    if (
      pathname === "/stocktake" &&
      warnStocktakeIncompleteNext &&
      typeof window !== "undefined" &&
      !window.confirm(stocktakeIncompleteMessage)
    ) {
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!nextStep) return;
    if (!confirmIfStocktakeIncomplete()) return;
    router.push(nextStep.path);
  };

  const stepClassName = (active: boolean, done: boolean) =>
    `flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : done
          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-100 dark:hover:bg-emerald-900/50"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
    }`;

  return (
    <nav
      aria-label="Daily workflow"
      className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/80"
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Today&apos;s flow
      </p>
      <ol className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((step, i) => {
          const active = i === index;
          const done = i < index;
          const forwardGuard =
            pathname === "/stocktake" && warnStocktakeIncompleteNext && i > index;
          const inner = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                    : done
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "bg-zinc-300 text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200"
                }`}
              >
                {step.short}
              </span>
              <span className="truncate">{step.label}</span>
            </>
          );
          return (
            <li key={step.path} className="flex min-w-0 items-center gap-2 sm:gap-3">
              {i > 0 && (
                <span className="hidden text-zinc-300 sm:inline dark:text-zinc-600" aria-hidden>
                  →
                </span>
              )}
              {forwardGuard ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmIfStocktakeIncomplete()) return;
                    router.push(step.path);
                  }}
                  className={`${stepClassName(active, done)} w-full min-w-0 text-left`}
                  aria-current={active ? "step" : undefined}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  href={step.path}
                  className={stepClassName(active, done)}
                  aria-current={active ? "step" : undefined}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-700">
        {prevStep && (
          <Link
            href={prevStep.path}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to {prevStep.label}
          </Link>
        )}
        {nextStep &&
          (pathname === "/stocktake" ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Next: {nextStep.label} →
            </button>
          ) : (
            <Link
              href={nextStep.path}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Next: {nextStep.label} →
            </Link>
          ))}
        {!nextStep && (
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to dashboard
          </Link>
        )}
      </div>
    </nav>
  );
}
