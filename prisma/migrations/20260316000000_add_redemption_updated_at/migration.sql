-- Add updated_at column to invite_code_redemptions.
-- Nullable: existing rows get NULL (no edit has occurred yet).
-- The app sets this explicitly when a redemption is edited.
ALTER TABLE "invite_code_redemptions"
  ADD COLUMN "updated_at" TIMESTAMP(3);
