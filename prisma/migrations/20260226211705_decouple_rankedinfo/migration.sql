/*
  Warnings:

  - You are about to drop the column `userId` on the `ChallongeConnection` table. All the data in the column will be lost.
  - You are about to drop the column `player1Id` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `player2Id` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `winner` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Tournament` table. All the data in the column will be lost.
  - You are about to drop the column `elo` on the `User` table. All the data in the column will be lost.
  - Made the column `challongeUsername` on table `ChallongeConnection` required. This step will fail if there are existing NULL values in that column.
  - Made the column `username` on table `RankedUserInfo` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ChallongeConnection" DROP CONSTRAINT "ChallongeConnection_userId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_player1Id_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_player2Id_fkey";

-- DropForeignKey
ALTER TABLE "Tournament" DROP CONSTRAINT "Tournament_userId_fkey";

-- DropIndex
DROP INDEX "ChallongeConnection_userId_idx";

-- DropIndex
DROP INDEX "ChallongeConnection_userId_key";

-- DropIndex
DROP INDEX "Match_player1Id_idx";

-- DropIndex
DROP INDEX "Match_player2Id_idx";

-- DropIndex
DROP INDEX "Tournament_userId_idx";

-- AlterTable
ALTER TABLE "ChallongeConnection" DROP COLUMN "userId",
ALTER COLUMN "challongeUsername" SET NOT NULL;

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "player1Id",
DROP COLUMN "player2Id",
DROP COLUMN "winner";

-- AlterTable
ALTER TABLE "RankedUserInfo" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "username" SET NOT NULL;

-- AlterTable
ALTER TABLE "Tournament" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "elo";
