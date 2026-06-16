"use client";

type LocationOption = { id: string; name: string };

type LocationPickerProps = {
  value: string;
  onChange: (id: string) => void;
  options: LocationOption[];
  loading?: boolean;
  disabled?: boolean;
};

export function LocationPicker({
  value,
  onChange,
  options,
  loading = false,
  disabled = false,
}: LocationPickerProps) {
  if (loading) {
    return (
      <p className="help-text" aria-live="polite">
        Loading locations…
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <div className="alert-warning" role="alert">
        <p className="font-medium text-ink">No locations available</p>
        <p className="mt-1">
          Your account is not linked to a kitchen yet, or locations could not load. Try refreshing
          the page. If it persists, ask an administrator to assign you (Admin → Users).
        </p>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Your location"
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map((loc) => {
        const selected = value === loc.id;
        return (
          <button
            key={loc.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(loc.id)}
            className={`min-h-[48px] rounded-xl border px-4 py-3 text-left text-base font-medium touch-manipulation transition-colors ${ selected ? "border-brand-green bg-brand-green text-white" : "border-brand-green/20 bg-surface text-ink hover:border-brand-green/35 hover:bg-brand-sand/30" }`}
          >
            {loc.name}
          </button>
        );
      })}
    </div>
  );
}
