-- AddColumn (idempotent: skip if column already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invite_codes' AND column_name = 'parent_code_id'
  ) THEN
    ALTER TABLE "invite_codes" ADD COLUMN "parent_code_id" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invite_codes' AND column_name = 'owner_taproot_address'
  ) THEN
    ALTER TABLE "invite_codes" ADD COLUMN "owner_taproot_address" TEXT;
  END IF;
END $$;

-- CreateIndex (idempotent: skip if index already exists)
CREATE INDEX IF NOT EXISTS "invite_codes_parent_code_id_idx" ON "invite_codes"("parent_code_id");
CREATE INDEX IF NOT EXISTS "invite_codes_owner_taproot_address_idx" ON "invite_codes"("owner_taproot_address");

-- AddForeignKey (idempotent: skip if constraint already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invite_codes_parent_code_id_fkey'
  ) THEN
    ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_parent_code_id_fkey"
      FOREIGN KEY ("parent_code_id") REFERENCES "invite_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
