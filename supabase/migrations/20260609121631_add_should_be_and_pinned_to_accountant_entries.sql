ALTER TABLE accountant_entries
  ADD COLUMN IF NOT EXISTS should_be_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
