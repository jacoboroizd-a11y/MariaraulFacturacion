-- AlterTable
ALTER TABLE "ReportDelivery" ADD COLUMN     "firstAttemptAt" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB;

INSERT INTO "Appointment" (id,"companyId","invoiceId","customerId",title,start,"end",status,"syncStatus",version,"syncedVersion","createdAt","updatedAt") SELECT md5(i.id || ':appointment'),i."companyId",i.id,i."customerId",coalesce(i."customerSnapshot"->>'name','Paciente') || ' · Próxima cita',i."nextAppointment",i."nextAppointment"+interval '1 hour','ACTIVE','LOCAL',1,0,now(),now() FROM "Invoice" i WHERE i."nextAppointment" IS NOT NULL AND i.status NOT IN ('VOID','DRAFT') AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a."invoiceId"=i.id);
