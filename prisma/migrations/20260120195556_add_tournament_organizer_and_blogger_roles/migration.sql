-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blogger" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tournamentOrganizer" BOOLEAN NOT NULL DEFAULT false;
