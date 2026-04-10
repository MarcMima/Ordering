/** Keys in `app_form_settings.form_key` — keep in sync with migration seed. */
export const APP_FORM_KEYS = {
  haccp_temperatures: "haccp_temperatures",
  haccp_goods_in: "haccp_goods_in",
  haccp_cleaning: "haccp_cleaning",
  haccp_thermometers: "haccp_thermometers",
  haccp_prepare: "haccp_prepare",
  haccp_suppliers: "haccp_suppliers",
} as const;

export type AppFormKey = (typeof APP_FORM_KEYS)[keyof typeof APP_FORM_KEYS];
