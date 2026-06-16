#!/usr/bin/env python3
"""Replace legacy zinc/gray Tailwind classes with MIMA brand tokens (styling only)."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

# Order matters: longer / more specific patterns first.
CLASS_REPLACEMENTS: list[tuple[str, str]] = [
    # Page shells
    (r"min-h-screen bg-zinc-50(?:\s+font-sans)?", "min-h-screen bg-background font-sans"),
    (r"flex min-h-screen flex-col items-center justify-center bg-zinc-50", "flex min-h-screen flex-col items-center justify-center bg-background"),
    (r"flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600", "flex min-h-screen items-center justify-center bg-background text-ink-soft"),
    # Buttons (primary)
    (r"rounded-xl bg-zinc-900 px-4 py-2\.5 text-sm font-semibold text-white hover:bg-zinc-800", "btn-primary min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold"),
    (r"rounded-xl bg-zinc-900 font-medium text-white hover:bg-zinc-800 disabled:opacity-50", "btn-primary input-lg rounded-xl font-medium disabled:opacity-50"),
    (r"h-12 w-full rounded-xl bg-zinc-900 font-medium text-white hover:bg-zinc-800 disabled:opacity-50", "btn-primary input-lg w-full rounded-xl font-medium disabled:opacity-50"),
    (r"rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800", "btn-primary rounded-full px-6 py-3 font-medium"),
    (r"rounded-md bg-zinc-900 px-2 py-1\.5 text-sm font-medium text-white hover:bg-zinc-800", "btn-primary px-2 py-1.5 text-sm"),
    (r"inline-flex min-h-\[44px\] items-center justify-center rounded-xl bg-zinc-900 px-4 py-2\.5 text-sm font-semibold text-white hover:bg-zinc-800", "btn-primary min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold"),
    (r"bg-zinc-900 text-white", "bg-brand-green text-white"),
    (r"hover:bg-zinc-800", "hover:bg-brand-green/90"),
    (r"hover:bg-zinc-700", "hover:bg-brand-green/85"),
  # Secondary buttons / borders
    (r"rounded-full border-2 border-zinc-900 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100", "btn-secondary rounded-full border-2 px-6 py-3 font-medium"),
    (r"border-2 border-zinc-900", "border-2 border-brand-green"),
    # Cards
    (r"rounded-xl border border-zinc-200 bg-white p-4", "card"),
    (r"rounded-xl border border-zinc-200 bg-white px-4 py-4", "card-interactive px-4 py-4"),
    (r"rounded-xl border border-zinc-200 bg-white", "card"),
    (r"rounded-lg border border-zinc-200 bg-white", "card rounded-lg"),
    (r"border border-zinc-200 bg-white", "border border-brand-sage/50 bg-surface"),
    (r"border-b border-zinc-200 bg-white", "nav-header"),
    (r"border-t border-zinc-200 bg-white/95", "border-t border-brand-green/10 bg-surface/95"),
    # Inputs
    (r"h-12 w-full rounded-xl border border-zinc-300 bg-white px-4", "input-lg w-full"),
    (r"w-full rounded-lg border border-zinc-300 bg-white px-3 py-2", "input"),
    (r"w-full rounded-xl border border-zinc-300 bg-white px-4", "input-lg w-full"),
    (r"border border-zinc-300 bg-white", "border border-brand-green/15 bg-surface"),
    # Alerts / badges
    (r"rounded-xl bg-red-50 p-3 text-sm text-red-700", "alert-error"),
    (r"rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700", "alert-error rounded-lg"),
    (r"rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950", "alert-warning"),
    (r"bg-emerald-100 text-emerald-800", "badge-success"),
    (r"bg-amber-100 text-amber-800", "badge-pending"),
    (r"bg-emerald-100 text-emerald-900", "badge-success"),
    # Typography
    (r"text-3xl font-semibold tracking-tight text-zinc-900", "page-title text-3xl tracking-tight"),
    (r"text-2xl font-semibold text-zinc-900", "page-title"),
    (r"text-xl font-semibold text-zinc-900", "section-title text-xl"),
    (r"text-lg font-semibold text-zinc-900", "section-title"),
    (r"font-medium text-zinc-900", "font-medium text-ink"),
    (r"font-semibold text-zinc-900", "font-semibold text-ink"),
    (r"text-sm font-medium text-zinc-700", "label"),
    (r"mb-1 block text-sm font-medium text-zinc-700", "label"),
    (r"text-sm text-zinc-600", "help-text"),
    (r"text-sm text-zinc-500", "help-text"),
    (r"text-xs text-zinc-500", "text-xs text-ink-soft/70"),
    (r"text-xs font-medium uppercase tracking-wide text-zinc-500", "text-xs font-medium uppercase tracking-wide text-ink-soft/70"),
    (r"text-zinc-900", "text-ink"),
    (r"text-zinc-800", "text-ink"),
    (r"text-zinc-700", "text-ink-soft"),
    (r"text-zinc-600", "text-ink-soft"),
    (r"text-zinc-500", "text-ink-soft/80"),
    (r"text-zinc-400", "text-ink-soft/60"),
    (r"text-amber-800", "text-accent-terracotta"),
    (r"text-amber-200", "text-accent-orange"),
    # Borders / backgrounds
    (r"border-zinc-200", "border-brand-green/10"),
    (r"border-zinc-300", "border-brand-green/15"),
    (r"border-zinc-100", "border-brand-green/10"),
    (r"border-zinc-700", "border-brand-green/20"),
    (r"border-zinc-600", "border-brand-green/20"),
    (r"border-zinc-800", "border-brand-green/20"),
    (r"bg-zinc-100", "bg-brand-sand/50"),
    (r"bg-zinc-50/90", "bg-background/90"),
    (r"bg-zinc-50", "bg-background"),
    (r"bg-zinc-800", "bg-brand-green"),
    (r"bg-zinc-700", "bg-brand-green/80"),
    (r"hover:bg-zinc-200", "hover:bg-brand-sand/60"),
    (r"hover:bg-zinc-100", "hover:bg-brand-sand/40"),
    (r"hover:bg-zinc-50", "hover:bg-brand-sand/25"),
    (r"hover:border-zinc-300", "hover:border-brand-green/25"),
    (r"hover:border-zinc-600", "hover:border-brand-green/30"),
    (r"hover:text-zinc-900", "hover:text-brand-green"),
    (r"hover:text-zinc-700", "hover:text-brand-green"),
    (r"hover:text-zinc-100", "hover:text-ink"),
    (r"divide-zinc-200", "divide-brand-green/10"),
    (r"ring-zinc-200", "ring-brand-sage/40"),
    (r"focus:ring-zinc-200", "focus:ring-brand-sage/50"),
    (r"focus:ring-zinc-600", "focus:ring-brand-sage/50"),
    # Nav links
    (r"rounded-md px-2 py-1\.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900", "nav-link"),
    (r"shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 touch-manipulation", "btn-ghost shrink-0 touch-manipulation"),
    # Misc
    (r"bg-white", "bg-surface"),
    (r"text-white", "text-white"),
]

DARK_CLASS_RE = re.compile(r"\s+dark:[^\s\"']+")
INLINE_WHITE_BG = re.compile(
    r'style=\{\{\s*backgroundColor:\s*["\']#ffffff["\']\s*\}\}'
)
INLINE_WHITE_BG_REPLACE = 'className="bg-surface"'


def strip_dark_classes(text: str) -> str:
    def repl_class_value(m: re.Match[str]) -> str:
        quote = m.group(1)
        value = m.group(2)
        cleaned = DARK_CLASS_RE.sub("", value)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        return f"className={quote}{cleaned}{quote}"

    return re.sub(
        r'className=(["\'])(.*?)\1',
        repl_class_value,
        text,
        flags=re.DOTALL,
    )


def apply_replacements(text: str) -> str:
    for pattern, repl in CLASS_REPLACEMENTS:
        text = re.sub(pattern, repl, text)
    text = strip_dark_classes(text)
    text = INLINE_WHITE_BG.sub("", text)
    # Clean up orphaned className duplicates on Link logo
    text = text.replace('className="rounded-md bg-surface"', 'className="rounded-md bg-surface"')
    return text


SKIP = {
    ROOT / "app" / "dashboard" / "page.tsx",
    ROOT / "components" / "TopNav.tsx",
    ROOT / "components" / "BottomNav.tsx",
    ROOT / "components" / "LocationPicker.tsx",
    ROOT / "components" / "DailyWorkflowStepper.tsx",
    ROOT / "app" / "globals.css",
}


def main() -> None:
    changed = 0
    for path in sorted(ROOT.rglob("*.tsx")):
        if path in SKIP:
            continue
        original = path.read_text(encoding="utf-8")
        updated = apply_replacements(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(f"updated {path.relative_to(ROOT.parent)}")
    print(f"done: {changed} files")


if __name__ == "__main__":
    main()
