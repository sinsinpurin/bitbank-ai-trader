-- CreateTable
CREATE TABLE "HistoricalCandle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pair" TEXT NOT NULL,
    "time" INTEGER NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalCandle_pair_time_key" ON "HistoricalCandle"("pair", "time");

-- CreateIndex
CREATE INDEX "HistoricalCandle_pair_time_idx" ON "HistoricalCandle"("pair", "time");
