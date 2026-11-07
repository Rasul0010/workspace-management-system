-- Add unique constraint on proforma_id so upserts work correctly
-- Allows only one client_transaction per proforma
CREATE UNIQUE INDEX IF NOT EXISTS client_transactions_proforma_id_unique
  ON client_transactions (proforma_id)
  WHERE proforma_id IS NOT NULL;