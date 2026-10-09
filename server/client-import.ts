import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { getCountries, type CountryCode } from "libphonenumber-js";
import { customerSchema } from "./validation";
import { authorize, AppError, type Context } from "./auth";
import { db, transaction } from "./db";
import { audit } from "./domain";
const normal = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f\s]/g, "");
export function clientsFromCells(
  cells: string[][],
  country: CountryCode = "NI",
) {
  const headers = cells[0]?.map(normal) || [];
  const name = headers.indexOf("nombreyapellido"),
    phone = headers.indexOf("numerodetelefono"),
    email = headers.indexOf("correoelectronico");
  if ([name, phone, email].some((i) => i < 0))
    throw new AppError(
      "Usa las columnas Nombre y Apellido, Numero de Telefono y Correo Electrónico.",
    );
  if (cells.length > 501)
    throw new AppError("Importa hasta 500 clientes por archivo.");
  const rows: { name: string; phone: string; email: string }[] = [],
    errors: string[] = [];
  for (const [index, cell] of cells.slice(1).entries()) {
    if (cell.every((v) => !v.trim())) continue;
    try {
      const data = customerSchema.parse({
        name: cell[name],
        phone: normalizePhone(cell[phone] || "", country),
        email: (cell[email] || "").trim().toLowerCase(),
      });
      rows.push({ name: data.name, phone: data.phone, email: data.email });
    } catch {
      errors.push(
        `Fila ${index + 2}: revisa nombre, teléfono con prefijo o correo.`,
      );
    }
  }
  return { rows, errors };
}
export async function previewClients(
  ctx: Context,
  file: File,
  country: string,
) {
  authorize(ctx, true);
  if (!getCountries().includes(country as CountryCode))
    throw new AppError("País inválido.");
  if (file.size > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".xlsx"))
    throw new AppError("Usa un Excel .xlsx de hasta 2 MB.");
  const book = new ExcelJS.Workbook();
  await book.xlsx.read(Readable.from(Buffer.from(await file.arrayBuffer())));
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount > 501)
    throw new AppError("Usa la primera hoja y hasta 500 clientes.");
  const cells: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) {
      const c = row.getCell(i);
      values.push(c.type === ExcelJS.ValueType.Formula ? "" : c.text);
    }
    cells.push(values);
  });
  const parsed = clientsFromCells(cells, country as CountryCode);
  const existing = await db.customer.findMany({
    where: { companyId: ctx.companyId },
    select: { phone: true, email: true },
  });
  const contacts = new Set(
    existing.flatMap((c) => [c.phone, c.email.toLowerCase()].filter(Boolean)),
  );
  return {
    ...parsed,
    rows: parsed.rows.map((row) => {
      const duplicate = Boolean(
        (row.phone && contacts.has(row.phone)) ||
        (row.email && contacts.has(row.email)),
      );
      if (row.phone) contacts.add(row.phone);
      if (row.email) contacts.add(row.email);
      return { ...row, duplicate };
    }),
  };
}
export async function importClients(ctx: Context, input: unknown) {
  authorize(ctx, true);
  const data = z
    .object({
      requestId: z.uuid(),
      rows: z
        .array(customerSchema.pick({ name: true, phone: true, email: true }))
        .min(1)
        .max(500),
    })
    .parse(input);
  return transaction(async (tx) => {
    const previous = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        action: "CLIENTS_IMPORTED",
        metadata: { path: ["requestId"], equals: data.requestId },
      },
    });
    if (previous) return previous.metadata;
    const existing = await tx.customer.findMany({
      where: { companyId: ctx.companyId },
      select: { phone: true, email: true },
    });
    const contacts = new Set(
      existing.flatMap((c) => [c.phone, c.email.toLowerCase()].filter(Boolean)),
    );
    let added = 0,
      skipped = 0;
    for (const row of data.rows) {
      const email = row.email.toLowerCase();
      if (
        (row.phone && contacts.has(row.phone)) ||
        (email && contacts.has(email))
      ) {
        skipped++;
        continue;
      }
      await tx.customer.create({
        data: { companyId: ctx.companyId, ...row, email },
      });
      added++;
      if (row.phone) contacts.add(row.phone);
      if (email) contacts.add(email);
    }
    const result = { requestId: data.requestId, added, skipped };
    await audit(tx, ctx, "Company", ctx.companyId, "CLIENTS_IMPORTED", result);
    return result;
  });
}
