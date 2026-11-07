/*
# Add extra_cost_on_invoice boolean to proformas

1. Modified Tables
- `proformas`: adds `extra_cost_on_invoice` boolean column (default true).
  When true, the "Доп. расходы" (extra delivery cost) amount is shown on the
  invoice/smeta as a visible line item added to the total.
  When false, it is hidden from the client-facing total and instead only
  subtracted from the internal profit calculation.
2. Security
- No RLS policy changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'extra_cost_on_invoice'
  ) THEN
    ALTER TABLE proformas ADD COLUMN extra_cost_on_invoice boolean NOT NULL DEFAULT true;
  END IF;
END $$;
