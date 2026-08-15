-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 15,
    "followUpMinutes" INTEGER NOT NULL DEFAULT 1440,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BootstrapState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "completedAt" DATETIME
);
