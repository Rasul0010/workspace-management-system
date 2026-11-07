/*
  # Add supplier_paid to proforma_items

  1. Changes
    - `proforma_items`: add `supplier_paid` (boolean, default false) — tracks whether supplier payment has been made
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_items' AND column_name = 'supplier_paid'
  ) THEN
    ALTER TABLE proforma_items ADD COLUMN supplier_paid boolean NOT NULL DEFAULT false;
  END IF;
END $$;
