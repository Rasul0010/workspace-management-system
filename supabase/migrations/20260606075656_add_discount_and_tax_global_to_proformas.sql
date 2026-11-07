ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS purchase_tax_global boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_mode varchar(10) DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS discount_fixed numeric(12,2) DEFAULT 0;