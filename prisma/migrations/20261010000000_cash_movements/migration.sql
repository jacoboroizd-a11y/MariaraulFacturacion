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

