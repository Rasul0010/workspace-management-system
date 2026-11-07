/*
  # Create clients table and add client_code to proformas

  1. New Tables
    - `clients`
      - `id` (uuid, primary key)
      - `name` (text) — name of the client
      - `code` (text, unique) — КК (client code)
      - `phones` (text) — phone numbers (comma-separated or free text)
      - `created_at` (timestamptz)

  2. Changes to `proformas`
    - Add `client_code` (text) — links proforma to a client by their КК code

  3. Security
    - RLS enabled on `clients`
    - Authenticated users can read/insert/update/delete clients
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  code text NOT NULL DEFAULT '',
  phones text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select clients"
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clients"
  ON clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clients"
  ON clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clients"
  ON clients FOR DELETE TO authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proformas' AND column_name = 'client_code'
  ) THEN
    ALTER TABLE proformas ADD COLUMN client_code text NOT NULL DEFAULT '';
  END IF;
END $$;
