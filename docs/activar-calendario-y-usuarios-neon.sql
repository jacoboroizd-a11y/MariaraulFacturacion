-- Conexión privada de Google Calendar. Conserva los datos existentes.
BEGIN;
DO $google_calendar$
BEGIN
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009170000_google_calendar' AND finished_at IS NOT NULL AND checksum='54ce7f3d87b4dc1e9031e0c42332c647248e1518ec837cfc3b003a2f3f005e43') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009170000_google_calendar') THEN
    RAISE EXCEPTION 'La migración ya está registrada con otro estado. Revisar antes de continuar.';
  END IF;
CREATE TABLE "CalendarConnection" (
  "companyId" TEXT PRIMARY KEY,
  "encryptedUrl" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
  INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (gen_random_uuid()::text, '54ce7f3d87b4dc1e9031e0c42332c647248e1518ec837cfc3b003a2f3f005e43', now(), '20261009170000_google_calendar', 1);
END $google_calendar$;
COMMIT;
SELECT migration_name, finished_at IS NOT NULL AS aplicada FROM "_prisma_migrations" WHERE migration_name='20261009170000_google_calendar';

-- Acceso de personal: usuario y PIN. Conserva el acceso existente.
BEGIN;
DO $staff_login$
BEGIN
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009180000_staff_login' AND finished_at IS NOT NULL AND checksum='ea85ca7dd9dc1f44adb2bfe5ba6a2c62d9494d33cf22107a9c1187faac54d98f') THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009180000_staff_login') THEN RAISE EXCEPTION 'Revisar el estado previo de la migración de usuarios.'; END IF;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

 INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES (gen_random_uuid()::text, 'ea85ca7dd9dc1f44adb2bfe5ba6a2c62d9494d33cf22107a9c1187faac54d98f', now(), '20261009180000_staff_login', 1);
END $staff_login$;
COMMIT;

SELECT migration_name, finished_at IS NOT NULL AS aplicada FROM "_prisma_migrations" WHERE migration_name IN ('20261009170000_google_calendar', '20261009180000_staff_login') ORDER BY migration_name;
