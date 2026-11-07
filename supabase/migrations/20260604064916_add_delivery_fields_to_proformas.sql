/*
  # Add delivery/order detail fields to proformas

  1. Changes
    - `proformas`: add delivery_date (text), delivery_location (text),
      delivery_type (text), delivery_qty (text)
      Stores order detail info shown in the Invoice section.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'delivery_date'
  ) THEN
    ALTER TABLE proformas
      ADD COLUMN delivery_date    text NOT NULL DEFAULT '',
      ADD COLUMN delivery_location text NOT NULL DEFAULT '',
      ADD COLUMN delivery_type    text NOT NULL DEFAULT '',
      ADD COLUMN delivery_qty     text NOT NULL DEFAULT '';
  END IF;
END $$;
