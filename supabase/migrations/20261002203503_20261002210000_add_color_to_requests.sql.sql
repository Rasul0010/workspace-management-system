/*
# Add color column to requests table

1. Changes
- Adds `color` text column to `requests` table, defaulting to 'white'.
- Allows each request card to have a custom background color.
- No security changes — existing RLS policies remain unchanged.
*/

ALTER TABLE requests
ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'white';
