-- Ejecutar en Neon SQL Editor ANTES de desplegar el código nuevo.
-- Conserva cuentas y facturas. Nunca ejecutar el seed en producción.
-- Cada migración es transaccional y comprueba su checksum.
DO $pre$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009180000_staff_login' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Primero ejecutar activar-calendario-y-usuarios-neon.sql'; END IF;
END $pre$;

-- 20261009200000_clinic_operations
BEGIN;
DO $migration0$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009200000_clinic_operations' AND finished_at IS NOT NULL AND checksum='50edfb94590d03860f867f7633d99079ce67f675623673b5bf0f3e1a565e290a' AND rolled_back_at IS NULL) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009200000_clinic_operations') THEN RAISE EXCEPTION 'La migración 20261009200000_clinic_operations ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;
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


 INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'50edfb94590d03860f867f7633d99079ce67f675623673b5bf0f3e1a565e290a',now(),'20261009200000_clinic_operations',1);
END $migration0$;
COMMIT;

-- 20261009210000_report_classification
BEGIN;
DO $migration1$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009210000_report_classification' AND finished_at IS NOT NULL AND checksum='26f1d75a6ff9f0ceeafae4a0851c7b9a3304d687a66e27855ba236c3b58f6970' AND rolled_back_at IS NULL) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009210000_report_classification') THEN RAISE EXCEPTION 'La migración 20261009210000_report_classification ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;
-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "reportGroup" TEXT NOT NULL DEFAULT 'ESTHETIC';

UPDATE "InvoiceItem" i SET "reportGroup"=CASE WHEN p.type='PRODUCT' THEN 'SKINCARE' WHEN p.category ~* 'l[aá]ser' THEN 'LASER' ELSE 'ESTHETIC' END FROM "Product" p WHERE p.id=i."productId" AND p."companyId"=i."companyId";

 INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'26f1d75a6ff9f0ceeafae4a0851c7b9a3304d687a66e27855ba236c3b58f6970',now(),'20261009210000_report_classification',1);
END $migration1$;
COMMIT;

-- 20261009220000_delivery_snapshot
BEGIN;
DO $migration2$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009220000_delivery_snapshot' AND finished_at IS NOT NULL AND checksum='6aa4bec31559d0058071163c84e8038e35092844dd7d98b0de5715752972bea1' AND rolled_back_at IS NULL) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009220000_delivery_snapshot') THEN RAISE EXCEPTION 'La migración 20261009220000_delivery_snapshot ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;
-- AlterTable
ALTER TABLE "ReportDelivery" ADD COLUMN     "firstAttemptAt" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB;

INSERT INTO "Appointment" (id,"companyId","invoiceId","customerId",title,start,"end",status,"syncStatus",version,"syncedVersion","createdAt","updatedAt") SELECT md5(i.id || ':appointment'),i."companyId",i.id,i."customerId",coalesce(i."customerSnapshot"->>'name','Paciente') || ' · Próxima cita',i."nextAppointment",i."nextAppointment"+interval '1 hour','ACTIVE','LOCAL',1,0,now(),now() FROM "Invoice" i WHERE i."nextAppointment" IS NOT NULL AND i.status NOT IN ('VOID','DRAFT') AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a."invoiceId"=i.id);

 INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'6aa4bec31559d0058071163c84e8038e35092844dd7d98b0de5715752972bea1',now(),'20261009220000_delivery_snapshot',1);
END $migration2$;
COMMIT;

-- 20261009230000_messaging
BEGIN;
DO $migration3$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009230000_messaging' AND finished_at IS NOT NULL AND checksum='190aff1f48cc6904f466a1e8b28ab1a166e7e86c7cc1cdc993bc957e0bad4503' AND rolled_back_at IS NULL) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009230000_messaging') THEN RAISE EXCEPTION 'La migración 20261009230000_messaging ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;
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


 INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'190aff1f48cc6904f466a1e8b28ab1a166e7e86c7cc1cdc993bc957e0bad4503',now(),'20261009230000_messaging',1);
END $migration3$;
COMMIT;

-- 20261010000000_cash_movements
BEGIN;
DO $migration4$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261010000000_cash_movements' AND finished_at IS NOT NULL AND checksum='3a491c7e47c82e502ce93235fc7453e6b7db75f5e783404ffdee754d09a0296e' AND rolled_back_at IS NULL) THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261010000000_cash_movements') THEN RAISE EXCEPTION 'La migración 20261010000000_cash_movements ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;
-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cashDayId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "reason" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipient" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashMovement_companyId_cashDayId_idx" ON "CashMovement"("companyId", "cashDayId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_companyId_requestId_key" ON "CashMovement"("companyId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CashDay_id_companyId_key" ON "CashDay"("id", "companyId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashDayId_companyId_fkey" FOREIGN KEY ("cashDayId", "companyId") REFERENCES "CashDay"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;


 INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'3a491c7e47c82e502ce93235fc7453e6b7db75f5e783404ffdee754d09a0296e',now(),'20261010000000_cash_movements',1);
END $migration4$;
COMMIT;

SELECT migration_name,finished_at IS NOT NULL AS aplicada FROM "_prisma_migrations" WHERE migration_name IN ('20261009200000_clinic_operations','20261009210000_report_classification','20261009220000_delivery_snapshot','20261009230000_messaging','20261010000000_cash_movements') ORDER BY migration_name;
