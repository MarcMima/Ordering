"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { isAuthDisabled } from "@/lib/authMode";
import { createClient } from "@/lib/supabase";
import type { Location } from "@/lib/types";

const STORAGE_KEY = "mima-current-location-id";
const DEFAULT_TEST_LOCATION_NAME = "Mima TEST";

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

  const applyLocationList = useCallback((list: Location[]) => {
    setLocations(list);
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const validStored = stored && list.some((l) => l.id === stored);
    if (validStored && stored) {
      setLocationIdState(stored);
    } else if (list.length > 0) {
      const preferred =
        list.find((l) => l.name.toLowerCase() === DEFAULT_TEST_LOCATION_NAME.toLowerCase()) ??
        list[0];
      setLocationIdState(preferred.id);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, preferred.id);
    } else {
      setLocationIdState("");
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refetchLocations = useCallback(async () => {
    const supabase = createClient();
    if (!isAuthDisabled()) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setError(userError?.message ?? null);
        setLocations([]);
        return;
      }
    }
    const { data, error: e } = await supabase
      .from("locations")
      .select(
        "id, name, full_capacity_revenue, ordering_evening_day_fraction, weekly_stocktake_day_of_week, haccp_store_id"
      )
      .order("name", { ascending: true });
    if (e) {
      setError(e.message);
      setLocations([]);
      return;
    }
    setError(null);
    applyLocationList((data as Location[]) ?? []);
  }, [applyLocationList]);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    const loadLocations = async () => {
      setLoading(true);
      if (!isAuthDisabled()) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (!mounted) return;
        if (userError || !user) {
          setError(userError?.message ?? null);
          setLocations([]);
          setLocationIdState("");
          setLoading(false);
          return;
        }
      }

      const { data, error: e } = await supabase
        .from("locations")
        .select(
          "id, name, full_capacity_revenue, ordering_evening_day_fraction, weekly_stocktake_day_of_week, haccp_store_id"
        )
        .order("name", { ascending: true });
      if (!mounted) return;
      if (e) {
        setError(e.message);
        setLocations([]);
        setLoading(false);
        return;
      }
      setError(null);
      applyLocationList((data as Location[]) ?? []);
      setLoading(false);
    };

    void loadLocations();

    if (isAuthDisabled()) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setLocations([]);
        setLocationIdState("");
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        void loadLocations();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applyLocationList]);

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
