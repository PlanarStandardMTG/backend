-- CreateTable
CREATE TABLE "ChallongeConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallongeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChallongeConnection_userId_key" ON "ChallongeConnection"("userId");

-- CreateIndex
CREATE INDEX "ChallongeConnection_userId_idx" ON "ChallongeConnection"("userId");

-- AddForeignKey
ALTER TABLE "ChallongeConnection" ADD CONSTRAINT "ChallongeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
