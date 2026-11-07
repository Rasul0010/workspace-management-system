CREATE TABLE accountant_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  sum_amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  restore_amount numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accountant_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_accountant_entries" ON accountant_entries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_accountant_entries" ON accountant_entries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_accountant_entries" ON accountant_entries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_accountant_entries" ON accountant_entries FOR DELETE TO anon, authenticated USING (true);
