/*
  Warnings:

  - A unique constraint covering the columns `[challongeUsername]` on the table `ChallongeConnection` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChallongeConnection" ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "accessToken" DROP NOT NULL,
ALTER COLUMN "refreshToken" DROP NOT NULL,
ALTER COLUMN "expiresAt" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChallongeConnection_challongeUsername_key" ON "ChallongeConnection"("challongeUsername");
