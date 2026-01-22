-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "challongeId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "tournamentType" TEXT NOT NULL,
    "url" TEXT,
    "state" TEXT,
    "startsAt" TIMESTAMP(3),
    "gameName" TEXT,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_challongeId_key" ON "Tournament"("challongeId");

-- CreateIndex
CREATE INDEX "Tournament_userId_idx" ON "Tournament"("userId");

-- CreateIndex
CREATE INDEX "Tournament_challongeId_idx" ON "Tournament"("challongeId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ChallongeConnection"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
