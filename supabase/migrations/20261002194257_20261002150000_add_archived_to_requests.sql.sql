/*
# Add archived column to requests table

## Purpose
Adds an `archived` boolean column to the `requests` table so deleted requests
are moved to an Archive view instead of being permanently deleted.
The Archive view shows archived requests and offers a "delete forever" option.

## Changes
1. `requests` table: add column `archived boolean NOT NULL DEFAULT false`

## Security
No RLS changes — existing policies already allow full CRUD for anon + authenticated.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'archived') THEN
    ALTER TABLE requests ADD COLUMN archived boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_archived ON requests(archived);