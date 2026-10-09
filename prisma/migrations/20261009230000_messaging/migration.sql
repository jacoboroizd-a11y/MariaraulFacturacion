-- CreateTable
CREATE TABLE "MessagingConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "whatsappPhoneId" TEXT,
    "whatsappBusinessId" TEXT,
    "instagramId" TEXT,
    "facebookPageId" TEXT,
    "encryptedVerifyToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "lastIncomingAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "providerId" TEXT,
    "requestId" TEXT,
    "direction" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_companyId_key" ON "MessagingConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_whatsappPhoneId_key" ON "MessagingConnection"("whatsappPhoneId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_instagramId_key" ON "MessagingConnection"("instagramId");

-- CreateIndex
CREATE INDEX "MessageThread_companyId_updatedAt_idx" ON "MessageThread"("companyId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_companyId_channel_contactId_key" ON "MessageThread"("companyId", "channel", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicMessage_providerId_key" ON "ClinicMessage"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicMessage_requestId_key" ON "ClinicMessage"("requestId");

-- CreateIndex
CREATE INDEX "ClinicMessage_companyId_threadId_createdAt_idx" ON "ClinicMessage"("companyId", "threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessagingConnection" ADD CONSTRAINT "MessagingConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicMessage" ADD CONSTRAINT "ClinicMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

