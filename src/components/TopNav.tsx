"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocation } from "@/contexts/LocationContext";

export function TopNav() {
  const { locationId, locationOptions } = useLocation();
  const currentName = locationOptions.find((l) => l.id === locationId)?.name ?? "Select location";

  return (
    <nav className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <Link
          href="/dashboard"
          className="relative shrink-0 rounded-md bg-white"
          aria-label="Mima — Fresh Mediterranean"
        >
          <Image
            src="/mima-logo.png"
            alt=""
            width={800}
            height={426}
            className="block h-9 w-auto max-w-[min(200px,42vw)] object-contain object-left"
            priority
            sizes="(max-width: 640px) 42vw, 200px"
          />
        </Link>
        <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{currentName}</span>
          <Link
            href="/dashboard"
            className="text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Change location
          </Link>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Admin
        </Link>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
          aria-label="User menu"
        >
          U
        </button>
      </div>
    </nav>
  );
}
