/*
  # Add internal purchase fields to proforma_items

  ## Changes
  - `purchase_price` — unit purchase price (not exported to client documents)
  - `supplier` — supplier name
  - `supplier_payment` — amount paid to supplier
  - `purchase_tax` — tax on purchase

  These fields are internal-only and never appear in Excel/PDF exports.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proforma_items' AND column_name = 'purchase_price') THEN
    ALTER TABLE proforma_items ADD COLUMN purchase_price numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proforma_items' AND column_name = 'supplier') THEN
    ALTER TABLE proforma_items ADD COLUMN supplier text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proforma_items' AND column_name = 'supplier_payment') THEN
    ALTER TABLE proforma_items ADD COLUMN supplier_payment numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proforma_items' AND column_name = 'purchase_tax') THEN
    ALTER TABLE proforma_items ADD COLUMN purchase_tax numeric DEFAULT 0;
  END IF;
END $$;
