-- Actualización clínica: conserva usuarios, clientes, facturas y pagos existentes.
-- Ejecutar en Neon SQL Editor antes de publicar el nuevo código.
BEGIN;
DO $actualizar_clinica$
BEGIN
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009150000_clinic_sales' AND finished_at IS NOT NULL AND checksum='c41fd706be7a8f0107d2e72b8a909ef62332fbb0ab05875a58e0a575e1f2d081') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009150000_clinic_sales') THEN
    RAISE EXCEPTION 'La migración ya está registrada con otro estado. Revisar antes de continuar.';
  END IF;
ALTER TABLE "Product" ADD COLUMN "sessions" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD CONSTRAINT "product_sessions_valid" CHECK ("sessions" BETWEEN 1 AND 100);
ALTER TABLE "Invoice" ADD COLUMN "nextAppointment" TIMESTAMP(3), ADD COLUMN "checkoutKey" TEXT, ADD COLUMN "checkoutHash" TEXT;
CREATE UNIQUE INDEX "Invoice_companyId_checkoutKey_key" ON "Invoice"("companyId", "checkoutKey");
CREATE INDEX "Invoice_companyId_nextAppointment_idx" ON "Invoice"("companyId", "nextAppointment");
ALTER TABLE "InvoiceItem" ADD COLUMN "sessionsTotal" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "sessionsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "invoice_sessions_valid" CHECK ("sessionsTotal" >= 0 AND "sessionsUsed" >= 0 AND "sessionsUsed" <= "sessionsTotal");
ALTER TABLE "Product" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "product_stock_valid" CHECK ("stock" BETWEEN 0 AND 1000000000);
ALTER TABLE "Product" ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "Product" ADD CONSTRAINT "product_pricing_mode_valid" CHECK ("pricingMode" IN ('FIXED', 'PER_UNIT') AND ("pricingMode" = 'FIXED' OR ("type" = 'SERVICE' AND "sessions" = 1)));

  INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
    VALUES (gen_random_uuid()::text, 'c41fd706be7a8f0107d2e72b8a909ef62332fbb0ab05875a58e0a575e1f2d081', now(), '20261009150000_clinic_sales', 1);
END $actualizar_clinica$;
COMMIT;
SELECT migration_name, finished_at IS NOT NULL AS aplicada
FROM "_prisma_migrations" WHERE migration_name='20261009150000_clinic_sales';

-- Notas de venta: vencimiento opcional en almacenamiento, sin vencimiento en nuevas ventas.
BEGIN;
DO $sin_vencimiento$
BEGIN
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009160000_sales_without_due_date' AND finished_at IS NOT NULL AND checksum='3fbeb9c51556c498d55491663bbbf554871bc59d600adddba0dc9e081a17d3a5') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009160000_sales_without_due_date') THEN
    RAISE EXCEPTION 'La migración ya está registrada con otro estado. Revisar antes de continuar.';
  END IF;
ALTER TABLE "Invoice" ALTER COLUMN "dueDate" DROP NOT NULL;
  INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
    VALUES (gen_random_uuid()::text, '3fbeb9c51556c498d55491663bbbf554871bc59d600adddba0dc9e081a17d3a5', now(), '20261009160000_sales_without_due_date', 1);
END $sin_vencimiento$;
COMMIT;
