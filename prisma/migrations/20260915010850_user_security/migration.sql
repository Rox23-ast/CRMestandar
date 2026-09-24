-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "maxActiveConversations" INTEGER NOT NULL DEFAULT 20,
    "lastAssignedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("availabilityStatus", "createdAt", "email", "id", "lastAssignedAt", "maxActiveConversations", "name", "password", "role", "updatedAt") SELECT "availabilityStatus", "createdAt", "email", "id", "lastAssignedAt", "maxActiveConversations", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
