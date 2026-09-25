-- ================================================================
-- Mudanzas Chico - Estructura de la base de datos (SQLite)
-- Generado: 2026-09-24T05:21:24.131Z
-- Script: npm run db:schema (scripts/dump-db-schema.mjs)
-- ================================================================
-- TABLE: AuditEvent
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

-- TABLE: BootstrapState
CREATE TABLE "BootstrapState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "completedAt" DATETIME
);

-- TABLE: BotConfig
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greetingMessage" TEXT NOT NULL DEFAULT '¡Hola! Soy el asistente virtual de Mudanzas Chico. ¿En qué te puedo ayudar hoy?',
    "awayMessage" TEXT NOT NULL DEFAULT 'En este momento estamos fuera de horario de atención. Déjanos tu mensaje y te contactaremos pronto.',
    "aiPersonalityPrompt" TEXT NOT NULL DEFAULT 'Eres un asistente formal y empático de una empresa de mudanzas llamada Mudanzas Chico.',
    "limitations" TEXT NOT NULL DEFAULT 'No dar precios finales sin confirmación de volumen por un agente.',
    "customRules" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);

-- TABLE: BusinessHoursConfig
CREATE TABLE "BusinessHoursConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "weeklySchedule" TEXT NOT NULL DEFAULT '{"0":null,"1":{"start":"08:00","end":"18:00"},"2":{"start":"08:00","end":"18:00"},"3":{"start":"08:00","end":"18:00"},"4":{"start":"08:00","end":"18:00"},"5":{"start":"08:00","end":"18:00"},"6":null}',
    "updatedAt" DATETIME NOT NULL
);

-- TABLE: BusinessHoursException
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

-- TABLE: Client
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "botStep" TEXT NOT NULL DEFAULT 'START',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
, "quoteDestination" TEXT, "quoteOrigin" TEXT, "quoteVolume" REAL);

-- TABLE: Conversation
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
    "updatedAt" DATETIME NOT NULL, "businessStatus" TEXT,
    CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- TABLE: ConversationAssignment
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

-- TABLE: ConversationStatusConfig
CREATE TABLE "ConversationStatusConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- TABLE: Message
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

-- TABLE: Notification
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

-- TABLE: Quote
CREATE TABLE "Quote" (
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

-- TABLE: SlaPolicy
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "firstResponseMinutes" INTEGER NOT NULL DEFAULT 15,
    "followUpMinutes" INTEGER NOT NULL DEFAULT 1440,
    "updatedAt" DATETIME NOT NULL
);

-- TABLE: StoredCredential
CREATE TABLE "StoredCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "data" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- TABLE: User
CREATE TABLE "User" (
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

-- TABLE: WebhookEvent
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

-- INDEX: AuditEvent_conversationId_createdAt_idx
CREATE INDEX "AuditEvent_conversationId_createdAt_idx" ON "AuditEvent"("conversationId", "createdAt");

-- INDEX: BusinessHoursException_date_key
CREATE UNIQUE INDEX "BusinessHoursException_date_key" ON "BusinessHoursException"("date");

-- INDEX: Client_phone_key
CREATE UNIQUE INDEX "Client_phone_key" ON "Client"("phone");

-- INDEX: ConversationAssignment_assignedUserId_releasedAt_idx
CREATE INDEX "ConversationAssignment_assignedUserId_releasedAt_idx" ON "ConversationAssignment"("assignedUserId", "releasedAt");

-- INDEX: ConversationAssignment_conversationId_assignedAt_idx
CREATE INDEX "ConversationAssignment_conversationId_assignedAt_idx" ON "ConversationAssignment"("conversationId", "assignedAt");

-- INDEX: ConversationStatusConfig_code_key
CREATE UNIQUE INDEX "ConversationStatusConfig_code_key" ON "ConversationStatusConfig"("code");

-- INDEX: Conversation_assignedUserId_status_idx
CREATE INDEX "Conversation_assignedUserId_status_idx" ON "Conversation"("assignedUserId", "status");

-- INDEX: Conversation_clientId_status_idx
CREATE INDEX "Conversation_clientId_status_idx" ON "Conversation"("clientId", "status");

-- INDEX: Conversation_status_priority_lastMessageAt_idx
CREATE INDEX "Conversation_status_priority_lastMessageAt_idx" ON "Conversation"("status", "priority", "lastMessageAt");

-- INDEX: Message_conversationId_createdAt_idx
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- INDEX: Message_externalId_key
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- INDEX: Notification_role_readAt_createdAt_idx
CREATE INDEX "Notification_role_readAt_createdAt_idx" ON "Notification"("role", "readAt", "createdAt");

-- INDEX: Notification_userId_readAt_createdAt_idx
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- INDEX: Quote_conversationId_idx
CREATE INDEX "Quote_conversationId_idx" ON "Quote"("conversationId");

-- INDEX: Quote_externalId_key
CREATE UNIQUE INDEX "Quote_externalId_key" ON "Quote"("externalId");

-- INDEX: User_email_key
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- INDEX: WebhookEvent_direction_status_createdAt_idx
CREATE INDEX "WebhookEvent_direction_status_createdAt_idx" ON "WebhookEvent"("direction", "status", "createdAt");
