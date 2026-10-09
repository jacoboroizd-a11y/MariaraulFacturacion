-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "reportGroup" TEXT NOT NULL DEFAULT 'ESTHETIC';

UPDATE "InvoiceItem" i SET "reportGroup"=CASE WHEN p.type='PRODUCT' THEN 'SKINCARE' WHEN p.category ~* 'l[aá]ser' THEN 'LASER' ELSE 'ESTHETIC' END FROM "Product" p WHERE p.id=i."productId" AND p."companyId"=i."companyId";
