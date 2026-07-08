-- Reporter Agent chatbot threads and messages
CREATE TABLE "ReporterChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userType" TEXT NOT NULL DEFAULT 'member',
    "title" TEXT NOT NULL DEFAULT 'Reporter Agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporterChatThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReporterChatThread_userId_idx" ON "ReporterChatThread"("userId");

CREATE TABLE "ReporterChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReporterChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReporterChatMessage_threadId_idx" ON "ReporterChatMessage"("threadId");

ALTER TABLE "ReporterChatMessage" ADD CONSTRAINT "ReporterChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ReporterChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
