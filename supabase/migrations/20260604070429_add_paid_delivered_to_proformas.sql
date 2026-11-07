/*
  # Add paid and delivered status fields to proformas

  1. Changes
    - `proformas`: add paid (boolean), delivered (boolean)
      Used to toggle "Оплачено" / "Доставлено" stamps on invoices.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'paid'
  ) THEN
    ALTER TABLE proformas
      ADD COLUMN paid      boolean NOT NULL DEFAULT false,
      ADD COLUMN delivered boolean NOT NULL DEFAULT false;
  END IF;
END $$;
