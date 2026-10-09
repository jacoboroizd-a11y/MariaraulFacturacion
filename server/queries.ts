import { db } from "./db";
import { type Context, AppError } from "./auth";
import { invoiceStatus, decimal, convertCurrency, amount } from "@/lib/money";
import { todayString } from "@/lib/utils";
export const serialize = <T>(value: T) => JSON.parse(JSON.stringify(value));
export async function refreshStatuses(companyId: string) {
  const today = new Date(todayString());
  await db.invoice.updateMany({
    where: {
      companyId,
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      dueDate: { lt: today },
      balanceDue: { gt: 0 },
    },
    data: { status: "OVERDUE" },
  });
  await db.quote.updateMany({
    where: {
      companyId,
      status: { in: ["SENT", "ACCEPTED"] },
      dueDate: { lt: today },
    },
    data: { status: "EXPIRED" },
  });
}
export async function list(ctx: Context, kind: string) {
  await refreshStatuses(ctx.companyId);
  const where = { companyId: ctx.companyId };
  switch (kind) {
    case "customers":
      return db.customer.findMany({ where, orderBy: { createdAt: "desc" } });
    case "products":
      return db.product.findMany({
        where,
        include: { tax: true },
        orderBy: { name: "asc" },
      });
    case "taxes":
      return db.tax.findMany({ where, orderBy: { name: "asc" } });
    case "quotes":
      return db.quote.findMany({
        where,
        include: {
          customer: true,
          invoice: { select: { id: true, documentNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    case "invoices":
      return db.invoice.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      });
    case "payments":
      return db.payment.findMany({
        where: { ...where, deletedAt: null },
        include: { invoice: { include: { customer: true } }, receipt: true },
        orderBy: { paymentDate: "desc" },
      });
    case "receipts":
      return db.receipt.findMany({
        where,
        include: { payment: true, invoice: { include: { customer: true } } },
        orderBy: { createdAt: "desc" },
      });
    case "users":
      if (ctx.role !== "ADMIN") throw new AppError("Acceso restringido.", 403);
      return db.membership.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, active: true } },
        },
      });
    case "audit":
      if (ctx.role !== "ADMIN") throw new AppError("Acceso restringido.", 403);
      return db.auditLog.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: { timestamp: "desc" },
        take: 300,
      });
    default:
      throw new AppError("Módulo no encontrado.", 404);
  }
}
export async function detail(ctx: Context, kind: string, id: string) {
  await refreshStatuses(ctx.companyId);
  const where = { id, companyId: ctx.companyId };
  let data;
  if (kind === "customers")
    data = await db.customer.findFirst({
      where,
      include: {
        quotes: { orderBy: { date: "desc" } },
        invoices: {
          include: { payments: { where: { deletedAt: null } } },
          orderBy: { date: "desc" },
        },
      },
    });
  else if (kind === "products")
    data = await db.product.findFirst({ where, include: { tax: true } });
  else if (kind === "quotes")
    data = await db.quote.findFirst({
      where,
      include: {
        customer: true,
        items: { orderBy: { position: "asc" } },
        invoice: true,
      },
    });
  else if (kind === "invoices")
    data = await db.invoice.findFirst({
      where,
      include: {
        customer: true,
        items: { orderBy: { position: "asc" } },
        payments: {
          where: { deletedAt: null },
          include: { receipt: true },
          orderBy: { paymentDate: "desc" },
        },
        quote: true,
      },
    });
  else if (kind === "receipts")
    data = await db.receipt.findFirst({
      where,
      include: {
        payment: true,
        invoice: {
          include: { customer: true, items: { orderBy: { position: "asc" } } },
        },
      },
    });
  else throw new AppError("Módulo no encontrado.", 404);
  if (!data) throw new AppError("Registro no encontrado.", 404);
  return data;
}
export async function options(ctx: Context) {
  const [customers, products, taxes, company] = await Promise.all([
    db.customer.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { companyId: ctx.companyId, active: true },
      include: { tax: true },
      orderBy: { name: "asc" },
    }),
    db.tax.findMany({ where: { companyId: ctx.companyId, active: true } }),
    db.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      include: { settings: true },
    }),
  ]);
  return serialize({ customers, products, taxes, company });
}
export async function search(ctx: Context, q: string) {
  if (q.length < 2) return [];
  const base = { companyId: ctx.companyId };
  const contains = { contains: q.slice(0, 100), mode: "insensitive" as const };
  const [customers, products, invoices, quotes, receipts] = await Promise.all([
    db.customer.findMany({
      where: { ...base, OR: [{ name: contains }, { ruc: contains }] },
      take: 5,
    }),
    db.product.findMany({
      where: { ...base, OR: [{ name: contains }, { sku: contains }] },
      take: 5,
    }),
    db.invoice.findMany({
      where: { ...base, documentNumber: contains },
      take: 5,
    }),
    db.quote.findMany({
      where: { ...base, documentNumber: contains },
      take: 5,
    }),
    db.receipt.findMany({
      where: { ...base, documentNumber: contains },
      take: 5,
    }),
  ]);
  return [
    ...customers.map((x) => ({
      label: x.name,
      kind: "Cliente",
      href: `/customers/${x.id}`,
    })),
    ...products.map((x) => ({
      label: x.name,
      kind: "Producto",
      href: `/products/${x.id}`,
    })),
    ...invoices.map((x) => ({
      label: x.documentNumber,
      kind: "Factura",
      href: `/invoices/${x.id}`,
    })),
    ...quotes.map((x) => ({
      label: x.documentNumber,
      kind: "Cotización",
      href: `/quotes/${x.id}`,
    })),
    ...receipts.map((x) => ({
      label: x.documentNumber,
      kind: "Recibo",
      href: `/receipts/${x.id}`,
    })),
  ];
}
export async function analytics(ctx: Context, start?: string, end?: string) {
  await refreshStatuses(ctx.companyId);
  const today = todayString();
  const now = new Date(today + "T00:00:00Z");
  const from = start
    ? new Date(start + "T00:00:00Z")
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = end
    ? new Date(end + "T23:59:59.999Z")
    : new Date(now.getTime() + 86400000 - 1);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to)
    throw new AppError("Rango de fechas inválido.");
  const [invoices, payments, customers, company] = await Promise.all([
    db.invoice.findMany({
      where: { companyId: ctx.companyId, status: { notIn: ["VOID", "DRAFT"] } },
      include: { customer: true, items: true },
      orderBy: { date: "desc" },
    }),
    db.payment.findMany({
      where: { companyId: ctx.companyId, deletedAt: null },
      include: { invoice: { include: { customer: true, items: true } } },
    }),
    db.customer.count({ where: { companyId: ctx.companyId, active: true } }),
    db.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      include: { settings: true },
    }),
  ]);
  const currency = company.settings!.primaryCurrency;
  const nio = (v: string, c: string, r: string) =>
    decimal(convertCurrency(v, c, currency, r));
  const sumInvoices = (arr: typeof invoices, field: "total" | "balanceDue") =>
    amount(
      arr.reduce(
        (s, i) =>
          s.plus(
            nio(i[field].toString(), i.currency, i.exchangeRate.toString()),
          ),
        decimal(0),
      ),
    );
  const selected = invoices.filter((i) => i.date >= from && i.date <= to);
  const received = payments.filter(
    (p) => p.paymentDate >= from && p.paymentDate <= to,
  );
  const sumPayments = (arr: typeof payments) =>
    amount(
      arr.reduce(
        (s, p) =>
          s.plus(
            nio(
              p.amount.toString(),
              p.currency,
              p.invoice.exchangeRate.toString(),
            ),
          ),
        decimal(0),
      ),
    );
  const topCustomers = new Map<
    string,
    { name: string; total: ReturnType<typeof decimal> }
  >();
  const topProducts = new Map<
    string,
    {
      name: string;
      total: ReturnType<typeof decimal>;
      quantity: ReturnType<typeof decimal>;
    }
  >();
  for (const i of selected) {
    const c = topCustomers.get(i.customerId) || {
      name: i.customer.name,
      total: decimal(0),
    };
    c.total = c.total.plus(
      nio(i.total.toString(), i.currency, i.exchangeRate.toString()),
    );
    topCustomers.set(i.customerId, c);
    for (const item of i.items) {
      const key = item.productId || item.description;
      const p = topProducts.get(key) || {
        name: item.description,
        total: decimal(0),
        quantity: decimal(0),
      };
      p.total = p.total.plus(
        nio(item.total.toString(), i.currency, i.exchangeRate.toString()),
      );
      p.quantity = p.quantity.plus(item.quantity.toString());
      topProducts.set(key, p);
    }
  }
  const taxes = new Map<string, ReturnType<typeof decimal>>();
  // Tax collected is allocated proportionally to the received payments, not the issued total.
  for (const p of received)
    for (const i of p.invoice.items) {
      const key = `${i.taxRate.toString()}%`;
      const tax = decimal(i.tax.toString())
        .times(p.amount.toString())
        .div(p.invoice.total.toString());
      taxes.set(
        key,
        (taxes.get(key) || decimal(0)).plus(
          nio(tax.toString(), p.currency, p.invoice.exchangeRate.toString()),
        ),
      );
    }
  const chart = Array.from({ length: 30 }, (_, n) => {
    const date = new Date(now.getTime() - (29 - n) * 86400000);
    return {
      date: date.toISOString().slice(5, 10),
      total: Number(
        sumInvoices(
          invoices.filter(
            (i) =>
              i.date.toISOString().slice(0, 10) ===
              date.toISOString().slice(0, 10),
          ),
          "total",
        ),
      ),
    };
  });
  return serialize({
    currency,
    start: from.toISOString().slice(0, 10),
    end: to.toISOString().slice(0, 10),
    sales: sumInvoices(selected, "total"),
    collected: sumPayments(received),
    receivable: sumInvoices(
      invoices.filter((i) => i.balanceDue.gt(0)),
      "balanceDue",
    ),
    invoiceCount: selected.length,
    customerCount: customers,
    overdueCount: invoices.filter((i) => i.status === "OVERDUE").length,
    days: [7, 30, 90].map((days) => ({
      days,
      total: sumPayments(
        payments.filter(
          (p) =>
            p.paymentDate >= new Date(now.getTime() - (days - 1) * 86400000) &&
            p.paymentDate <= to,
        ),
      ),
    })),
    chart,
    recent: invoices.slice(0, 6),
    selected,
    received,
    receivables: invoices.filter((i) => i.balanceDue.gt(0)),
    overdue: invoices.filter((i) => i.status === "OVERDUE"),
    topCustomers: [...topCustomers.values()]
      .sort((a, b) => b.total.cmp(a.total))
      .map((x) => ({ ...x, total: amount(x.total) })),
    topProducts: [...topProducts.values()]
      .sort((a, b) => b.total.cmp(a.total))
      .map((x) => ({
        ...x,
        total: amount(x.total),
        quantity: x.quantity.toString(),
      })),
    taxes: [...taxes.entries()].map(([rate, total]) => ({
      rate,
      total: amount(total),
    })),
  });
}
export function displayInvoiceStatus(i: {
  status: string;
  total: string;
  amountPaid: string;
  dueDate: string | null;
}) {
  return invoiceStatus(
    i.total,
    i.amountPaid,
    i.dueDate ? new Date(i.dueDate) : null,
    i.status,
  );
}
