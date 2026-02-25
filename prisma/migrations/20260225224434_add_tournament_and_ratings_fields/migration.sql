-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "tournamentId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "ratingsUpdated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "Match"("tournamentId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
