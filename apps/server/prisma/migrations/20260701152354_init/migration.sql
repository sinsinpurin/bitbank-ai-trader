-- CreateTable
CREATE TABLE "AiDecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closePrice" REAL,
    "pnl" REAL
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiDecisionId" TEXT,
    "positionId" TEXT,
    CONSTRAINT "Trade_aiDecisionId_fkey" FOREIGN KEY ("aiDecisionId") REFERENCES "AiDecisionLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VirtualBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currency" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "VirtualBalance_currency_key" ON "VirtualBalance"("currency");
