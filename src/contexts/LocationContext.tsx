"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { Location } from "@/lib/types";

const STORAGE_KEY = "mima-current-location-id";

type LocationContextValue = {
  locationId: string;
  setLocationId: (id: string) => void;
  locations: Location[];
  locationOptions: { id: string; name: string }[];
  loading: boolean;
  error: string | null;
  refetchLocations: () => Promise<void>;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [locationId, setLocationIdState] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetchLocations = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("locations")
      .select("id, name, full_capacity_revenue, ordering_evening_day_fraction, haccp_store_id")
      .order("name", { ascending: true });
    if (e) {
      setError(e.message);
      setLocations([]);
      return;
    }
    setError(null);
    setLocations((data as Location[]) ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("locations")
        .select("id, name, full_capacity_revenue, ordering_evening_day_fraction, haccp_store_id")
        .order("name", { ascending: true });
      if (!mounted) return;
      if (e) {
        setError(e.message);
        setLocations([]);
        setLoading(false);
        return;
      }
      const list = (data as Location[]) ?? [];
      setLocations(list);
      setError(null);

      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = list.some((l) => l.id === stored);
      if (stored && valid) {
        setLocationIdState(stored);
      } else if (list.length > 0) {
        const first = list[0].id;
        setLocationIdState(first);
        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, first);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const setLocationId = useCallback((id: string) => {
    setLocationIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const locationOptions = locations.map((l) => ({ id: l.id, name: l.name }));

  const value: LocationContextValue = {
    locationId,
    setLocationId,
    locations,
    locationOptions,
    loading,
    error,
    refetchLocations,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
