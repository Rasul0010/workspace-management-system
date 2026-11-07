/*
# Add owner column for multi-user data isolation

## Purpose
Adds an `owner` text column to all business-data tables so the app can separate
data between the Admin and the Assistant. Existing rows default to 'admin'.
The Assistant sees only rows where owner = 'assistant'; the Admin sees only
'admin' rows (and can view the Assistant's data through a dedicated Assistant view).

## Tables altered (ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'admin')
1. products
2. clients
3. client_transactions
4. proformas
5. proforma_items
6. invoice_photos
7. invoice_videos
8. extra_profits
9. expenses
10. accountant_entries

## Security
No RLS changes — the app uses localStorage-based auth (not Supabase auth), so
RLS remains open to the anon role as before. Data isolation is enforced at the
application query layer (.eq('owner', role)).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'owner') THEN
    ALTER TABLE products ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'owner') THEN
    ALTER TABLE clients ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_transactions' AND column_name = 'owner') THEN
    ALTER TABLE client_transactions ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proformas' AND column_name = 'owner') THEN
    ALTER TABLE proformas ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proforma_items' AND column_name = 'owner') THEN
    ALTER TABLE proforma_items ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_photos' AND column_name = 'owner') THEN
    ALTER TABLE invoice_photos ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_videos' AND column_name = 'owner') THEN
    ALTER TABLE invoice_videos ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'extra_profits' AND column_name = 'owner') THEN
    ALTER TABLE extra_profits ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'owner') THEN
    ALTER TABLE expenses ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accountant_entries' AND column_name = 'owner') THEN
    ALTER TABLE accountant_entries ADD COLUMN owner text NOT NULL DEFAULT 'admin';
  END IF;
END $$;