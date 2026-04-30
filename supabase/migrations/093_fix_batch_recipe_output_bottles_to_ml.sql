-- Normalize unsupported batch output units ("bottle(s)") to ml.
-- This keeps nutrition scaling deterministic for batch recipes.
UPDATE prep_items
SET
  recipe_output_amount = CASE
    WHEN coalesce(recipe_output_amount, 0) > 0 AND coalesce(content_amount, 0) > 0
      THEN recipe_output_amount * content_amount
    ELSE recipe_output_amount
  END,
  recipe_output_unit = 'ml',
  updated_at = NOW()
WHERE ingredient_qty_is_per_recipe_batch = true
  AND lower(coalesce(recipe_output_unit, '')) IN ('bottle', 'bottles')
  AND coalesce(recipe_output_amount, 0) > 0
  AND coalesce(content_amount, 0) > 0;
