-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "draw" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "player1Score" INTEGER,
ADD COLUMN     "player2Score" INTEGER;
