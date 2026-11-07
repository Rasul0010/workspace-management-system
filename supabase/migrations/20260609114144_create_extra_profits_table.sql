CREATE TABLE extra_profits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AED',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE extra_profits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_extra_profits" ON extra_profits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_extra_profits" ON extra_profits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_extra_profits" ON extra_profits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_extra_profits" ON extra_profits FOR DELETE TO anon, authenticated USING (true);
