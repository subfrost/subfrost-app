-- AlterTable: change fuel_allocations.amount from INTEGER to DOUBLE PRECISION
-- This is a safe, non-destructive change — all existing integer values are valid floats.
ALTER TABLE "fuel_allocations" ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;
