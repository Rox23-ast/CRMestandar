-- CreateTable
CREATE TABLE "StoredCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "data" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
