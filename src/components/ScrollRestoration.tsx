"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "mima:scrollY:";

/**
 * Persists vertical scroll per route in sessionStorage and restores it when the tab becomes
 * visible again (e.g. phone unlocked). Complements browser scroll restoration on full navigation.
 */
export function ScrollRestoration() {
  const pathname = usePathname();
  const key = `${STORAGE_PREFIX}${pathname}`;
  const ticking = useRef(false);

  useEffect(() => {
    const save = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        try {
          sessionStorage.setItem(key, String(window.scrollY));
        } catch {
          /* private mode / quota */
        }
      });
    };

    const restore = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw == null) return;
        const y = parseFloat(raw);
        if (!Number.isFinite(y) || y < 0) return;
        requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: "auto" }));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("scroll", save, { passive: true });
    document.addEventListener("visibilitychange", restore);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", save);
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("pagehide", save);
    };
  }, [key]);

  return null;
}
