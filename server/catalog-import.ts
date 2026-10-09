import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { z } from "zod";
import { productSchema } from "./validation";
import { authorize, AppError, type Context } from "./auth";
import { transaction } from "./db";
import { audit, saveProductTx } from "./domain";
export type CatalogRow = z.infer<typeof productSchema>;
const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
const columns: Record<string, keyof CatalogRow> = {
  nombre: "name",
  tratamiento: "name",
  producto: "name",
  name: "name",
  tipo: "type",
  type: "type",
  precio: "price",
  precioporunidad: "price",
  price: "price",
  moneda: "currency",
  currency: "currency",
  sesiones: "sessions",
  sessions: "sessions",
  existencias: "stock",
  stock: "stock",
  inventario: "stock",
  cantidad: "stock",
  cobro: "pricingMode",
  mododecobro: "pricingMode",
  pricingmode: "pricingMode",
  unidad: "unit",
  unit: "unit",
  codigo: "sku",
  sku: "sku",
  categoria: "category",
  category: "category",
  descripcion: "description",
  description: "description",
};
export type ImportMode = "MIXED" | "SERVICE" | "PRODUCT";
export function catalogFromCells(
  cells: string[][],
  mode: ImportMode = "MIXED",
) {
  if (cells.length < 2)
    throw new AppError(
      "El archivo debe tener encabezados y al menos un artículo.",
    );
  if (cells.length > 201)
    throw new AppError("Importa un máximo de 200 artículos por archivo.");
  const headers = cells[0].map(normalize);
  if (
    !headers.some((h) => columns[h] === "name") ||
    !headers.some((h) => columns[h] === "price")
  )
    throw new AppError(
      "Faltan las columnas nombre y precio. Usa la plantilla.",
    );
  const rows: CatalogRow[] = [],
    errors: string[] = [];
  const seen = new Set<string>();
  for (const [index, values] of cells.slice(1).entries()) {
    if (values.every((v) => !v.trim())) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      const key = columns[h];
      if (key && values[i]?.trim()) raw[key] = values[i].trim();
    });
    const type = normalize(
      raw.type || (mode === "PRODUCT" ? "producto" : "tratamiento"),
    );
    raw.type = ["producto", "cosmetico", "product"].includes(type)
      ? "PRODUCT"
      : ["tratamiento", "paquete", "servicio", "service"].includes(type)
        ? "SERVICE"
        : raw.type;
    if (mode !== "MIXED" && raw.type !== mode) {
      errors.push(
        `Fila ${index + 2}: el tipo no coincide con la importación seleccionada. Usa un archivo separado o elige Catálogo completo.`,
      );
      continue;
    }
    raw.currency = (raw.currency || "NIO").toUpperCase();
    const pricingMode = normalize(raw.pricingMode || "fijo");
    raw.pricingMode = ["unidad", "porunidad", "perunit"].includes(pricingMode)
      ? "PER_UNIT"
      : ["fijo", "fixed"].includes(pricingMode)
        ? "FIXED"
        : raw.pricingMode;
    raw.price = (raw.price || "").replace(",", ".");
    raw.sku ||=
      "CAT-" +
      normalize(raw.name || "")
        .toUpperCase()
        .slice(0, 80);
    raw.unit ||=
      raw.pricingMode === "PER_UNIT"
        ? "unidad"
        : raw.type === "SERVICE"
          ? "tratamiento"
          : "unidad";
    const result = productSchema.safeParse(raw);
    if (!result.success)
      errors.push(
        `Fila ${index + 2}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    else if (seen.has(result.data.sku))
      errors.push(`Fila ${index + 2}: código repetido ${result.data.sku}.`);
    else {
      seen.add(result.data.sku);
      rows.push(result.data);
    }
  }
  if (!rows.length && !errors.length)
    throw new AppError("El archivo no contiene artículos.");
  return { rows, errors };
}
export async function parseCatalogFile(file: File, mode: ImportMode = "MIXED") {
  if (file.size > 5 * 1024 * 1024)
    throw new AppError("El archivo admite máximo 5 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (/\.xlsx$/i.test(file.name))
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  else if (/\.csv$/i.test(file.name)) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const header = text.split(/\r?\n/, 1)[0];
    const delimiter =
      header.split(";").length > header.split(",").length ? ";" : ",";
    await workbook.csv.read(Readable.from([text]), {
      parserOptions: { delimiter },
    });
  } else
    throw new AppError("Usa un archivo .xlsx o .csv. Convierte .xls a .xlsx.");
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("El archivo no tiene una hoja de datos.");
  if (sheet.rowCount > 201 || sheet.columnCount > 30)
    throw new AppError("Usa hasta 200 artículos y 30 columnas.");
  const cells: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      const cell = row.getCell(column);
      if (cell.type === ExcelJS.ValueType.Formula)
        throw new AppError(
          "Reemplaza las fórmulas por sus valores antes de importar.",
        );
      values.push(cell.text);
    }
    cells.push(values);
  });
  return catalogFromCells(cells, mode);
}
export async function importCatalog(ctx: Context, input: unknown) {
  authorize(ctx);
  const { requestId, rows } = z
    .object({
      requestId: z.uuid(),
      rows: z.array(productSchema).min(1).max(200),
    })
    .parse(input);
  if (new Set(rows.map((r) => r.sku)).size !== rows.length)
    throw new AppError("Hay códigos repetidos.");
  return transaction(async (tx) => {
    if (
      await tx.auditLog.findFirst({
        where: {
          companyId: ctx.companyId,
          action: "CATALOG_IMPORTED",
          metadata: { path: ["requestId"], equals: requestId },
        },
      })
    )
      return { count: rows.length };
    for (const row of rows) {
      const existing = await tx.product.findUnique({
        where: { companyId_sku: { companyId: ctx.companyId, sku: row.sku } },
      });
      // Imports preserve configured tax and active status. Explicit stock means an absolute count.
      await saveProductTx(
        tx,
        ctx,
        {
          ...row,
          taxId: existing?.taxId || null,
          active: existing?.active ?? true,
        },
        existing?.id,
      );
    }
    await audit(tx, ctx, "Company", ctx.companyId, "CATALOG_IMPORTED", {
      requestId,
      count: rows.length,
    });
    return { count: rows.length };
  });
}
