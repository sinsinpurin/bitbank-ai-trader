-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'ai_decision',
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiDecisionId" TEXT,
    "positionId" TEXT,
    CONSTRAINT "Trade_aiDecisionId_fkey" FOREIGN KEY ("aiDecisionId") REFERENCES "AiDecisionLog" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Trade" ("aiDecisionId", "amount", "executedAt", "id", "pair", "positionId", "price", "side") SELECT "aiDecisionId", "amount", "executedAt", "id", "pair", "positionId", "price", "side" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
