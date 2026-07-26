-- AlterTable
ALTER TABLE "Position" ADD COLUMN "highestPrice" REAL;
ALTER TABLE "Position" ADD COLUMN "stopLossPct" REAL;
ALTER TABLE "Position" ADD COLUMN "strategyId" TEXT;
ALTER TABLE "Position" ADD COLUMN "takeProfitPct" REAL;
ALTER TABLE "Position" ADD COLUMN "trailingStopPct" REAL;

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN "maxOpenPositions" INTEGER;
ALTER TABLE "Strategy" ADD COLUMN "positionSizeJpy" REAL;
ALTER TABLE "Strategy" ADD COLUMN "stopLossPct" REAL;
ALTER TABLE "Strategy" ADD COLUMN "takeProfitPct" REAL;
ALTER TABLE "Strategy" ADD COLUMN "trailingStopPct" REAL;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN "strategyId" TEXT;
