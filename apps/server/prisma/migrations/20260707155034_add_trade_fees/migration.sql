-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Position" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closePrice" REAL,
    "pnl" REAL,
    "strategyId" TEXT,
    "stopLossPct" REAL,
    "takeProfitPct" REAL,
    "trailingStopPct" REAL,
    "highestPrice" REAL,
    "entryFee" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_Position" ("amount", "closePrice", "closedAt", "entryPrice", "highestPrice", "id", "openedAt", "pair", "pnl", "side", "stopLossPct", "strategyId", "takeProfitPct", "trailingStopPct") SELECT "amount", "closePrice", "closedAt", "entryPrice", "highestPrice", "id", "openedAt", "pair", "pnl", "side", "stopLossPct", "strategyId", "takeProfitPct", "trailingStopPct" FROM "Position";
DROP TABLE "Position";
ALTER TABLE "new_Position" RENAME TO "Position";
CREATE TABLE "new_Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'ai_decision',
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "strategyId" TEXT,
    "fee" REAL NOT NULL DEFAULT 0,
    "aiDecisionId" TEXT,
    "positionId" TEXT,
    CONSTRAINT "Trade_aiDecisionId_fkey" FOREIGN KEY ("aiDecisionId") REFERENCES "AiDecisionLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Trade" ("aiDecisionId", "amount", "executedAt", "id", "pair", "positionId", "price", "reason", "side", "strategyId") SELECT "aiDecisionId", "amount", "executedAt", "id", "pair", "positionId", "price", "reason", "side", "strategyId" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
