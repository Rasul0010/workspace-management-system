/*
# Add extra_delivery_label column to proformas

1. Modified Tables
- `proformas`: added `extra_delivery_label` (text, nullable) — custom label text that replaces the default "Доп. расходы" label shown on the smeta form and exports.
2. Security
- No changes to RLS or policies.
*/

ALTER TABLE proformas ADD COLUMN IF NOT EXISTS extra_delivery_label text;
