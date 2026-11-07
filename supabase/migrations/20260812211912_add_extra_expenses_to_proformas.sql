/*
# Add extra_expenses column to proformas

1. Modified Tables
- `proformas`
  - Added `extra_expenses` (numeric, default 0) — additional expenses added after tax and before the final total amount.

2. Notes
- This column stores extra expenses that are added to the invoice total after the tax amount is calculated.
- The value defaults to 0 so existing proformas are unaffected.
- No security changes needed — existing RLS policies remain unchanged.
*/

ALTER TABLE proformas
ADD COLUMN IF NOT EXISTS extra_expenses numeric DEFAULT 0;
