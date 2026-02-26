/*
  Warnings:

  - A unique constraint covering the columns `[rankedInfoId]` on the table `ChallongeConnection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[rankedInfoId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `player1RankedId` to the `Match` table without a default value. This is not possible if the table is not empty.
  - Added the required column `player2RankedId` to the `Match` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ChallongeConnection" ADD COLUMN     "rankedInfoId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "player1RankedId" TEXT,
ADD COLUMN     "player2RankedId" TEXT,
ADD COLUMN     "winnerRankedId" TEXT,
ALTER COLUMN "player1Id" DROP NOT NULL,
ALTER COLUMN "player2Id" DROP NOT NULL;

-- backfill ranked info for existing users and matches will follow after RankedUserInfo table creation

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rankedInfoId" TEXT;

-- CreateTable
CREATE TABLE "RankedUserInfo" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT,
    "connectionId" TEXT,
    "username" TEXT,
    "elo" INTEGER NOT NULL DEFAULT 1600,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankedUserInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RankedUserInfo_userId_key" ON "RankedUserInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RankedUserInfo_connectionId_key" ON "RankedUserInfo"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "RankedUserInfo_username_key" ON "RankedUserInfo"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ChallongeConnection_rankedInfoId_key" ON "ChallongeConnection"("rankedInfoId");

-- CreateIndex
CREATE INDEX "Match_player1RankedId_idx" ON "Match"("player1RankedId");

-- CreateIndex
CREATE INDEX "Match_player2RankedId_idx" ON "Match"("player2RankedId");

-- CreateIndex
CREATE UNIQUE INDEX "User_rankedInfoId_key" ON "User"("rankedInfoId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_rankedInfoId_fkey" FOREIGN KEY ("rankedInfoId") REFERENCES "RankedUserInfo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player1RankedId_fkey" FOREIGN KEY ("player1RankedId") REFERENCES "RankedUserInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_player2RankedId_fkey" FOREIGN KEY ("player2RankedId") REFERENCES "RankedUserInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerRankedId_fkey" FOREIGN KEY ("winnerRankedId") REFERENCES "RankedUserInfo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- backfill: create RankedUserInfo entries for existing users
INSERT INTO "RankedUserInfo" ("userId", "username", "elo", "createdAt", "updatedAt")
SELECT id, username, elo, now(), now() FROM "User";

-- backfill: link connections to ranked entries if possible
UPDATE "RankedUserInfo" r
SET "connectionId" = c.id
FROM "ChallongeConnection" c
WHERE c."userId" = r."userId";

-- backfill: if unclaimed connections have username, create ranked entries
INSERT INTO "RankedUserInfo" ("connectionId", "username")
SELECT id, "challongeUsername" FROM "ChallongeConnection"
WHERE "userId" IS NULL AND "challongeUsername" IS NOT NULL
ON CONFLICT ("connectionId") DO NOTHING;

-- backfill matches referencing user IDs
UPDATE "Match" m
SET "player1RankedId" = r.id
FROM "RankedUserInfo" r
WHERE r."userId" = m."player1Id";

UPDATE "Match" m
SET "player2RankedId" = r.id
FROM "RankedUserInfo" r
WHERE r."userId" = m."player2Id";

UPDATE "Match" m
SET "winnerRankedId" = r.id
FROM "RankedUserInfo" r
WHERE r."userId" = m."winner";

-- now enforce NOT NULL on rankedId columns
ALTER TABLE "Match" ALTER COLUMN "player1RankedId" SET NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "player2RankedId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ChallongeConnection" ADD CONSTRAINT "ChallongeConnection_rankedInfoId_fkey" FOREIGN KEY ("rankedInfoId") REFERENCES "RankedUserInfo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
