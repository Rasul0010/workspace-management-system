ALTER TABLE accountant_entries
  ADD COLUMN IF NOT EXISTS must_give_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS row_color text;
