-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greetingMessage" TEXT NOT NULL DEFAULT '��Hola! Soy el asistente virtual de Mudanzas Chico. ��En quǸ te puedo ayudar hoy?',
    "awayMessage" TEXT NOT NULL DEFAULT 'En este momento estamos fuera de horario de atenci��n. DǸjanos tu mensaje y te contactaremos pronto.',
    "aiPersonalityPrompt" TEXT NOT NULL DEFAULT 'Eres un asistente formal y empǭtico de una empresa de mudanzas llamada Mudanzas Chico.',
    "limitations" TEXT NOT NULL DEFAULT 'No dar precios finales sin confirmaci��n de volumen por un agente.',
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customRules" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotConfig" ("aiPersonalityPrompt", "awayMessage", "customRules", "greetingMessage", "id", "limitations", "updatedAt") SELECT "aiPersonalityPrompt", "awayMessage", "customRules", "greetingMessage", "id", "limitations", "updatedAt" FROM "BotConfig";
DROP TABLE "BotConfig";
ALTER TABLE "new_BotConfig" RENAME TO "BotConfig";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
