/*
  # Fix clients RLS policies for anon role

  The app uses a custom hardcoded login (not Supabase Auth), so all requests
  are made with the anon key without a JWT. RLS policies must allow the
  anon role instead of authenticated.

  1. Drop old authenticated-only policies
  2. Recreate them for the anon role
*/

DROP POLICY IF EXISTS "Authenticated users can select clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON clients;

CREATE POLICY "Anon can select clients"
  ON clients FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert clients"
  ON clients FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update clients"
  ON clients FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete clients"
  ON clients FOR DELETE TO anon USING (true);
