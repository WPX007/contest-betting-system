INSERT INTO "LedgerEntry" ("id", "walletId", "amount", "balanceAfter", "reason", "reference", "note")
SELECT
    'point-reset-20261019-' || "id",
    "id",
    -"balance",
    0,
    'CORRECTION',
    'point-reset:2026-10-19:' || "id",
    '规则调整：清空全部历史点券'
FROM "Wallet"
WHERE "asset" = 'POINT' AND "balance" <> 0;

UPDATE "Wallet"
SET "balance" = 0,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "asset" = 'POINT' AND "balance" <> 0;

ALTER TABLE "ParlayConfig" DROP COLUMN "allianceGameWinPoints";
