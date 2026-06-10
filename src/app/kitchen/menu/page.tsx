import { Suspense } from "react";
import { KitchenMenuContent } from "./KitchenMenuContent";

export default function KitchenMenuPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          Loading…
        </div>
      }
    >
      <KitchenMenuContent />
    </Suspense>
  );
}
