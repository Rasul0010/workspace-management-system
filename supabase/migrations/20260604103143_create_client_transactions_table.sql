/*
  # Create client_transactions table

  ## Purpose
  Stores a financial ledger per client: payment receipts (+) and payment uses (-).

  ## New Table: client_transactions
  - id (uuid, pk)
  - client_id (uuid, FK → clients.id, cascade delete)
  - date (date) – transaction date
  - amount (numeric) – positive = received from client, negative = paid out on behalf of client
  - details (text) – free-form description
  - created_at (timestamptz)

  ## Security
  - RLS enabled
  - Policies for both anon and authenticated roles (app uses anon key)
*/

CREATE TABLE IF NOT EXISTS client_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  details text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can select client_transactions"
  ON client_transactions FOR SELECT TO anon USING (true);

CREATE POLICY "anon can insert client_transactions"
  ON client_transactions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon can update client_transactions"
  ON client_transactions FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon can delete client_transactions"
  ON client_transactions FOR DELETE TO anon USING (true);

CREATE POLICY "authenticated can select client_transactions"
  ON client_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert client_transactions"
  ON client_transactions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update client_transactions"
  ON client_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete client_transactions"
  ON client_transactions FOR DELETE TO authenticated USING (true);
