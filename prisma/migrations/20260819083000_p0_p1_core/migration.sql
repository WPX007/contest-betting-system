-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN "note" TEXT;
ALTER TABLE "MarketOption" ADD COLUMN "manualOddsBps" INTEGER;
ALTER TABLE "MarketOption" ADD COLUMN "oddsReason" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ParlayConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "ticketStake" INTEGER NOT NULL DEFAULT 100,
    "basePool" INTEGER NOT NULL DEFAULT 50000,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ParlayRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayKey" TEXT NOT NULL,
    "ticketStake" INTEGER NOT NULL,
    "basePool" INTEGER NOT NULL,
    "carryover" INTEGER NOT NULL DEFAULT 0,
    "closesAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME
);

CREATE TABLE "ParlayRoundMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "ParlayRoundMarket_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ParlayRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ParlayRoundMarket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ParlayEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payout" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "ParlayEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ParlayRound" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ParlayEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ParlayLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "ParlayLeg_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ParlayEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ParlayLeg_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ParlayLeg_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MarketOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "acceptedOddsBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payout" INTEGER,
    "settledAt" DATETIME,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bet_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bet_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "MarketOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Bet" ("createdAt", "id", "idempotencyKey", "marketId", "optionId", "payout", "settledAt", "stake", "userId")
SELECT "createdAt", "id", "idempotencyKey", "marketId", "optionId", "payout", "settledAt", "stake", "userId" FROM "Bet";
DROP TABLE "Bet";
ALTER TABLE "new_Bet" RENAME TO "Bet";
CREATE UNIQUE INDEX "Bet_idempotencyKey_key" ON "Bet"("idempotencyKey");
CREATE INDEX "Bet_marketId_optionId_idx" ON "Bet"("marketId", "optionId");
CREATE INDEX "Bet_userId_createdAt_idx" ON "Bet"("userId", "createdAt");

CREATE TABLE "new_Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "opensAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "returnRatioBps" INTEGER NOT NULL DEFAULT 2500,
    "prizeRatioBps" INTEGER NOT NULL DEFAULT 7000,
    "recoveryRatioBps" INTEGER NOT NULL DEFAULT 500,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Market_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Market" ("closesAt", "createdAt", "id", "matchId", "opensAt", "prizeRatioBps", "recoveryRatioBps", "returnRatioBps", "status", "title")
SELECT "closesAt", "createdAt", "id", "matchId", "opensAt", "prizeRatioBps", "recoveryRatioBps", "returnRatioBps", "status", "title" FROM "Market";
DROP TABLE "Market";
ALTER TABLE "new_Market" RENAME TO "Market";
CREATE INDEX "Market_status_closesAt_idx" ON "Market"("status", "closesAt");

CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "bestOf" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("awayScore", "awayTeamId", "bestOf", "createdAt", "homeScore", "homeTeamId", "id", "scheduledAt", "seasonId", "status", "track")
SELECT "awayScore", "awayTeamId", "bestOf", "createdAt", "homeScore", "homeTeamId", "id", "scheduledAt", "seasonId", "status", "track" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_weekNumber_scheduledAt_idx" ON "Match"("weekNumber", "scheduledAt");

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "id", "name", "role", "teamId")
SELECT "createdAt", "id", "name", "role", "teamId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "ParlayRound_dayKey_key" ON "ParlayRound"("dayKey");
CREATE UNIQUE INDEX "ParlayRoundMarket_roundId_marketId_key" ON "ParlayRoundMarket"("roundId", "marketId");
CREATE UNIQUE INDEX "ParlayRoundMarket_roundId_position_key" ON "ParlayRoundMarket"("roundId", "position");
CREATE UNIQUE INDEX "ParlayEntry_idempotencyKey_key" ON "ParlayEntry"("idempotencyKey");
CREATE INDEX "ParlayEntry_userId_createdAt_idx" ON "ParlayEntry"("userId", "createdAt");
CREATE UNIQUE INDEX "ParlayEntry_roundId_userId_key" ON "ParlayEntry"("roundId", "userId");
CREATE UNIQUE INDEX "ParlayLeg_entryId_marketId_key" ON "ParlayLeg"("entryId", "marketId");
CREATE UNIQUE INDEX "MarketOption_marketId_label_key" ON "MarketOption"("marketId", "label");
