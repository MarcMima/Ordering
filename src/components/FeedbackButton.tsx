"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";

const FEEDBACK_TYPES = [
  { value: "probleem", label: "Probleem" },
  { value: "idee", label: "Idee" },
  { value: "anders", label: "Anders" },
] as const;

type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

/**
 * Klein feedbackknopje in de header, op elke pagina. Locatie en pagina gaan automatisch
 * mee, zodat de manager alleen de boodschap hoeft te typen.
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const { locationId } = useLocation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("probleem");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sluiten met Escape; klikken buiten het paneel laat de tekst staan tot verzonden.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = async () => {
    const text = message.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("app_feedback").insert({
      location_id: locationId ?? null,
      page: pathname ?? null,
      type,
      message: text,
    });
    setSaving(false);
    if (insertError) {
      // Zichtbaar maken, niet inslikken: anders denkt de manager dat het verstuurd is.
      console.error("app_feedback insert failed:", insertError.message);
      setError("Niet verzonden — controleer je verbinding en probeer het opnieuw.");
      return;
    }
    setMessage("");
    setSaved(true);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setSaved(false);
          setError(null);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="btn-ghost shrink-0"
        title="Feedback over de app"
      >
        Feedback
      </button>

      {saved && !open && (
        <span
          role="status"
          className="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-md bg-brand-green px-2 py-1 text-xs font-medium text-white"
        >
          Bedankt — verzonden.
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Feedback over de app"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-brand-green/15 bg-surface p-3 shadow-lg"
        >
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_TYPES.map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(opt.value)}
                  className={
                    active
                      ? "rounded-full border border-brand-green bg-brand-green/10 px-2.5 py-0.5 text-xs font-medium text-brand-green"
                      : "rounded-full border border-brand-green/20 bg-background px-2.5 py-0.5 text-xs text-ink-soft hover:bg-brand-sand/40"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Wat wil je kwijt?"
            aria-label="Bericht"
            className="mt-2 w-full rounded-lg border border-brand-green/15 bg-background px-2 py-1.5 text-sm text-ink"
          />

          {error && (
            <p className="mt-1 text-xs font-medium text-accent-terracotta">{error}</p>
          )}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || message.trim() === ""}
              className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {saving ? "Versturen…" : "Versturen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
