ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS deliverer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profit_hidden boolean NOT NULL DEFAULT false;
