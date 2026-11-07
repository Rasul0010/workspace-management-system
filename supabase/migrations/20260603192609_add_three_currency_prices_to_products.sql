/*
  # Add three-currency price columns to products

  Replaces the single `price` column with three separate price columns:
    - `price_aed` (AED - UAE Dirham)
    - `price_usd` (USD - US Dollar)
    - `price_tjs` (TJS - Tajikistani Somoni)

  The old `price` column is kept to avoid data loss.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_aed'
  ) THEN
    ALTER TABLE products ADD COLUMN price_aed numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_usd'
  ) THEN
    ALTER TABLE products ADD COLUMN price_usd numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price_tjs'
  ) THEN
    ALTER TABLE products ADD COLUMN price_tjs numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;
END $$;
