-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "assignedRole" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOT_ACTIVE',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstResponseDueAt" DATETIME,
    "nextFollowUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "mediaId" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "assignedRole" TEXT,
    "assignedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    CONSTRAINT "ConversationAssignment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConversationAssignment_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ConversationAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "role" TEXT,
    "conversationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessHoursConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "weeklySchedule" TEXT NOT NULL DEFAULT '{"0":null,"1":{"start":"08:00","end":"18:00"},"2":{"start":"08:00","end":"18:00"},"3":{"start":"08:00","end":"18:00"},"4":{"start":"08:00","end":"18:00"},"5":{"start":"08:00","end":"18:00"},"6":null}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BusinessHoursException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "password", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "Conversation_status_priority_lastMessageAt_idx" ON "Conversation"("status", "priority", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_assignedUserId_status_idx" ON "Conversation"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "Conversation_clientId_status_idx" ON "Conversation"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationAssignment_conversationId_assignedAt_idx" ON "ConversationAssignment"("conversationId", "assignedAt");

-- CreateIndex
CREATE INDEX "ConversationAssignment_assignedUserId_releasedAt_idx" ON "ConversationAssignment"("assignedUserId", "releasedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_conversationId_createdAt_idx" ON "AuditEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_role_readAt_createdAt_idx" ON "Notification"("role", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHoursException_date_key" ON "BusinessHoursException"("date");
