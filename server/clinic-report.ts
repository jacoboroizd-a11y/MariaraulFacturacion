import ExcelJS from "exceljs";
import { db } from "./db";
import type { Context } from "./auth";
import { monthRange } from "./clinic-overview";
import { dateLabel } from "@/lib/utils";

export async function clinicReport(ctx: Context, month: string) {
  const range = monthRange(month);
  const [events, invoiced] = await Promise.all([
    db.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        action: "SESSION_COMPLETED",
        timestamp: { gte: range.from, lt: range.to },
      },
      orderBy: { timestamp: "asc" },
    }),
    db.invoiceItem.findMany({
      where: {
        companyId: ctx.companyId,
        sessionsTotal: { gt: 0 },
        invoice: {
          companyId: ctx.companyId,
          status: { notIn: ["VOID", "DRAFT"] },
          date: { gte: range.invoiceFrom, lt: range.invoiceTo },
        },
      },
      include: { product: true, invoice: { include: { customer: true } } },
      orderBy: { invoice: { createdAt: "asc" } },
    }),
  ]);
  const items = await db.invoiceItem.findMany({
    where: {
      companyId: ctx.companyId,
      id: { in: events.map((e) => e.entityId) },
    },
    include: { product: true, invoice: { include: { customer: true } } },
  });
  const book = new ExcelJS.Workbook();
  book.creator = "Mariaraul";
  const formatDate = (date: Date) =>
    date.toLocaleDateString("es-NI", { timeZone: "America/Managua" });
  const formatTime = (date: Date) =>
    date.toLocaleTimeString("es-NI", {
      timeZone: "America/Managua",
      hour12: false,
    });
  const performed = book.addWorksheet("Sesiones realizadas");
  performed.addRow([
    "Fecha",
    "Hora (Nicaragua)",
    "Paciente",
    "Tratamiento",
    "Categoría",
    "SKU",
    "Sesión",
    "Factura",
  ]);
  for (const event of events) {
    const item = items.find((i) => i.id === event.entityId);
    if (!item) continue;
    const meta = event.metadata as Record<string, unknown>;
    performed.addRow([
      formatDate(event.timestamp),
      formatTime(event.timestamp),
      item.invoice.customer.name,
      item.description,
      item.product?.category || "Sin categoría",
      item.product?.sku || "",
      Number(meta.session || 0),
      item.invoice.documentNumber,
    ]);
  }
  const billing = book.addWorksheet("Tratamientos facturados");
  billing.addRow([
    "Fecha factura",
    "Hora de registro (Nicaragua)",
    "Paciente",
    "Tratamiento",
    "Categoría",
    "SKU",
    "Cantidad / unidades",
    "Sesiones incluidas",
    "Sesiones utilizadas actuales",
    "Precio unitario",
    "Total línea",
    "Moneda",
    "Factura",
  ]);
  for (const item of invoiced)
    billing.addRow([
      dateLabel(item.invoice.date.toISOString()),
      formatTime(item.invoice.createdAt),
      item.invoice.customer.name,
      item.description,
      item.product?.category || "Sin categoría",
      item.product?.sku || "",
      Number(item.quantity),
      item.sessionsTotal,
      item.sessionsUsed,
      Number(item.unitPrice),
      Number(item.total),
      item.invoice.currency,
      item.invoice.documentNumber,
    ]);
  const guide = book.addWorksheet("Información");
  guide.addRows([
    ["Periodo", month],
    ["Zona horaria", "America/Managua (UTC-6)"],
    [
      "Sesiones realizadas",
      "Fecha y hora de cada sesión marcada como realizada en Sesiones y citas. Comprar un paquete no registra una sesión como realizada.",
    ],
    [
      "Tratamientos facturados",
      "Fecha de factura dentro del mes seleccionado. La hora es la de creación del comprobante, no la hora del tratamiento. Las sesiones utilizadas reflejan el estado actual.",
    ],
    [
      "Categorías",
      "Categoría actual del catálogo: Estético, Láser o la categoría que hayas definido.",
    ],
    [
      "Sin registros",
      "Si una hoja solo tiene encabezados, no hay actividad registrada en el periodo.",
    ],
  ]);
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF047857" },
    };
    sheet.columns.forEach((c) => {
      c.width = 25;
    });
    if (sheet !== guide)
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount },
      };
  }
  guide.getColumn(2).width = 100;
  guide.getColumn(2).alignment = { wrapText: true };
  return new Uint8Array(await book.xlsx.writeBuffer());
}
