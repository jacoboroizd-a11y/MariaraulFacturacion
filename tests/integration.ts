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
import {
  createClinicSale,
  recordSession,
  changeAppointment,
  adjustStock,
} from "../server/clinic";
import { catalogFromCells, importCatalog } from "../server/catalog-import";
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
    stock: 100,
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
  const treatment = await saveProduct(ctx, {
    name: "Paquete facial",
    sku: "CLINIC-PACK",
    type: "SERVICE",
    sessions: 3,
    price: "900",
    currency: "NIO",
  });
  const cosmetic = await saveProduct(ctx, {
    name: "Crema",
    sku: "CLINIC-CREAM",
    stock: 10,
    type: "PRODUCT",
    price: "100",
    currency: "NIO",
  });
  const saleInput = {
    checkoutKey: randomUUID(),
    newCustomer: { name: "Cliente automático", phone: "88888888" },
    currency: "NIO",
    items: [
      { productId: treatment.id, quantity: 2 },
      { productId: cosmetic.id, quantity: 1 },
    ],
    paymentMode: "PARTIAL",
    amount: "500",
    method: "CASH",
    nextAppointment: "2099-02-01T10:30",
  };
  const sale = await createClinicSale(ctx, saleInput);
  check(sale.dueDate === null, "Nota de venta no tiene vencimiento");
  check(
    sale.total.toString() === "1900" &&
      sale.amountPaid.toString() === "500" &&
      sale.balanceDue.toString() === "1400",
    "Venta clínica y abono guardados juntos",
  );
  check(
    sale.nextAppointment?.toISOString() === "2099-02-01T16:30:00.000Z",
    "Cita usa hora de Nicaragua",
  );
  check(
    (await db.customer.findUniqueOrThrow({ where: { id: sale.customerId } }))
      .name === "Cliente automático",
    "Cliente se registra con la venta",
  );
  check(
    (await createClinicSale(ctx, saleInput)).id === sale.id,
    "Reintento no duplica venta ni cliente",
  );
  await rejected(
    () => createClinicSale(ctx, { ...saleInput, amount: "600" }),
    "Misma clave con otro contenido se rechaza",
  );
  const savedItems = await db.invoiceItem.findMany({
    where: { invoiceId: sale.id },
    orderBy: { position: "asc" },
  });
  check(
    savedItems[0].sessionsTotal === 6 && savedItems[1].sessionsTotal === 0,
    "Paquete multiplica sesiones; cosmético no crea sesiones",
  );
  const requestId = randomUUID();
  await recordSession(ctx, savedItems[0].id, { requestId });
  await recordSession(ctx, savedItems[0].id, { requestId });
  check(
    (
      await db.invoiceItem.findUniqueOrThrow({
        where: { id: savedItems[0].id },
      })
    ).sessionsUsed === 1,
    "Sesión repetida no se descuenta dos veces",
  );
  await rejected(
    () => recordSession(other, savedItems[0].id, { requestId: randomUUID() }),
    "Sesiones aisladas por empresa",
  );
  await rejected(
    () => recordSession(viewer, savedItems[0].id, { requestId: randomUUID() }),
    "Consulta no puede descontar sesiones",
  );
  await rejected(
    () => recordSession(ctx, savedItems[1].id, { requestId: randomUUID() }),
    "Cosmético no admite sesiones",
  );
  for (let n = 1; n < 6; n++)
    await recordSession(ctx, savedItems[0].id, { requestId: randomUUID() });
  await rejected(
    () => recordSession(ctx, savedItems[0].id, { requestId: randomUUID() }),
    "No se exceden sesiones contratadas",
  );
  await changeAppointment(ctx, sale.id, {
    nextAppointment: "2099-02-02T09:00",
  });
  check(
    (
      await db.invoice.findUniqueOrThrow({ where: { id: sale.id } })
    ).nextAppointment?.toISOString() === "2099-02-02T15:00:00.000Z",
    "Se puede reprogramar próxima cita",
  );
  await rejected(
    () => changeAppointment(other, sale.id, { nextAppointment: "" }),
    "Cita de otra empresa inaccesible",
  );
  await rejected(
    () =>
      changeAppointment(ctx, sale.id, { nextAppointment: "2099-02-30T09:00" }),
    "Cita rechaza fecha inexistente",
  );
  const customersBefore = await db.customer.count({
    where: { companyId: ctx.companyId },
  });
  const invoicesBefore = await db.invoice.count({
    where: { companyId: ctx.companyId },
  });
  await rejected(
    () =>
      createClinicSale(ctx, {
        ...saleInput,
        checkoutKey: randomUUID(),
        newCustomer: { name: "No debe quedar creado" },
        amount: "2000",
      }),
    "Abono excesivo revierte toda la venta",
  );
  check(
    (await db.customer.count({ where: { companyId: ctx.companyId } })) ===
      customersBefore &&
      (await db.invoice.count({ where: { companyId: ctx.companyId } })) ===
        invoicesBefore,
    "Rollback no deja cliente ni factura huérfanos",
  );
  await rejected(
    () => createClinicSale(viewer, { ...saleInput, checkoutKey: randomUUID() }),
    "Consulta no puede crear ventas",
  );
  await rejected(
    () =>
      createClinicSale(ctx, {
        ...saleInput,
        checkoutKey: randomUUID(),
        newCustomer: undefined,
        customerId: foreign.id,
      }),
    "Venta rechaza cliente de otra empresa",
  );
  const fullSale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "FULL",
    items: [{ productId: cosmetic.id, quantity: 1 }],
    nextAppointment: "",
  });
  check(
    fullSale.status === "PAID" && fullSale.balanceDue.toString() === "0",
    "Pago completo cancela factura",
  );
  const usdSale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "LATER",
    currency: "USD",
    items: [{ productId: treatment.id, quantity: 1 }],
  });
  check(
    usdSale.total.toString() === "24.66" &&
      usdSale.amountPaid.toString() === "0",
    "Precio se convierte desde catálogo; venta pendiente no crea pago",
  );
  const noPaySale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "LATER",
    items: [{ productId: treatment.id, quantity: 1 }],
  });
  const noPayItem = await db.invoiceItem.findFirstOrThrow({
    where: { invoiceId: noPaySale.id },
  });
  await recordSession(ctx, noPayItem.id, { requestId: randomUUID() });
  await rejected(
    () => documentAction(ctx, "invoices", noPaySale.id, "void"),
    "No se anula un tratamiento con sesiones usadas",
  );
  const clinicalPdf = await pdfDocument(
    serialize(await detail(ctx, "invoices", sale.id)),
    "invoices",
  );
  check(
    clinicalPdf.subarray(0, 4).toString() === "%PDF",
    "PDF clínico con cita y sesiones se genera",
  );
  const stockAfterSales = await db.product.findUniqueOrThrow({
    where: { id: cosmetic.id },
  });
  check(
    stockAfterSales.stock === 8,
    "Dos ventas descuentan inventario, reintento no descuenta otra vez",
  );
  const stockAdjustment = {
    requestId: randomUUID(),
    quantity: 5,
    reason: "Nueva mercancía",
  };
  await adjustStock(ctx, cosmetic.id, stockAdjustment);
  await adjustStock(ctx, cosmetic.id, stockAdjustment);
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 13,
    "Entrada de inventario idempotente",
  );
  await rejected(
    () =>
      adjustStock(viewer, cosmetic.id, {
        ...stockAdjustment,
        requestId: randomUUID(),
      }),
    "Consulta no modifica inventario",
  );
  await rejected(
    () =>
      adjustStock(other, cosmetic.id, {
        ...stockAdjustment,
        requestId: randomUUID(),
      }),
    "Inventario aislado por empresa",
  );
  await rejected(
    () =>
      adjustStock(ctx, cosmetic.id, {
        ...stockAdjustment,
        requestId: randomUUID(),
        quantity: -14,
      }),
    "Inventario no queda negativo",
  );
  await rejected(
    () =>
      adjustStock(ctx, treatment.id, {
        ...stockAdjustment,
        requestId: randomUUID(),
      }),
    "Tratamiento no consume inventario",
  );
  await rejected(
    () =>
      createClinicSale(ctx, {
        ...saleInput,
        checkoutKey: randomUUID(),
        items: [{ productId: cosmetic.id, quantity: 14 }],
      }),
    "Venta sin stock se rechaza",
  );
  const stockSale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "LATER",
    items: [{ productId: cosmetic.id, quantity: 3 }],
  });
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 10,
    "Venta pendiente también descuenta mercancía entregada",
  );
  await documentAction(ctx, "invoices", stockSale.id, "void");
  await documentAction(ctx, "invoices", stockSale.id, "void");
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 13,
    "Anular restaura stock una sola vez",
  );
  const stockDraft = await saveDocument(ctx, "invoices", {
    ...data,
    status: "DRAFT",
    items: [
      {
        productId: cosmetic.id,
        description: cosmetic.name,
        quantity: "2",
        unitPrice: "100",
        taxRate: "0",
        discountRate: "0",
      },
    ],
  });
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 13,
    "Borrador no consume inventario",
  );
  await documentAction(ctx, "invoices", stockDraft.id, "issue");
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 11,
    "Emitir borrador consume inventario",
  );
  const limited = await saveProduct(ctx, {
    name: "Última unidad",
    sku: "CLINIC-LAST",
    type: "PRODUCT",
    price: "10",
    stock: 1,
  });
  const simultaneous = await Promise.allSettled(
    [1, 2].map(() =>
      createClinicSale(ctx, {
        ...saleInput,
        checkoutKey: randomUUID(),
        newCustomer: undefined,
        customerId: customer.id,
        paymentMode: "FULL",
        items: [{ productId: limited.id, quantity: 1 }],
      }),
    ),
  );
  check(
    simultaneous.filter((r) => r.status === "fulfilled").length === 1 &&
      (await db.product.findUniqueOrThrow({ where: { id: limited.id } }))
        .stock === 0,
    "Ventas concurrentes no sobrevendan la última unidad",
  );
  const botox = await saveProduct(ctx, {
    name: "Tratamiento por unidad",
    sku: "CLINIC-UNIT",
    type: "SERVICE",
    price: "200",
    pricingMode: "PER_UNIT",
    unit: "unidades",
    sessions: 1,
  });
  const unitSale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "LATER",
    items: [{ productId: botox.id, quantity: 20 }],
  });
  check(
    unitSale.total.toString() === "4000",
    "Tratamiento calcula 20 unidades por tarifa fija de 200",
  );
  check(
    (
      await db.invoiceItem.findFirstOrThrow({
        where: { invoiceId: unitSale.id },
      })
    ).sessionsTotal === 1,
    "Unidades aplicadas no crean 20 sesiones",
  );
  const paymentRequest = {
    requestId: randomUUID(),
    invoiceId: unitSale.id,
    currency: "NIO",
    amount: "1000",
    method: "CARD",
    paymentDate: todayString(),
  };
  const firstPay = await createPayment(ctx, paymentRequest);
  const againPay = await createPayment(ctx, paymentRequest);
  check(
    firstPay.id === againPay.id &&
      (
        await db.invoice.findUniqueOrThrow({ where: { id: unitSale.id } })
      ).amountPaid.toString() === "1000",
    "Reintentar pago en factura no duplica abono",
  );
  await rejected(
    () => createPayment(ctx, { ...paymentRequest, amount: "1100" }),
    "Clave de pago no se reutiliza con otro monto",
  );
  const catalog = catalogFromCells([
    ["nombre", "tipo", "precio", "cobro", "sesiones", "existencias", "codigo"],
    [
      "Tratamiento importado",
      "tratamiento",
      "120",
      "unidad",
      "1",
      "",
      "IMPORT-UNIT",
    ],
    [
      "Cosmético importado",
      "cosmetico",
      "50",
      "fijo",
      "1",
      "8",
      "IMPORT-STOCK",
    ],
  ]);
  const importRequest = { requestId: randomUUID(), rows: catalog.rows };
  await importCatalog(ctx, importRequest);
  await importCatalog(ctx, importRequest);
  check(
    (await db.product.count({
      where: {
        companyId: ctx.companyId,
        sku: { in: ["IMPORT-UNIT", "IMPORT-STOCK"] },
      },
    })) === 2,
    "Importación guarda catálogo sin duplicar reintentos",
  );
  const imported = await db.product.findUniqueOrThrow({
    where: { companyId_sku: { companyId: ctx.companyId, sku: "IMPORT-STOCK" } },
  });
  check(imported.stock === 8, "Importación establece inventario indicado");
  const updatedImport = { ...catalog.rows[1], price: "60", stock: undefined };
  await importCatalog(ctx, { requestId: randomUUID(), rows: [updatedImport] });
  check(
    (await db.product.findUniqueOrThrow({ where: { id: imported.id } }))
      .stock === 8,
    "Importar sin existencias preserva stock actual",
  );
  await rejected(
    () => importCatalog(viewer, importRequest),
    "Consulta no importa catálogo",
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
