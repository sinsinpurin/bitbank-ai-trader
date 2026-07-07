-- CreateTable
CREATE TABLE "SignalWatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT '',
    "pair" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BotSignalLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "triggeredAt" DATETIME NOT NULL,
    "executed" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL
);
