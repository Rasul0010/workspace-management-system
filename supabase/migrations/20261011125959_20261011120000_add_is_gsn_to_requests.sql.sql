/*
# Add is_gsn column to requests table

1. Modified Tables
- `requests`: added `is_gsn` boolean column (default false) to distinguish GSN-only requests from regular requests.
2. Notes
- Existing rows keep `is_gsn = false` so they remain visible in the main requests view.
- GSN view shows only `is_gsn = true` rows; main view shows only `is_gsn = false` rows.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requests' AND column_name = 'is_gsn') THEN
    ALTER TABLE requests ADD COLUMN is_gsn boolean NOT NULL DEFAULT false;
  END IF;
END $$;
