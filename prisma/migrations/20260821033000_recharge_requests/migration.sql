CREATE TABLE "RechargeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "firstConfirmedById" TEXT,
    "firstConfirmedAt" DATETIME,
    "completedById" TEXT,
    "completedAt" DATETIME,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RechargeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RechargeRequest_firstConfirmedById_fkey" FOREIGN KEY ("firstConfirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RechargeRequest_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RechargeRequest_userId_createdAt_idx" ON "RechargeRequest"("userId", "createdAt");
CREATE INDEX "RechargeRequest_status_createdAt_idx" ON "RechargeRequest"("status", "createdAt");
