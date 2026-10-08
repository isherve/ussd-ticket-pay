-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "balanceRwf" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromUserId" TEXT,
    "totalRwf" INTEGER NOT NULL,
    "shareRwf" INTEGER,
    "remainderRwf" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transferId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountRwf" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransferLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_reference_key" ON "Transfer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_idempotencyKey_key" ON "Transfer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transfer_fromUserId_createdAt_idx" ON "Transfer"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TransferLine_userId_createdAt_idx" ON "TransferLine"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TransferLine_transferId_idx" ON "TransferLine"("transferId");
