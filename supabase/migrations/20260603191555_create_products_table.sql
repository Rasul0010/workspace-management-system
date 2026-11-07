/*
  # Create products table

  1. New Tables
    - `products`
      - `id` (uuid, primary key)
      - `brand` (text) - Brand name
      - `article` (text) - SKU / article number
      - `description` (text) - Product description
      - `origin` (text) - Country/place of origin
      - `uom` (text) - Unit of measure: PCS or CTN
      - `price` (numeric) - Price
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `products` table
    - Add policy for anonymous (app-level auth) to read and write products
      NOTE: This app uses a custom hard-coded login (Admin/Workspace@2026),
      not Supabase Auth. We use anon key only, so we grant anon role access.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL DEFAULT '',
  article text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT '',
  uom text NOT NULL DEFAULT 'PCS',
  price numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon users can select products"
  ON products FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon users can insert products"
  ON products FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon users can update products"
  ON products FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can delete products"
  ON products FOR DELETE
  TO anon
  USING (true);
