/*
# Add status column to expenses table

1. Modified Tables
- `expenses`
  - Add `status` (boolean, NOT NULL, default false) — checkbox status for each expense row.
2. Security
- No changes to RLS policies; existing CRUD policies remain valid.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'status') THEN
    ALTER TABLE expenses ADD COLUMN status boolean NOT NULL DEFAULT false;
  END IF;
END $$;
