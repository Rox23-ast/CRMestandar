-- AlterTable
ALTER TABLE "Client" ADD COLUMN "quoteDestination" TEXT;
ALTER TABLE "Client" ADD COLUMN "quoteOrigin" TEXT;
ALTER TABLE "Client" ADD COLUMN "quoteVolume" REAL;

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "conversationId" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "volume" REAL,
    "price" REAL,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("clientId", "createdAt", "destination", "id", "origin", "price", "status", "updatedAt", "volume") SELECT "clientId", "createdAt", "destination", "id", "origin", "price", "status", "updatedAt", "volume" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE UNIQUE INDEX "Quote_externalId_key" ON "Quote"("externalId");
CREATE INDEX "Quote_conversationId_idx" ON "Quote"("conversationId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "WebhookEvent_direction_status_createdAt_idx" ON "WebhookEvent"("direction", "status", "createdAt");
