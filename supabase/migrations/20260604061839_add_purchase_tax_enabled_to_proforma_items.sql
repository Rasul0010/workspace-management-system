/*
  # Add purchase_tax_enabled to proforma_items

  1. Changes
    - `proforma_items`: add `purchase_tax_enabled` boolean (default false)
      Allows toggling the 5% purchase tax per line item independently
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proforma_items' AND column_name = 'purchase_tax_enabled'
  ) THEN
    ALTER TABLE proforma_items ADD COLUMN purchase_tax_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;
