/*
# Add deposit_amount column to proformas

## Purpose
Allows recording a partial payment (deposit) from the client against a specific
proforma/invoice. The deposit reduces the outstanding balance shown in both
the Смета (ProformaForm) and Счёт (InvoicePage) views.

## Changes
- proformas.deposit_amount (numeric, default 0) — amount the client has paid
  as a deposit toward this document. 0 means no deposit recorded.

## Security
- No new tables; no policy changes needed. Existing RLS on proformas remains intact.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'deposit_amount'
  ) THEN
    ALTER TABLE proformas ADD COLUMN deposit_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
