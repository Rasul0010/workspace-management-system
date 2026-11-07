/*
# Add manual request checks and comments

## Purpose
Adds durable checklist controls and a comment field to each request card.

## Modified Tables
1. `requests`
   - `check_paid` (boolean, default false) — manually marked paid.
   - `check_suppliers_paid` (boolean, default false) — manually marked that supplier payments are complete.
   - `check_delivered` (boolean, default false) — manually marked delivered.
   - `check_archived` (boolean, default false) — manually marked archived/completed.
   - `comment` (text, default empty) — optional request comment.

## Security
The existing anon and authenticated CRUD policies on `requests` continue to protect these fields using the same single-tenant access model.

## Important Notes
1. Existing requests receive false checklist values and an empty comment.
2. These manual checks are independent of the automatically detected invoice statuses.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'check_paid') THEN
    ALTER TABLE requests ADD COLUMN check_paid boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'check_suppliers_paid') THEN
    ALTER TABLE requests ADD COLUMN check_suppliers_paid boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'check_delivered') THEN
    ALTER TABLE requests ADD COLUMN check_delivered boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'check_archived') THEN
    ALTER TABLE requests ADD COLUMN check_archived boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'comment') THEN
    ALTER TABLE requests ADD COLUMN comment text NOT NULL DEFAULT '';
  END IF;
END $$;