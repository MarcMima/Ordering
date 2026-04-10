"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { AppFormKey } from "@/lib/appFormKeys";

export function useAppFormVisibility() {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("app_form_settings").select("form_key, visible");
    setLoading(false);
    if (error || !data) {
      setVisible({});
      return;
    }
    const m: Record<string, boolean> = {};
    for (const row of data as { form_key: string; visible: boolean }[]) {
      m[row.form_key] = row.visible;
    }
    setVisible(m);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  function isVisible(key: AppFormKey): boolean {
    return visible[key] !== false;
  }

  return { isVisible, loading, visible, refetch };
}
