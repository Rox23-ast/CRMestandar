-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "businessStatus" TEXT;

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "ConversationStatusConfig_code_key" ON "ConversationStatusConfig"("code");

-- Seed initial conversation statuses
INSERT INTO "ConversationStatusConfig" ("id", "code", "label", "color", "isFinal", "isActive", "sortOrder", "updatedAt") VALUES
('2a1b3c4d-5e6f-7g8h-9i0j-km1n2o3p4q5r', 'PENDIENTE_COTIZACION', 'Pendiente de cotización', '#f59e0b', false, true, 1, CURRENT_TIMESTAMP),
('3b4c5d6e-7f8g-9h0i-1j2k-lm3n4o5p6q7r', 'EN_PROCESO', 'En proceso', '#3b82f6', false, true, 2, CURRENT_TIMESTAMP),
('4c5d6e7f-8g0h-1i2j-3k4l-5n6o7p8q9r0s', 'FINALIZADO', 'Finalizado', '#22c55e', true, true, 3, CURRENT_TIMESTAMP);
