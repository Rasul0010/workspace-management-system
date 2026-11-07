/*
  # Invoice photos storage and table

  ## Purpose
  Allows uploading up to 10 photos per confirmed invoice (proforma).

  ## New Table: invoice_photos
  - id (uuid, pk)
  - proforma_id (uuid, FK → proformas.id, cascade delete)
  - storage_path (text) – path within the storage bucket
  - filename (text) – original filename for display
  - created_at (timestamptz)

  ## Storage
  Creates the invoice-photos bucket as public.

  ## Security
  - RLS enabled on invoice_photos
  - Policies for anon and authenticated roles
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-photos', 'invoice-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public read invoice photos'
  ) THEN
    CREATE POLICY "public read invoice photos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'invoice-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon upload invoice photos'
  ) THEN
    CREATE POLICY "anon upload invoice photos"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'invoice-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon delete invoice photos'
  ) THEN
    CREATE POLICY "anon delete invoice photos"
    ON storage.objects FOR DELETE
    TO anon
    USING (bucket_id = 'invoice-photos');
  END IF;
END $$;

-- invoice_photos table
CREATE TABLE IF NOT EXISTS invoice_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can select invoice_photos"
  ON invoice_photos FOR SELECT TO anon USING (true);

CREATE POLICY "anon can insert invoice_photos"
  ON invoice_photos FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon can delete invoice_photos"
  ON invoice_photos FOR DELETE TO anon USING (true);

CREATE POLICY "authenticated can select invoice_photos"
  ON invoice_photos FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert invoice_photos"
  ON invoice_photos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can delete invoice_photos"
  ON invoice_photos FOR DELETE TO authenticated USING (true);
