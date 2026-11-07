/*
# Add accountant currency setting

1. New Tables
- `accountant_settings` — stores the shared display currency used in the Accountant section.
- `id` (integer, singleton primary key)
- `currency` (text, defaults to AED)
- `updated_at` (timestamp)

2. Modified Tables
- None.

3. Security
- Row level security is enabled.
- The application has no sign-in screen, so anon and authenticated roles receive separate CRUD policies for the shared setting.

4. Important Notes
- A single fixed row is created for the current currency.
- Existing accountant amounts are unchanged; only their displayed currency label is controlled by this setting.
*/

CREATE TABLE IF NOT EXISTS public.accountant_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency text NOT NULL DEFAULT 'AED',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accountant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_accountant_settings" ON public.accountant_settings;
CREATE POLICY "anon_select_accountant_settings" ON public.accountant_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_accountant_settings" ON public.accountant_settings;
CREATE POLICY "anon_insert_accountant_settings" ON public.accountant_settings FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_accountant_settings" ON public.accountant_settings;
CREATE POLICY "anon_update_accountant_settings" ON public.accountant_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_accountant_settings" ON public.accountant_settings;
CREATE POLICY "anon_delete_accountant_settings" ON public.accountant_settings FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.accountant_settings (id, currency)
VALUES (1, 'AED')
ON CONFLICT (id) DO NOTHING;