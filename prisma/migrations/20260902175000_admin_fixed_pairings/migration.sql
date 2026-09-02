ALTER TABLE "Match" ADD COLUMN "pairingConfiguredAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "pairingConfiguredByUserId" TEXT;

UPDATE "Match"
SET "pairingConfiguredAt" = COALESCE("confirmedAt", "updatedAt"),
    "pairingConfiguredByUserId" = "confirmedByUserId"
WHERE "weekNumber" <= 11
  AND "scheduleStatus" = 'CONFIRMED';
