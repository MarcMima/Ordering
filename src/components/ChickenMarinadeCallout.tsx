"use client";

/**
 * Toont wanneer er kip op de bestellijst staat: marineren gebeurt de dag vóór bereiding.
 */

export function ChickenMarinadeCallout({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
      <p className="font-medium">Kip (marinade)</p>
      <p className="mt-1 text-xs leading-relaxed opacity-95">
        Plan bestellingen zo dat ongemarineerde kip <strong>minstens één dag van tevoren</strong> binnenkomt: marinaden
        (dagdeel) gebeuren de dag vóór gebruik in de keuken. Als je vandaag voor morgen bestelt, noteer in de keuken dat
        de batch eerst gemarineerd moet worden voordat hij op het menu gaat.
      </p>
    </div>
  );
}

export function rawIngredientIsChickenForMarinade(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes("chickpea")) return false;
  return n.includes("chicken");
}
