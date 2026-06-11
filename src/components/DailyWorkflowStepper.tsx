"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const STEPS = [
  { path: "/stocktake", label: "Stocktake", short: "1" },
  { path: "/prep-list", label: "Prep list", short: "2" },
  { path: "/ordering", label: "Ordering", short: "3" },
] as const;

type StepPath = (typeof STEPS)[number]["path"];

const DEFAULT_STOCKTAKE_INCOMPLETE_MSG =
  "Stocktake is not complete yet (finished products and/or raw ingredients). Continue to the next step anyway?";

export type DailyWorkflowStepperProps = {
  /** When true, clicking “Next” on Stocktake asks for confirmation before navigating. */
  warnStocktakeIncompleteNext?: boolean;
  stocktakeIncompleteMessage?: string;
  /** Override completed styling. Defaults to route-based "previous steps are done". */
  completedSteps?: Partial<Record<StepPath, boolean>>;
};

export function DailyWorkflowStepper(props?: DailyWorkflowStepperProps) {
  const {
    warnStocktakeIncompleteNext = false,
    stocktakeIncompleteMessage = DEFAULT_STOCKTAKE_INCOMPLETE_MSG,
    completedSteps,
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
        ? "bg-brand-green text-white"
        : done
          ? "bg-brand-sage/30 text-brand-green hover:bg-brand-sage/45"
          : "bg-brand-sand/50 text-ink-soft hover:bg-brand-sand"
    }`;

  return (
    <nav aria-label="Daily workflow" className="card mb-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-soft/70">
        Today&apos;s flow
      </p>
      <ol className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((step, i) => {
          const active = i === index;
          const done =
            completedSteps != null ? Boolean(completedSteps[step.path]) : i < index;
          const forwardGuard =
            pathname === "/stocktake" && warnStocktakeIncompleteNext && i > index;
          const inner = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-white/25 text-white"
                    : done
                      ? "bg-brand-green text-white"
                      : "bg-brand-tan/60 text-ink-soft"
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
                <span className="hidden text-brand-sage/50 sm:inline" aria-hidden>
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
      <div className="flex flex-wrap items-center gap-3 border-t border-brand-green/10 pt-3">
        {prevStep && (
          <Link href={prevStep.path} className="btn-ghost px-0 text-sm">
            ← Back to {prevStep.label}
          </Link>
        )}
        {nextStep &&
          (pathname === "/stocktake" ? (
            <button type="button" onClick={goNext} className="btn-primary min-h-[44px] rounded-xl px-4 py-2.5">
              Next: {nextStep.label} →
            </button>
          ) : (
            <Link
              href={nextStep.path}
              className="btn-primary min-h-[44px] rounded-xl px-4 py-2.5"
            >
              Next: {nextStep.label} →
            </Link>
          ))}
        {!nextStep && (
          <Link href="/dashboard" className="btn-ghost px-0 text-sm">
            ← Back to dashboard
          </Link>
        )}
      </div>
    </nav>
  );
}
