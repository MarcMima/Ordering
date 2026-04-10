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
  created_at?: string;
  updated_at?: string;
};

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
  created_at?: string;
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

export const HACCP_STORE_ID = (): number => {
  const n = Number(process.env.NEXT_PUBLIC_STORE_ID ?? "1");
  return Number.isFinite(n) ? n : 1;
};
