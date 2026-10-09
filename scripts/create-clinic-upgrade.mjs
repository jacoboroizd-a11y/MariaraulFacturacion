import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const names = [
  "20261009200000_clinic_operations",
  "20261009210000_report_classification",
  "20261009220000_delivery_snapshot",
  "20261009230000_messaging",
  "20261010000000_cash_movements",
];
let output = `-- Ejecutar en Neon SQL Editor ANTES de desplegar el código nuevo.\n-- Conserva cuentas y facturas. Nunca ejecutar el seed en producción.\n-- Cada migración es transaccional y comprueba su checksum.\nDO $pre$ BEGIN\n IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261009180000_staff_login' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Primero ejecutar activar-calendario-y-usuarios-neon.sql'; END IF;\nEND $pre$;\n\n`;
for (const [index, name] of names.entries()) {
  const sql = await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
    checksum = createHash("sha256").update(sql).digest("hex");
  output += `-- ${name}\nBEGIN;\nDO $migration${index}$ BEGIN\n PERFORM pg_advisory_xact_lock(hashtext('mariaraul-clinic-upgrade'));\n IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='${name}' AND finished_at IS NOT NULL AND checksum='${checksum}' AND rolled_back_at IS NULL) THEN RETURN; END IF;\n IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='${name}') THEN RAISE EXCEPTION 'La migración ${name} ya existe con otro estado o checksum. Revisar antes de continuar.'; END IF;\n${sql}\n INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (gen_random_uuid()::text,'${checksum}',now(),'${name}',1);\nEND $migration${index}$;\nCOMMIT;\n\n`;
}
output += `SELECT migration_name,finished_at IS NOT NULL AS aplicada FROM "_prisma_migrations" WHERE migration_name IN (${names.map((n) => `'${n}'`).join(",")}) ORDER BY migration_name;\n`;
await writeFile("docs/actualizar-operaciones-clinica-neon.sql", output);
