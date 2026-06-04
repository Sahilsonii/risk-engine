-- ============================================================
-- NewEra AI — Risk Engine Database Migration
-- Run this once against an existing database to add review
-- columns and the SUSPICIOUS status enum value.
-- ============================================================

-- Add SUSPICIOUS to the transaction_status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SUSPICIOUS'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_status')
  ) THEN
    ALTER TYPE transaction_status ADD VALUE 'SUSPICIOUS';
  END IF;
END
$$;

-- Add review columns to the transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
