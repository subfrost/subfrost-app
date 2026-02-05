-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "taproot_address" TEXT NOT NULL,
    "segwit_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "fee_preset" TEXT NOT NULL DEFAULT 'medium',
    "custom_data" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_metadata" (
    "id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "token0_id" TEXT NOT NULL,
    "token1_id" TEXT NOT NULL,
    "token0_symbol" TEXT NOT NULL,
    "token1_symbol" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tvl_usd" DOUBLE PRECISION,
    "volume_24h_usd" DOUBLE PRECISION,
    "volume_7d_usd" DOUBLE PRECISION,
    "apr" DOUBLE PRECISION,

    CONSTRAINT "pool_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_metadata" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 8,
    "logo_url" TEXT,
    "price_usd" DOUBLE PRECISION,
    "price_btc" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_logs" (
    "id" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "block_height" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "transaction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_code_id" TEXT,
    "owner_taproot_address" TEXT,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_code_redemptions" (
    "id" TEXT NOT NULL,
    "code_id" TEXT NOT NULL,
    "taproot_address" TEXT NOT NULL,
    "segwit_address" TEXT,
    "taproot_pubkey" TEXT,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_taproot_address_key" ON "users"("taproot_address");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pool_metadata_pool_id_key" ON "pool_metadata"("pool_id");

-- CreateIndex
CREATE INDEX "pool_metadata_factory_id_idx" ON "pool_metadata"("factory_id");

-- CreateIndex
CREATE INDEX "pool_metadata_token0_id_idx" ON "pool_metadata"("token0_id");

-- CreateIndex
CREATE INDEX "pool_metadata_token1_id_idx" ON "pool_metadata"("token1_id");

-- CreateIndex
CREATE UNIQUE INDEX "token_metadata_token_id_key" ON "token_metadata"("token_id");

-- CreateIndex
CREATE INDEX "token_metadata_symbol_idx" ON "token_metadata"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_logs_txid_key" ON "transaction_logs"("txid");

-- CreateIndex
CREATE INDEX "transaction_logs_user_address_idx" ON "transaction_logs"("user_address");

-- CreateIndex
CREATE INDEX "transaction_logs_type_idx" ON "transaction_logs"("type");

-- CreateIndex
CREATE INDEX "transaction_logs_status_idx" ON "transaction_logs"("status");

-- CreateIndex
CREATE INDEX "transaction_logs_created_at_idx" ON "transaction_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_code_idx" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_is_active_idx" ON "invite_codes"("is_active");

-- CreateIndex
CREATE INDEX "invite_codes_parent_code_id_idx" ON "invite_codes"("parent_code_id");

-- CreateIndex
CREATE INDEX "invite_codes_owner_taproot_address_idx" ON "invite_codes"("owner_taproot_address");

-- CreateIndex
CREATE INDEX "invite_code_redemptions_taproot_address_idx" ON "invite_code_redemptions"("taproot_address");

-- CreateIndex
CREATE INDEX "invite_code_redemptions_redeemed_at_idx" ON "invite_code_redemptions"("redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_redemptions_code_id_taproot_address_key" ON "invite_code_redemptions"("code_id", "taproot_address");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_parent_code_id_fkey" FOREIGN KEY ("parent_code_id") REFERENCES "invite_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "invite_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
