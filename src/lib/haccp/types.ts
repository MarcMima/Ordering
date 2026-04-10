import type { Location } from "@/lib/types";

export type HaccpStoreEquipmentRow = {
  id: string;
  store_id: number;
  sort_order: number;
  label: string;
  norm_display: string;
  norm_kind: "lte" | "gte";
  norm_value: number;
  show_fifo: boolean;
  show_exact_temp: boolean;
};

/** One row in haccp_temperaturen.weekly_readings JSON array */
export type HaccpWeeklyReading = {
  equipment_id: string;
  temperature: number | null;
  exact_temperature: number | null;
  fifo_ok: boolean | null;
  clean_ok: boolean | null;
  corrective_action: string | null;
  signature: string | null;
};

export type HaccpTemperaturenRow = {
  id?: string;
  store_id: number;
  week_number: number;
  year: number;
  koelcel_1: (number | null)[];
  koelcel_2: (number | null)[];
  vriezer_1: (number | null)[];
  vriezer_2: (number | null)[];
  vriezer_ijs: (number | null)[];
  koelwerkbank_1: (number | null)[];
  koelwerkbank_2: (number | null)[];
  koelwerkbank_3: (number | null)[];
  saladiere_1: (number | null)[];
  saladiere_2: (number | null)[];
  vaatwasser_wastemperatuur: number | null;
  vaatwasser_naspoeltemp: number | null;
  opmerkingen: string | null;
  paraaf: string | null;
  tht_fifo_ok: (boolean | null)[];
  afgedekt_ok: (boolean | null)[];
  schoonmaak_ok: (boolean | null)[];
  weekly_check_dow?: number | null;
  weekly_readings?: HaccpWeeklyReading[] | unknown;
  created_at?: string;
  updated_at?: string;
};

export function isTemperatureWithinNorm(
  kind: "lte" | "gte",
  norm: number,
  temp: number
): boolean {
  return kind === "lte" ? temp <= norm : temp >= norm;
}

export function getHaccpStoreId(locations: Location[], locationId: string): number {
  if (locationId) {
    const loc = locations.find((l) => l.id === locationId);
    if (loc != null && loc.haccp_store_id != null) {
      const n = Number(loc.haccp_store_id);
      if (Number.isFinite(n)) return n;
    }
  }
  const env = Number(process.env.NEXT_PUBLIC_STORE_ID ?? "1");
  return Number.isFinite(env) ? env : 1;
}

/** @deprecated Use getHaccpStoreId(locations, locationId) when LocationProvider is available */
export const HACCP_STORE_ID = (): number => getHaccpStoreId([], "");

export type HaccpIngangscontroleRow = {
  id: string;
  store_id: number;
  week_number: number;
  year: number;
  datum: string;
  leverancier: string;
  product: string;
  soort: "V" | "C" | "D";
  temperatuur: number | null;
  verpakking_ok: boolean | null;
  tht_ok: boolean | null;
  correct: boolean | null;
  opmerkingen: string | null;
  paraaf: string | null;
  /** ISO date YYYY-MM-DD */
  use_by_date?: string | null;
  /** 0–4 within supplier block */
  line_slot?: number | null;
  created_at?: string;
};

/** One line in JSONB tables on haccp_bereiden */
export type HaccpBereidenMetingRow = {
  datum?: string | null;
  product?: string | null;
  temp?: number | null;
  maatregel?: string | null;
  paraaf?: string | null;
};

export type HaccpBereidenRow = {
  id?: string;
  store_id: number;
  week_number: number;
  year: number;
  terugkoelen_nvt: boolean;
  terugkoelen_datum: string | null;
  terugkoelen_product: string | null;
  terugkoelen_tijd_begin?: string | null;
  terugkoelen_temp_begin: number | null;
  terugkoelen_temp_2uur: number | null;
  terugkoelen_temp_5uur: number | null;
  terugkoelen_maatregel: string | null;
  terugkoelen_paraaf: string | null;
  kerntemp_gegaard_nvt: boolean;
  kerntemp_gegaard: HaccpBereidenMetingRow[] | unknown;
  kerntemp_warmhoud_nvt: boolean;
  kerntemp_warmhoud: HaccpBereidenMetingRow[] | unknown;
  serveertemp_nvt: boolean;
  serveertemp_warm: number | null;
  serveertemp_koud: number | null;
  serveertemp_paraaf: string | null;
  frituur_nvt: boolean;
  frituur_metingen: HaccpBereidenMetingRow[] | unknown;
  regenereer_nvt: boolean;
  regenereer_metingen: HaccpBereidenMetingRow[] | unknown;
  regenereer_tijd_minuten?: number | null;
  buffet_warm_nvt: boolean;
  buffet_warm: HaccpBereidenMetingRow[] | unknown;
  buffet_koud_nvt: boolean;
  buffet_koud: HaccpBereidenMetingRow[] | unknown;
  created_at?: string;
  updated_at?: string;
};

export type HaccpSchoonmaakRow = {
  id?: string;
  store_id: number;
  week_number: number;
  year: number;
  uitgevoerd_door: string | null;
} & Record<
  | "vriezers"
  | "verdampers"
  | "magazijnstellingen"
  | "schappen"
  | "koelingen"
  | "frituren"
  | "afzuiging"
  | "wanden"
  | "bain_marie"
  | "saladiere"
  | "grill"
  | "werkbanken"
  | "vloer"
  | "vaatwasser"
  | "afvalbakken"
  | "schoonmaakmateriaal"
  | "handcontactpunten"
  | "handenwas"
  | "spoelbakken"
  | "magnetron"
  | "snijgereedschap"
  | "snijplanken"
  | "keukenmachines"
  | "kleine_materialen",
  (boolean | null)[]
>;

export type HaccpThermometerRow = {
  id?: string;
  store_id: number;
  datum: string;
  temp_kokend: number;
  temp_smeltend: number;
  afwijking: number | null;
  maatregel: string | null;
  paraaf: string | null;
  created_at?: string;
};
