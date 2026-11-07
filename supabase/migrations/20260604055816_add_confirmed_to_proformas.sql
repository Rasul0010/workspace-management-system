/*
  # Add confirmed field to proformas

  1. Changes
    - `proformas` table: add `confirmed` boolean (default false)
    - `proformas` table: add `confirmed_at` timestamp (nullable)

  2. Notes
    - confirmed = true means the proforma has been approved and should appear in Счёт (Invoice)
    - confirmed_at records when confirmation happened
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'confirmed'
  ) THEN
    ALTER TABLE proformas ADD COLUMN confirmed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE proformas ADD COLUMN confirmed_at timestamptz;
  END IF;
END $$;
