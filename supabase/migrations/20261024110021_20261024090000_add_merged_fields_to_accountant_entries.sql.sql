/*
# Add merged row support to accountant_entries

1. New Columns
- `merged_title` (text, nullable) — custom title for a merged row, shown as the row name
- `merged_children` (jsonb, nullable) — array of child entries that were merged into this row,
  each with {sum_amount, description, should_be_amount, must_give_amount, notes}

2. Purpose
When the user merges multiple accountant rows, the first row becomes the "parent".
The parent stores a user-chosen title and the details of all merged children,
so the row can be expanded to reveal the individual lines that were combined.

3. Security
- No changes to RLS or grants. Existing policies already cover SELECT/INSERT/UPDATE/DELETE.
- The new columns inherit the table's existing access controls.
*/

ALTER TABLE accountant_entries
  ADD COLUMN IF NOT EXISTS merged_title text,
  ADD COLUMN IF NOT EXISTS merged_children jsonb;
