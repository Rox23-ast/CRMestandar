-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "greetingMessage" TEXT NOT NULL DEFAULT '¡Hola! Soy el asistente virtual de Mudanzas Chico. ¿En qué te puedo ayudar hoy?',
    "awayMessage" TEXT NOT NULL DEFAULT 'En este momento estamos fuera de horario de atención. Déjanos tu mensaje y te contactaremos pronto.',
    "aiPersonalityPrompt" TEXT NOT NULL DEFAULT 'Eres un asistente formal y empático de una empresa de mudanzas llamada Mudanzas Chico.',
    "limitations" TEXT NOT NULL DEFAULT 'No dar precios finales sin confirmación de volumen por un agente.',
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customRules" TEXT NOT NULL DEFAULT '[]',
    "outreachTemplateName" TEXT,
    "outreachTemplateLanguage" TEXT NOT NULL DEFAULT 'es',
    "outreachTemplateVariables" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotConfig" ("id", "greetingMessage", "awayMessage", "aiPersonalityPrompt", "limitations", "botEnabled", "customRules", "updatedAt")
    SELECT "id", "greetingMessage", "awayMessage", "aiPersonalityPrompt", "limitations", "botEnabled", "customRules", "updatedAt" FROM "BotConfig";
DROP TABLE "BotConfig";
ALTER TABLE "new_BotConfig" RENAME TO "BotConfig";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
