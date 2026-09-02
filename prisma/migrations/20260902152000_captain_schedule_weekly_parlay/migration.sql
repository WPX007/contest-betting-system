ALTER TABLE "Team" ADD COLUMN "scheduleOrder" INTEGER;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "bestOf" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "scheduledAt" DATETIME,
    "scheduleStatus" TEXT NOT NULL DEFAULT 'UNSET',
    "slotIndex" INTEGER,
    "proposedScheduledAt" DATETIME,
    "proposedByUserId" TEXT,
    "proposedByTeamId" TEXT,
    "proposedAt" DATETIME,
    "confirmedByUserId" TEXT,
    "confirmedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" (
    "awayScore", "awayTeamId", "bestOf", "createdAt", "homeScore", "homeTeamId",
    "id", "scheduledAt", "scheduleStatus", "seasonId", "status", "track", "updatedAt", "weekNumber"
)
SELECT
    "awayScore", "awayTeamId", "bestOf", "createdAt", "homeScore", "homeTeamId",
    "id", "scheduledAt", CASE WHEN "scheduledAt" IS NULL THEN 'UNSET' ELSE 'CONFIRMED' END,
    "seasonId", "status", "track", "updatedAt", "weekNumber"
FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_weekNumber_scheduledAt_idx" ON "Match"("weekNumber", "scheduledAt");
CREATE UNIQUE INDEX "Match_seasonId_weekNumber_track_slotIndex_key" ON "Match"("seasonId", "weekNumber", "track", "slotIndex");

CREATE TABLE "new_ParlayConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "ticketStake" INTEGER NOT NULL DEFAULT 100,
    "basePool" INTEGER NOT NULL DEFAULT 50000,
    "basePool4" INTEGER NOT NULL DEFAULT 50000,
    "basePool5" INTEGER NOT NULL DEFAULT 50000,
    "basePool6Plus" INTEGER NOT NULL DEFAULT 50000,
    "ticketPoolBonusBps" INTEGER NOT NULL DEFAULT 5000,
    "smallGameWinPoints" INTEGER NOT NULL DEFAULT 10,
    "allianceGameWinPoints" INTEGER NOT NULL DEFAULT 5,
    "seriesWinPoints" INTEGER NOT NULL DEFAULT 20,
    "weeklyTicketStake" INTEGER NOT NULL DEFAULT 100,
    "weeklyBasePool" INTEGER NOT NULL DEFAULT 12000,
    "weeklyTicketPoolBonusBps" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ParlayConfig" (
    "allianceGameWinPoints", "basePool", "basePool4", "basePool5", "basePool6Plus",
    "id", "seriesWinPoints", "smallGameWinPoints", "ticketPoolBonusBps", "ticketStake", "updatedAt"
)
SELECT
    "allianceGameWinPoints", "basePool", "basePool4", "basePool5", "basePool6Plus",
    "id", "seriesWinPoints", "smallGameWinPoints", "ticketPoolBonusBps", "ticketStake", "updatedAt"
FROM "ParlayConfig";
DROP TABLE "ParlayConfig";
ALTER TABLE "new_ParlayConfig" RENAME TO "ParlayConfig";

CREATE TABLE "new_ParlayRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'DAILY',
    "ticketStake" INTEGER NOT NULL,
    "basePool" INTEGER NOT NULL,
    "ticketPoolBonusBps" INTEGER NOT NULL DEFAULT 0,
    "carryover" INTEGER NOT NULL DEFAULT 0,
    "closesAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME
);
INSERT INTO "new_ParlayRound" (
    "basePool", "carryover", "closesAt", "createdAt", "dayKey", "id",
    "settledAt", "status", "ticketPoolBonusBps", "ticketStake"
)
SELECT
    "basePool", "carryover", "closesAt", "createdAt", "dayKey", "id",
    "settledAt", "status", "ticketPoolBonusBps", "ticketStake"
FROM "ParlayRound";
DROP TABLE "ParlayRound";
ALTER TABLE "new_ParlayRound" RENAME TO "ParlayRound";
CREATE UNIQUE INDEX "ParlayRound_scope_dayKey_key" ON "ParlayRound"("scope", "dayKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "Team_track_scheduleOrder_key" ON "Team"("track", "scheduleOrder");
