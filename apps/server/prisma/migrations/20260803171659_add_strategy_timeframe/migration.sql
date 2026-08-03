-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Strategy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pair" TEXT NOT NULL DEFAULT 'btc_jpy',
    "timeframe" TEXT NOT NULL DEFAULT '1min',
    "description" TEXT NOT NULL DEFAULT '',
    "graph" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "positionSizeJpy" REAL,
    "maxOpenPositions" INTEGER,
    "stopLossPct" REAL,
    "takeProfitPct" REAL,
    "trailingStopPct" REAL
);
INSERT INTO "new_Strategy" ("createdAt", "description", "graph", "id", "isActive", "maxOpenPositions", "name", "pair", "positionSizeJpy", "stopLossPct", "takeProfitPct", "trailingStopPct", "updatedAt") SELECT "createdAt", "description", "graph", "id", "isActive", "maxOpenPositions", "name", "pair", "positionSizeJpy", "stopLossPct", "takeProfitPct", "trailingStopPct", "updatedAt" FROM "Strategy";
DROP TABLE "Strategy";
ALTER TABLE "new_Strategy" RENAME TO "Strategy";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
