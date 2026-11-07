/*
  # Add country to clients table

  Adds a `country` column to the clients table for storing the client's country.
  Used to display country flags in the Clients section.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'country'
  ) THEN
    ALTER TABLE clients ADD COLUMN country text NOT NULL DEFAULT '';
  END IF;
END $$;
