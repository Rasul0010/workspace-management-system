/*
# Add supplier discount columns to proforma_items

1. Purpose
- Each supplier (within a proforma) can have a discount applied to its purchase cost.
- Discount can be either a percentage or a fixed amount, selectable per item row.
- This allows fine-grained control over the purchase cost negotiated with each supplier.

2. New Columns on `proforma_items`
- `supplier_discount_percent` (numeric, default 0) — discount percentage applied to this item's purchase cost.
- `supplier_discount_fixed` (numeric, default 0) — fixed discount amount applied to this item's purchase cost.
- `supplier_discount_mode` (text, default 'percent') — which discount mode is active: 'percent' or 'fixed'.

3. Security
- No RLS policy changes. Table already has existing policies; new columns are covered by existing CRUD policies.

4. Important Notes
- All new columns have safe defaults so existing rows are unaffected.
- Columns are nullable-safe with NOT NULL defaults.
*/

ALTER TABLE proforma_items
  ADD COLUMN IF NOT EXISTS supplier_discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_discount_fixed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_discount_mode text NOT NULL DEFAULT 'percent';
