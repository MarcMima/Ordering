export interface Location {
  id: string;
  name: string;
  full_capacity_revenue?: number | null;
  /** Fraction of one day need for the single evening after ~17:00 (added once: need × (this + cover days)). Default 2/3. */
  ordering_evening_day_fraction?: number | null;
  /** Shared HACCP equipment / weekly temperature records (integer profile id). */
  haccp_store_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  location_id: string;
  name: string;
  contact_info?: string;
  contact_email?: string | null;
  minimum_order_value?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupplierDeliverySchedule {
  id: string;
  supplier_id: string;
  location_id: string;
  day_of_week: number;
  delivery_window?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RawIngredient {
  id: string;
  location_id: string;
  name: string;
  unit: string;
  /** Days of planning for order suggestions; 7 ≈ weekly restock (spices). Null/1 = today only. */
  order_interval_days?: number | null;
  /** Master col I: false = hidden from stocktake list. */
  stocktake_visible?: boolean | null;
  /** JS getDay(): 0=Sun..6=Sat; null/undefined = show every day. Master col J weekly uses Monday (1) in sync. */
  stocktake_day_of_week?: number | null;
  /** Master B — count unit label (bag, box, …). Shown on stocktake; preferred over pack table when set. */
  stocktake_unit_label?: string | null;
  /** Master C — amount per count unit. */
  stocktake_content_amount?: number | null;
  /** Master D — unit of that amount (kg, g, pcs, …). */
  stocktake_content_unit?: string | null;
  /** Sort position on stocktake (daily vs weekly lists ordered separately). Lower = earlier. */
  stocktake_display_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface IngredientPackSize {
  id: string;
  raw_ingredient_id: string;
  size: number;
  size_unit: string;
  /** stocktake | order | both — from master sheet stock vs order packaging */
  pack_purpose?: string | null;
  /** e.g. Sleeve, bag — shown on stocktake */
  display_unit_label?: string | null;
  /** When unit is pcs: grams per piece for g-based raw ingredients (e.g. one box of baking powder). */
  grams_per_piece?: number | null;
  /** Order in multiples of this many packs (default 1). E.g. 2 = only 2,4,6… boxes (supplier pairings). */
  order_pack_multiple?: number | null;
  price_cents?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PrepItem {
  id: string;
  name: string;
  unit?: string | null;
  /** Net amount in one count unit, e.g. 750 g per bottle */
  content_amount?: number | null;
  /** Unit for content_amount: g, ml, kg */
  content_unit?: string | null;
  /** Werkelijke output van één recept-run (hoeveelheid); hoort bij recipe_output_unit */
  recipe_output_amount?: number | null;
  /** o.a. g, kg, ml, l, bottles, pcs */
  recipe_output_unit?: string | null;
  /**
   * True: prep_item_ingredients.quantity_per_unit geldt voor de volledige recept-batch (recipe_output_*).
   * Bestel-aggregatie schaalt met (nominaal gewicht per telt-eenheid) / (recept-output in dezelfde basis).
   */
  ingredient_qty_is_per_recipe_batch?: boolean | null;
  category?: string | null;
  batch_size?: number | null;
  prep_time_hours?: number | null;
  requires_overnight?: boolean | null;
  overnight_alert?: string | null;
  special_alert?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DailyPrepCount {
  id: string;
  location_id: string;
  date: string;
  prep_item_id: string;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

export interface LocationPrepItem {
  id: string;
  location_id: string;
  prep_item_id: string;
  base_quantity?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Recipe {
  id: string;
  location_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface DailyStockCount {
  id: string;
  location_id: string;
  date: string;
  raw_ingredient_id: string;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

/** Per 1 unit of prep item, need quantity_per_unit of this raw ingredient. */
export interface PrepItemIngredient {
  id: string;
  prep_item_id: string;
  raw_ingredient_id: string;
  quantity_per_unit: number;
  created_at?: string;
  updated_at?: string;
}

export interface DailyRevenueTarget {
  id: string;
  location_id: string;
  date: string;
  target_amount_cents: number;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  location_id: string;
  supplier_id: string;
  order_date: string;
  status: "draft" | "submitted" | "delivered" | "cancelled";
  created_at?: string;
  updated_at?: string;
}

export interface OrderLineItem {
  id: string;
  order_id: string;
  raw_ingredient_id: string;
  pack_size_id?: string;
  quantity: number;
  created_at?: string;
  updated_at?: string;
}

/** EU-allergenen referentie — `allergen_types` (migration 075). */
export interface AllergenType {
  id: string;
  code: string;
  label_nl: string;
  sort_order: number;
}

/** Per 100 g/ml — `ingredient_nutritional_values` (migration 069). */
export interface IngredientNutritionalValues {
  id: string;
  raw_ingredient_id: string;
  kcal_per_100g?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  sugar_g?: number | null;
  fat_g?: number | null;
  sat_fat_g?: number | null;
  fiber_g?: number | null;
  salt_g?: number | null;
  source?: string | null;
}

/** Menu dish — `menu_items` (migration 069). */
export interface MenuItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  price_cents?: number | null;
  active: boolean;
  description?: string | null;
  sides_product_id?: string | null;
  display_order: number;
}

/** Recipe line on a menu dish — `menu_item_components`. */
export interface MenuItemComponent {
  id: string;
  menu_item_id: string;
  prep_item_id?: string | null;
  raw_ingredient_id?: string | null;
  bowl_base_option_id?: string | null;
  quantity_grams: number;
  portion_label?: string | null;
  option_group?: string | null;
  is_optional?: boolean | null;
  default_selected?: boolean | null;
  display_order: number;
}

/** Aggregated POS sales — `daily_sales` (Sides / manual import). */
export interface DailySale {
  id: string;
  location_id: string;
  date: string;
  menu_item_id?: string | null;
  menu_item_name?: string | null;
  quantity_sold: number;
  revenue_cents: number;
  channel?: string | null;
  sides_order_id?: string | null;
}
