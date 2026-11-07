/*
# Invoice videos storage and table

## Purpose
Allows uploading up to 5 videos per confirmed invoice (proforma), alongside the existing photo gallery.

## New Table: invoice_videos
- id (uuid, primary key)
- proforma_id (uuid, FK → proformas.id, cascade delete)
- storage_path (text) — path within the storage bucket
- filename (text) — original filename for display
- created_at (timestamptz)

## Storage
Creates the invoice-videos bucket as public.

## Security
- RLS enabled on invoice_videos
- Storage policies for read (public), upload (anon), delete (anon)
- Table policies for anon and authenticated roles (single-tenant, no auth)
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-videos', 'invoice-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public read invoice videos'
  ) THEN
    CREATE POLICY "public read invoice videos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'invoice-videos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon upload invoice videos'
  ) THEN
    CREATE POLICY "anon upload invoice videos"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'invoice-videos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'anon delete invoice videos'
  ) THEN
    CREATE POLICY "anon delete invoice videos"
    ON storage.objects FOR DELETE
    TO anon
    USING (bucket_id = 'invoice-videos');
  END IF;
END $$;

-- invoice_videos table
CREATE TABLE IF NOT EXISTS invoice_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can select invoice_videos" ON invoice_videos;
CREATE POLICY "anon can select invoice_videos"
  ON invoice_videos FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon can insert invoice_videos" ON invoice_videos;
CREATE POLICY "anon can insert invoice_videos"
  ON invoice_videos FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon can delete invoice_videos" ON invoice_videos;
CREATE POLICY "anon can delete invoice_videos"
  ON invoice_videos FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "authenticated can select invoice_videos" ON invoice_videos;
CREATE POLICY "authenticated can select invoice_videos"
  ON invoice_videos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated can insert invoice_videos" ON invoice_videos;
CREATE POLICY "authenticated can insert invoice_videos"
  ON invoice_videos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated can delete invoice_videos" ON invoice_videos;
CREATE POLICY "authenticated can delete invoice_videos"
  ON invoice_videos FOR DELETE TO authenticated USING (true);
