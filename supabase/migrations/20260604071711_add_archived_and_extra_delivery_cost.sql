/*
  # Add archived flag and extra delivery cost to proformas

  1. Changes
    - `proformas`: add `archived` (boolean, default false) — for moving paid+delivered invoices to archive
    - `proformas`: add `extra_delivery_cost` (numeric, default 0) — additional delivery fee
      that is added to the purchase cost total only (does not affect sell price)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'archived'
  ) THEN
    ALTER TABLE proformas ADD COLUMN archived boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'extra_delivery_cost'
  ) THEN
    ALTER TABLE proformas ADD COLUMN extra_delivery_cost numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
