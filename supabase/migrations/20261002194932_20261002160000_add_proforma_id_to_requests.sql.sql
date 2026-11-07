/*
# Add proforma_id to requests table

## Purpose
Links a request card to its originating proforma (смета).
When a new smeta is saved, a request is auto-created in the RECIEVED column
and linked via proforma_id. When the smeta is confirmed, the linked request
is moved to CONFIRMED.

## Changes
1. `requests` table: add column `proforma_id uuid REFERENCES proformas(id) ON DELETE CASCADE`
   - Nullable (manual requests created in the Kanban have no proforma link)
2. Add index on proforma_id for quick lookups
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'proforma_id') THEN
    ALTER TABLE requests ADD COLUMN proforma_id uuid REFERENCES proformas(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_proforma_id ON requests(proforma_id);