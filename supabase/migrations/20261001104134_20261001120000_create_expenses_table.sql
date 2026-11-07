/*
# Create expenses table for accountant expenses

1. New Tables
- `expenses`
  - `id` (uuid, primary key)
  - `section` (text, NOT NULL) — one of: 'Personal', 'C.A.P', 'BAYKA'
  - `description` (text, NOT NULL) — description of the expense
  - `amount_aed` (numeric, default 0) — amount in AED
  - `amount_tjs` (numeric, default 0) — amount in TJS
  - `expense_date` (date, NOT NULL) — date of the expense
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `expenses`.
- Allow anon + authenticated CRUD (single-tenant, password-protected page).
*/
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('Personal', 'C.A.P', 'BAYKA')),
  description text NOT NULL,
  amount_aed numeric NOT NULL DEFAULT 0,
  amount_tjs numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_expenses" ON expenses;
CREATE POLICY "anon_select_expenses" ON expenses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_expenses" ON expenses;
CREATE POLICY "anon_insert_expenses" ON expenses FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_expenses" ON expenses;
CREATE POLICY "anon_update_expenses" ON expenses FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_expenses" ON expenses;
CREATE POLICY "anon_delete_expenses" ON expenses FOR DELETE
  TO anon, authenticated USING (true);
