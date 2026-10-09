-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';

-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN     "calendarId" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "encryptedTokens" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "encryptedUrl" SET DEFAULT '';

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "holidays" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "advanceId" TEXT;

-- CreateTable
CREATE TABLE "CashDay" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "openedBy" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingNIO" DECIMAL(18,2) NOT NULL,
    "openingUSD" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "closeData" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CashDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAdvance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paymentDate" DATE NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedInvoiceId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedAmount" DECIMAL(18,2),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CustomerAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "googleEventId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'LOCAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerId" TEXT,
    "lastError" TEXT NOT NULL DEFAULT '',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashDay_companyId_status_idx" ON "CashDay"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashDay_companyId_day_key" ON "CashDay"("companyId", "day");

-- CreateIndex
CREATE INDEX "CustomerAdvance_companyId_customerId_idx" ON "CustomerAdvance"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdvance_companyId_requestId_key" ON "CustomerAdvance"("companyId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_invoiceId_key" ON "Appointment"("invoiceId");

-- CreateIndex
CREATE INDEX "Appointment_companyId_start_idx" ON "Appointment"("companyId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_invoiceId_companyId_key" ON "Appointment"("invoiceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_companyId_googleEventId_key" ON "Appointment"("companyId", "googleEventId");

-- CreateIndex
CREATE INDEX "ReportDelivery_status_createdAt_idx" ON "ReportDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDelivery_companyId_kind_period_key" ON "ReportDelivery"("companyId", "kind", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_advanceId_key" ON "Payment"("advanceId");

-- AddForeignKey
ALTER TABLE "CashDay" ADD CONSTRAINT "CashDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAdvance" ADD CONSTRAINT "CustomerAdvance_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "Invoice"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

