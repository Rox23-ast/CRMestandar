-- AlterTable
ALTER TABLE "Message" ADD COLUMN "replyToMessageId" TEXT;

-- CreateForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");
