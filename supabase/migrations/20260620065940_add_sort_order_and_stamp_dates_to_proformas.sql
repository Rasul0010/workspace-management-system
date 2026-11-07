ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL;

-- Initialize sort_order: 0 = most recent, higher = older
UPDATE proformas p
SET sort_order = (
  SELECT COUNT(*) FROM proformas p2
  WHERE p2.created_at > p.created_at
);
