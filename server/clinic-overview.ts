import { db } from "./db";
import { AppError, type Context } from "./auth";
import { todayString } from "@/lib/utils";

export function monthRange(month = todayString().slice(0, 7)) {
  if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month))
    throw new AppError("Selecciona un mes válido.");
  const [year, number] = month.split("-").map(Number);
  return {
    month,
    from: new Date(Date.UTC(year, number - 1, 1, 6)),
    to: new Date(Date.UTC(year, number, 1, 6)),
    invoiceFrom: new Date(Date.UTC(year, number - 1, 1)),
    invoiceTo: new Date(Date.UTC(year, number, 1)),
  };
}

export async function clinicOverview(ctx: Context) {
  const period = monthRange();
  const validInvoice = {
    companyId: ctx.companyId,
    status: { notIn: ["VOID", "DRAFT"] as ("VOID" | "DRAFT")[] },
  };
  const [recent, monthly, performed, appointments, stock] = await Promise.all([
    db.invoiceItem.findMany({
      where: {
        companyId: ctx.companyId,
        sessionsTotal: { gt: 0 },
        invoice: validInvoice,
      },
      include: { product: true, invoice: { include: { customer: true } } },
      orderBy: { invoice: { createdAt: "desc" } },
      take: 8,
    }),
    db.invoiceItem.findMany({
      where: {
        companyId: ctx.companyId,
        sessionsTotal: { gt: 0 },
        invoice: {
          ...validInvoice,
          date: { gte: period.invoiceFrom, lt: period.invoiceTo },
        },
      },
      include: { product: true },
    }),
    db.auditLog.count({
      where: {
        companyId: ctx.companyId,
        action: "SESSION_COMPLETED",
        timestamp: { gte: period.from, lt: period.to },
      },
    }),
    db.invoice.findMany({
      where: { ...validInvoice, nextAppointment: { gte: new Date() } },
      include: { customer: true },
      orderBy: { nextAppointment: "asc" },
      take: 5,
    }),
    db.product.findMany({
      where: { companyId: ctx.companyId, type: "PRODUCT", active: true },
      select: { stock: true },
    }),
  ]);
  const count = (pattern: RegExp) =>
    monthly
      .filter((i) => pattern.test(i.product?.category || ""))
      .reduce(
        (n, i) =>
          n + (i.product?.pricingMode === "PER_UNIT" ? 1 : Number(i.quantity)),
        0,
      );
  return {
    recent,
    performed,
    appointments,
    aesthetic: count(/est[eé]tic/i),
    laser: count(/l[aá]ser/i),
    contracted: monthly.reduce((n, i) => n + i.sessionsTotal, 0),
    stock: stock.reduce((n, p) => n + p.stock, 0),
    outOfStock: stock.filter((p) => p.stock === 0).length,
  };
}
