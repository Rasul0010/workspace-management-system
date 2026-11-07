ALTER TABLE public.accountant_entries
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'AED';

COMMENT ON COLUMN public.accountant_entries.currency IS 'Per-entry display currency (AED, USD, or TJS).';