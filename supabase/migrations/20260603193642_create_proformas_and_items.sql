/*
  # Create proformas and proforma_items tables

  1. New Tables
    - `proformas`
      - `id` (uuid, pk)
      - `number` (text) - Proforma number e.g. PRO-001
      - `client` (text) - Client name
      - `currency` (text) - Single currency: AED, USD, or TJS
      - `discount_percent` (numeric) - Discount percentage
      - `tax_percent` (numeric) - Tax percentage
      - `notes` (text) - Optional notes
      - `created_at`, `updated_at`

    - `proforma_items`
      - `id` (uuid, pk)
      - `proforma_id` (uuid, fk → proformas.id CASCADE DELETE)
      - `product_id` (uuid, fk → products.id SET NULL, nullable)
      - `article`, `brand`, `description`, `uom` — snapshot of product data
      - `quantity` (numeric)
      - `unit_price` (numeric) — editable, in proforma currency
      - `sort_order` (int) — preserves row order

  2. Security
    - RLS enabled on both tables with anon access (app uses custom auth)
*/

CREATE TABLE IF NOT EXISTS proformas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          text NOT NULL DEFAULT '',
  client          text NOT NULL DEFAULT '',
  currency        text NOT NULL DEFAULT 'USD',
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  tax_percent      numeric(5,2) NOT NULL DEFAULT 0,
  notes           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proforma_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id  uuid NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES products(id) ON DELETE SET NULL,
  article      text NOT NULL DEFAULT '',
  brand        text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  uom          text NOT NULL DEFAULT 'PCS',
  quantity     numeric(12,3) NOT NULL DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon select proformas"   ON proformas FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert proformas"   ON proformas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update proformas"   ON proformas FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete proformas"   ON proformas FOR DELETE TO anon USING (true);

CREATE POLICY "Anon select proforma_items"   ON proforma_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert proforma_items"   ON proforma_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update proforma_items"   ON proforma_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete proforma_items"   ON proforma_items FOR DELETE TO anon USING (true);
