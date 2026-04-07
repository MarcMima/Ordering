"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  id: string;
  dragLabel: string;
  className?: string;
  children: React.ReactNode;
};

/** One stocktake row with a press-and-hold drag handle (listeners use touch-none to avoid scroll conflict). */
export function SortableStocktakeItem({ id, dragLabel, className = "", children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
    opacity: isDragging ? 0.92 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className={className}>
      <div className="flex items-start gap-2 sm:gap-3">
        <button
          type="button"
          className="mt-0.5 flex h-14 min-h-[56px] w-11 shrink-0 touch-none select-none items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          {...attributes}
          {...listeners}
          aria-label={`Hold and drag to reorder: ${dragLabel}`}
        >
          <GripIcon />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </li>
  );
}

function GripIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
