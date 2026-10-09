import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import {
  saveCustomer,
  saveProduct,
  saveTax,
  saveDocument,
  convertQuote,
  createPayment,
  deletePayment,
  documentAction,
  saveSettings,
} from "../server/domain";
import { detail, analytics, serialize } from "../server/queries";
import { pdfDocument } from "../server/pdf";
import type { Context } from "../server/auth";
import { todayString } from "../lib/utils";
import type { Row } from "../types/view";
const ids: string[] = [];
let userId: string;
let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks++;
  console.log("PASS " + label);
}
async function rejected(fn: () => Promise<unknown>, label: string) {
  await assert.rejects(fn);
  checks++;
  console.log("PASS " + label);
}
async function main() {
  const user = await db.user.create({
    data: {
      email: `test-${randomUUID()}@example.invalid`,
      name: "Test",
      passwordHash: "not-a-login-hash",
    },
  });
  userId = user.id;
  for (let i = 0; i < 2; i++) {
    const company = await db.company.create({
      data: {
        name: "Test company",
        settings: { create: { exchangeRate: "36.5" } },
        memberships: { create: { userId: user.id, role: "ADMIN" } },
      },
    });
    ids.push(company.id);
  }
  const ctx: Context = {
    userId,
    companyId: ids[0],
    role: "ADMIN",
    name: "Test",
    companyName: "Test",
  };
  const other = { ...ctx, companyId: ids[1] };
  const viewer = { ...ctx, role: "VIEWER" as const };
  const billing = { ...ctx, role: "BILLING" as const };
  const customer = await saveCustomer(ctx, { name: "Cliente de prueba" });
  const foreign = await saveCustomer(other, {
    name: "Cliente de otra empresa",
  });
  const tax = await saveTax(ctx, { name: "IVA", rate: "15" });
  const product = await saveProduct(ctx, {
    name: "Servicio",
    sku: "TEST",
    price: "100.00",
    taxId: tax.id,
  });
  const data = {
    customerId: customer.id,
    date: todayString(),
    dueDate: "2099-01-01",
    currency: "NIO",
    exchangeRate: "36.5",
    discountRate: "0",
    items: [
      {
        description: "Servicio",
        productId: product.id,
        quantity: "1",
        unitPrice: "100.00",
        discountRate: "0",
        taxRate: "15",
      },
    ],
    status: "SENT",
  };
  await rejected(
    () => saveDocument(ctx, "quotes", { ...data, customerId: foreign.id }),
    "Aislamiento de cliente en escritura",
  );
  await rejected(
    () => detail(other, "customers", customer.id),
    "Aislamiento de cliente en lectura",
  );
  await rejected(
    () => saveCustomer(viewer, { name: "Forbidden" }),
    "Viewer no puede escribir",
  );
  await rejected(
    () => saveTax(billing, { name: "Forbidden", rate: "15" }),
    "Billing no puede modificar configuración",
  );
  const quote = await saveDocument(ctx, "quotes", data);
  const [a, b] = await Promise.all([
    convertQuote(ctx, quote.id),
    convertQuote(ctx, quote.id),
  ]);
  check(a.id === b.id, "Conversión concurrente idempotente");
  check(a.total.toString() === "115", "Conversión conserva total");
  check(
    a.exchangeRate.toString() === "36.5",
    "Conversión conserva TC histórico",
  );
  await saveTax(ctx, { name: "IVA actualizado", rate: "20" }, tax.id);
  const item = await db.invoiceItem.findFirstOrThrow({
    where: { invoiceId: a.id },
  });
  check(
    item.taxRate.toString() === "15",
    "Cambio de impuesto preserva tasa histórica",
  );
  await rejected(
    () => convertQuote(other, quote.id),
    "No convertir cotización ajena",
  );
  await rejected(
    () => saveDocument(ctx, "invoices", { ...data, status: "PENDING" }, a.id),
    "Factura emitida es inmutable",
  );
  const payment = {
    invoiceId: a.id,
    currency: "NIO",
    paymentDate: todayString(),
    method: "CASH",
    amount: "50.00",
  };
  const p = await createPayment(ctx, payment);
  let current = await db.invoice.findUniqueOrThrow({ where: { id: a.id } });
  check(
    current.amountPaid.toString() === "50" &&
      current.balanceDue.toString() === "65" &&
      current.status === "PARTIALLY_PAID",
    "Pago parcial, saldo y estado",
  );
  check(
    p.receipt.balanceRemaining.toString() === "65",
    "Recibo conserva saldo posterior",
  );
  await rejected(
    () => createPayment(ctx, { ...payment, amount: "66.00" }),
    "Bloqueo de sobrepago",
  );
  await rejected(() => createPayment(other, payment), "No pagar factura ajena");
  await rejected(
    () => createPayment(ctx, { ...payment, currency: "USD" }),
    "No mezclar moneda del pago",
  );
  const concurrent = await Promise.allSettled([
    createPayment(ctx, { ...payment, amount: "65.00" }),
    createPayment(ctx, { ...payment, amount: "65.00" }),
  ]);
  check(
    concurrent.filter((r) => r.status === "fulfilled").length === 1,
    "Solo un pago concurrente de saldo es aceptado",
  );
  current = await db.invoice.findUniqueOrThrow({ where: { id: a.id } });
  check(
    current.status === "PAID" && current.balanceDue.isZero(),
    "Pago final deja PAID y saldo cero",
  );
  await deletePayment(ctx, p.id);
  current = await db.invoice.findUniqueOrThrow({ where: { id: a.id } });
  check(
    current.amountPaid.toString() === "65" &&
      current.balanceDue.toString() === "50",
    "Eliminar pago recalcula saldo",
  );
  check(
    (await db.receipt.findUniqueOrThrow({ where: { id: p.receipt.id } }))
      .voidedAt,
    "Recibo eliminado queda anulado",
  );
  await rejected(
    () => deletePayment(ctx, p.id),
    "No eliminar dos veces el mismo pago",
  );
  await rejected(
    () => documentAction(ctx, "invoices", a.id, "void"),
    "No anular factura con pagos",
  );
  const fresh = await saveDocument(ctx, "invoices", {
    ...data,
    status: "DRAFT",
  });
  await rejected(
    () => createPayment(ctx, { ...payment, invoiceId: fresh.id }),
    "Borrador no acepta pagos",
  );
  await documentAction(ctx, "invoices", fresh.id, "issue");
  await documentAction(ctx, "invoices", fresh.id, "void");
  await rejected(
    () => createPayment(ctx, { ...payment, invoiceId: fresh.id }),
    "VOID no acepta pagos",
  );
  const invoices = await Promise.all(
    Array.from({ length: 8 }, () =>
      saveDocument(ctx, "invoices", { ...data, status: "PENDING" }),
    ),
  );
  check(
    new Set(invoices.map((i) => i.documentNumber)).size === 8,
    "Secuencias concurrentes sin duplicados",
  );
  for (const kind of ["quotes", "invoices", "receipts"]) {
    const id =
      kind === "quotes" ? quote.id : kind === "invoices" ? a.id : p.receipt.id;
    const row: Row = serialize(await detail(ctx, kind, id));
    const buffer = await pdfDocument(row, kind);
    check(
      buffer.subarray(0, 4).toString() === "%PDF" && buffer.length > 1000,
      `PDF real ${kind}`,
    );
  }
  const stats = await analytics(ctx);
  check(
    stats.invoiceCount === 9,
    "Dashboard consulta facturas emitidas y excluye anuladas",
  );
  check(stats.collected === "65.00", "Reportes reflejan eliminación de pago");
  check(
    stats.taxes[0].total === "8.48",
    "Impuestos cobrados proporcionales al pago",
  );
  const events = await db.auditLog.findMany({
    where: { companyId: ctx.companyId },
  });
  check(
    events.some((e) => e.action === "QUOTE_CONVERTED") &&
      events.some((e) => e.action === "PAYMENT_DELETED"),
    "Auditoría de conversión y pagos",
  );
  const settings = await db.companySettings.findUniqueOrThrow({
    where: { companyId: ctx.companyId },
  });
  await rejected(
    () =>
      saveSettings(ctx, {
        name: "Test",
        primaryCurrency: "NIO",
        secondaryCurrency: "USD",
        exchangeRate: "36.5",
        invoicePrefix: "FAC-",
        quotePrefix: "COT-",
        receiptPrefix: "REC-",
        nextInvoice: 1,
        nextQuote: settings.nextQuote,
        nextReceipt: settings.nextReceipt,
        dateFormat: "dd/MM/yyyy",
      }),
    "La secuencia no retrocede",
  );
  console.log(`\n${checks} comprobaciones de integración pasaron.`);
}
async function cleanup() {
  for (const companyId of ids) {
    await db.auditLog.deleteMany({ where: { companyId } });
    await db.receipt.deleteMany({ where: { companyId } });
    await db.payment.deleteMany({ where: { companyId } });
    await db.invoiceItem.deleteMany({ where: { companyId } });
    await db.invoice.deleteMany({ where: { companyId } });
    await db.quoteItem.deleteMany({ where: { companyId } });
    await db.quote.deleteMany({ where: { companyId } });
    await db.product.deleteMany({ where: { companyId } });
    await db.tax.deleteMany({ where: { companyId } });
    await db.customer.deleteMany({ where: { companyId } });
    await db.company.delete({ where: { id: companyId } });
  }
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
