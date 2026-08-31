-- Existing rounds keep the original rule: each ticket contributes its face value.
ALTER TABLE "ParlayRound" ADD COLUMN "ticketPoolBonusBps" INTEGER NOT NULL DEFAULT 0;

-- New configurable pools default to the former single 50,000-coin base pool.
ALTER TABLE "ParlayConfig" ADD COLUMN "basePool4" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "ParlayConfig" ADD COLUMN "basePool5" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "ParlayConfig" ADD COLUMN "basePool6Plus" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "ParlayConfig" ADD COLUMN "ticketPoolBonusBps" INTEGER NOT NULL DEFAULT 5000;
