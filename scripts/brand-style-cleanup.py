#!/usr/bin/env python3
"""Second pass: strip dark: variants and replace remaining legacy color classes."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"

REPLACEMENTS: list[tuple[str, str]] = [
    # Buttons
    (r"rounded-xl bg-zinc-900 px-5 py-2\.5 text-sm font-semibold text-white disabled:opacity-50", "btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"),
    (r"rounded-xl bg-zinc-900 px-4 py-2\.5 text-sm font-medium text-white", "btn-primary rounded-xl px-4 py-2.5 text-sm font-medium"),
    (r"rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50", "btn-primary rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"),
    (r"w-full rounded-xl bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-50", "btn-primary input-lg w-full rounded-xl py-3 text-base font-medium disabled:opacity-50"),
    (r"rounded-xl bg-zinc-200 px-4 py-2\.5 text-sm font-semibold text-ink disabled:opacity-50", "btn-secondary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"),
    (r"rounded-md bg-zinc-900 px-3 py-1\.5 text-sm text-white disabled:opacity-50", "btn-primary px-3 py-1.5 text-sm disabled:opacity-50"),
    (r"rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white", "btn-primary px-3 py-2 text-sm font-medium"),
    (r"rounded-md bg-zinc-900 px-3 py-1\.5 text-sm text-white", "btn-primary px-3 py-1.5 text-sm"),
    (r"rounded bg-zinc-900 px-3 py-1\.5 text-sm font-medium text-white", "btn-primary px-3 py-1.5 text-sm font-medium"),
    (r"rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50", "btn-primary px-3 py-2 text-sm disabled:opacity-50"),
    (r"rounded bg-zinc-900 px-2 py-1 text-xs text-white", "btn-primary px-2 py-1 text-xs"),
    (r"rounded bg-zinc-900 px-3 py-1\.5 text-xs font-medium text-white hover:bg-brand-green/90", "btn-primary px-3 py-1.5 text-xs font-medium"),
    (r"rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white", "btn-primary rounded-lg px-3 py-2 text-sm font-medium"),
    (r"h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50", "btn-primary h-11 rounded-xl px-4 text-sm font-medium disabled:opacity-50"),
    (r"h-10 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-50", "btn-primary h-10 rounded-lg px-3 text-sm font-medium disabled:opacity-50"),
    (r"mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60", "btn-primary mt-4 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"),
    (r"rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700", "btn-accent rounded px-4 py-2 text-sm font-medium"),
    (r"rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", "alert-warning rounded-xl p-4 text-sm"),
    (r"rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800", "alert-warning rounded-xl p-4 text-sm"),
    (r"rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800", "badge-success rounded-xl border p-3 text-sm"),
    (r"rounded bg-amber-100 px-1", "rounded bg-brand-sand/70 px-1"),
    (r"bg-emerald-100 text-emerald-700", "badge-success"),
    (r"bg-amber-100 text-amber-700", "badge-pending"),
    (r"bg-amber-100 text-amber-900", "badge-pending"),
    (r"bg-red-100 text-red-600", "alert-error rounded px-2 py-0.5 text-xs"),
    (r"text-amber-700", "text-accent-orange"),
    (r"text-amber-600", "text-accent-orange"),
    (r"text-red-500", "text-accent-terracotta"),
    (r"focus:ring-zinc-400", "focus:ring-brand-sage/50"),
    (r"bg-blue-100 text-blue-700", "bg-brand-sage/30 text-brand-green"),
    (r"bg-purple-100 text-purple-700", "bg-brand-sand/70 text-ink-soft"),
    (r"rounded-full bg-zinc-200/90 px-2 py-0\.5 text-\[10px\] font-medium uppercase tracking-wide text-ink-soft/80", "badge-pending rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"),
    # Status / alerts
    (r"rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950", "alert-warning rounded-lg"),
    (r"rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900", "alert-warning rounded-lg text-xs"),
    (r"rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950", "alert-warning rounded-lg text-xs"),
    (r"mb-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950", "alert-warning mb-4 rounded-xl border-2 p-4"),
    (r"mb-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900", "alert-warning mb-2 rounded-lg px-3 py-2 text-sm font-medium"),
    (r"rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950", "badge-success rounded-xl border px-4 py-3 text-sm"),
    (r"mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800", "badge-success mb-4 rounded-xl p-4 text-sm"),
    (r"text-xs text-emerald-700", "text-xs text-brand-green"),
    (r"text-xs text-amber-700", "text-xs text-accent-orange"),
    (r"bg-amber-100 text-amber-950", "badge-pending"),
    # Priority borders (prep-list)
    (r"border-l-4 border-red-500 bg-red-50/50", "border-l-4 border-accent-terracotta bg-brand-sand/40"),
    (r"border-l-4 border-amber-500 bg-amber-50/50", "border-l-4 border-accent-orange bg-brand-sand/50"),
    (r"border-l-4 border-emerald-500 bg-emerald-50/30", "border-l-4 border-brand-green bg-brand-sage/25"),
    # HACCP form status buttons
    (r"border-emerald-300 bg-emerald-50 text-emerald-900", "border-brand-green bg-brand-sage/25 text-brand-green"),
    (r"border-red-300 bg-red-50 text-red-800", "border-accent-terracotta bg-brand-sand/40 text-accent-terracotta"),
    (r"border-amber-400 bg-amber-50 text-amber-950", "border-accent-orange bg-brand-sand/60 text-ink"),
    (r"border-emerald-500 bg-emerald-50", "border-brand-green bg-brand-sage/25"),
    (r"border-red-500 bg-red-50", "border-accent-terracotta bg-brand-sand/40"),
    # Progress bars
    (r"bg-zinc-200", "bg-brand-sand/60"),
    (r"bg-emerald-500", "bg-brand-green"),
    (r"bg-amber-500", "bg-accent-orange"),
    # Misc zinc
    (r"text-zinc-100", "text-white"),
    (r"text-zinc-200", "text-brand-sand"),
    (r"text-zinc-300", "text-ink-soft/50"),
    (r"decoration-zinc-400", "decoration-brand-tan"),
    (r"border-zinc-900", "border-brand-green"),
    (r"border-zinc-400", "border-brand-green/25"),
    (r"hover:border-zinc-400", "hover:border-brand-green/30"),
    # Broken opacity from first pass
    (r"bg-brand-sand/50/70", "bg-brand-sand/50"),
    (r"hover:bg-brand-sand/50/90", "hover:bg-brand-sand/50"),
    (r"dark:hover:bg-brand-green/90/60", ""),
    (r"dark:bg-brand-green/85/50", ""),
    (r" card dark:border-brand-green/20 dark:bg-brand-green", " card"),
]

DARK_RE = re.compile(r"\s+dark:[^\s\"']+")


def strip_dark(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        q, val = m.group(1), m.group(2)
        cleaned = DARK_RE.sub("", val)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        return f"className={q}{cleaned}{q}"

    return re.sub(r'className=(["\'])(.*?)\1', repl, text, flags=re.DOTALL)


def main() -> None:
    changed = 0
    for path in sorted(ROOT.rglob("*.tsx")):
        original = path.read_text(encoding="utf-8")
        updated = original
        for pat, sub in REPLACEMENTS:
            updated = re.sub(pat, sub, updated)
        updated = strip_dark(updated)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
            print(f"updated {path.relative_to(ROOT.parent)}")
    print(f"done: {changed} files")


if __name__ == "__main__":
    main()
