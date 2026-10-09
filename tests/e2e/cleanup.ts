import { db } from "../../server/db";
export async function cleanupCustomer(name: string) {
  const customer = await db.customer.findFirst({
    where: { name, companyId: "demo-nicaragua" },
  });
  if (!customer) return;
  await db.$transaction(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { customerId: customer.id },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);
    const quotes = await tx.quote.findMany({
      where: { customerId: customer.id },
      select: { id: true },
    });
    const quoteIds = quotes.map((q) => q.id);
    const payments = await tx.payment.findMany({
      where: { invoiceId: { in: invoiceIds } },
      select: { id: true },
    });
    const productIds = (
      await tx.product.findMany({
        where: { companyId: "demo-nicaragua", sku: customer.ruc },
        select: { id: true },
      })
    ).map((p) => p.id);
    await tx.auditLog.deleteMany({
      where: {
        companyId: "demo-nicaragua",
        entityId: {
          in: [
            customer.id,
            ...invoiceIds,
            ...quoteIds,
            ...payments.map((p) => p.id),
            ...productIds,
          ],
        },
      },
    });
    await tx.receipt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoiceItem.deleteMany({
      where: { invoiceId: { in: invoiceIds } },
    });
    await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await tx.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.customer.delete({ where: { id: customer.id } });
  });
}
