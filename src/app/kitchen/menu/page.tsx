import { Suspense } from "react";
import { KitchenMenuContent } from "./KitchenMenuContent";

export default function KitchenMenuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-ink-soft/80">
          Loading…
        </div>
      }
    >
      <KitchenMenuContent />
    </Suspense>
  );
}
