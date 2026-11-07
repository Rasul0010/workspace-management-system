/*
# Create requests table (order tracking Kanban)

## Purpose
Stores order requests that flow through 4 statuses: OFFERED → RECIEVED → RESPONSED → CONFIRMED.
Each request has a title/order number, a status, sorting order within its column,
and an owner (admin or assistant) for multi-user data isolation.

## New Tables
1. `requests`
   - `id` (uuid, primary key)
   - `title` (text, not null) — order number / title
   - `status` (text, not null, default 'offered') — one of: 'offered', 'recieved', 'responsed', 'confirmed'
   - `sort_order` (int, default 0) — ordering within a column for drag-and-drop
   - `owner` (text, not null, default 'admin') — data isolation between admin and assistant
   - `created_at` (timestamptz, default now())
   - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on `requests`.
- Anon + authenticated CRUD allowed (single-tenant localStorage-based auth pattern, same as other tables).
*/

CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'offered',
  sort_order int NOT NULL DEFAULT 0,
  owner text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_requests" ON requests;
CREATE POLICY "anon_select_requests" ON requests FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_requests" ON requests;
CREATE POLICY "anon_insert_requests" ON requests FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_requests" ON requests;
CREATE POLICY "anon_update_requests" ON requests FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_requests" ON requests;
CREATE POLICY "anon_delete_requests" ON requests FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests(owner);