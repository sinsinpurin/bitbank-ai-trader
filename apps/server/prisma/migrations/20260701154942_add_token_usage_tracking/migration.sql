-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiDecisionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AiDecisionLog" ("action", "confidence", "createdAt", "id", "pair", "reasoning") SELECT "action", "confidence", "createdAt", "id", "pair", "reasoning" FROM "AiDecisionLog";
DROP TABLE "AiDecisionLog";
ALTER TABLE "new_AiDecisionLog" RENAME TO "AiDecisionLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
