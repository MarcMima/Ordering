# Base quantity (full-capacity consumption) — CSV & Admin

Per **location** and **finished product** (prep item), `location_prep_items.base_quantity` is how much you need in **stocktake/prep units** (usually **g**) when you hit **full capacity revenue** for that location.

**Daily need** (prep list / ordering logic) ≈ `base_quantity × (today’s expected revenue ÷ full capacity revenue)`.

## In the app

**Admin → Locations → Manage products** (per location):

- Edit **Base qty** per row; value saves on **blur** (click/tab away).
- **Download CSV** — current links + quantities (UTF-8 BOM for Excel).
- **Upload CSV** — bulk update matching rows.

## CSV format

- **Columns:** `product_name,base_quantity`  
  - Names must match **exactly** the prep item name (trimmed; matching is case-insensitive).  
  - Or use **`prep_item_id`** (UUID) in the first column instead of the name.
- **Optional header row**, e.g. `product_name,base_quantity` — detected and skipped.
- **Decimal:** dot or comma in the quantity column.
- Only products **already linked** to that location are updated; others are reported as “not matched”.

## Example

```csv
product_name,base_quantity
Hummus,3500
Marinated chicken thigh,8000
```
