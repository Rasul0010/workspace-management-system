/*
  # Add origin to proforma_items and total_amount to proformas

  1. Modified Tables
    - `proforma_items`: add `origin` column (text, snapshot of product origin)
    - `proformas`: add `total_amount` column (numeric, pre-computed total for display in list)

  These allow the list view to show totals without fetching all items, and capture
  product origin in each proforma line item.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_items' AND column_name = 'origin'
  ) THEN
    ALTER TABLE proforma_items ADD COLUMN origin text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE proformas ADD COLUMN total_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
