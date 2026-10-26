ALTER TABLE "ParlayConfig" ADD COLUMN "dailyCheckinReward" INTEGER NOT NULL DEFAULT 400;

CREATE TABLE "DailyCheckin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyCheckin_userId_dayKey_key" ON "DailyCheckin"("userId", "dayKey");
CREATE INDEX "DailyCheckin_dayKey_idx" ON "DailyCheckin"("dayKey");
