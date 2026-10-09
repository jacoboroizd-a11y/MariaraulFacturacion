import { enqueueReports, deliverReports } from "../server/report-delivery";
import { mock } from "node:test";
import { openCash, autoCloseCash, cashState } from "../server/cash-register";
import { recordCashMovement } from "../server/cash-movements";
import { recordAdvance } from "../server/advances";
import { importClients } from "../server/client-import";
import {
  financialReport,
  financialExcel,
  financialPDF,
} from "../server/financial-report";
import { saveAppointment } from "../server/appointments";
import { submitCashClose, reviewCashClose } from "../server/cash-close";
import "dotenv/config";
import ExcelJS from "exceljs";
import { clinicReport } from "../server/clinic-report";
import {
  saveGoogleCalendar,
  googleCalendarEvents,
} from "../server/google-calendar";
import { monthRange } from "../server/clinic-overview";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import {
  createUser,
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
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-09T16:00:00Z") });
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
  await rejected(
    () =>
      openCash(ctx, { NIO: "50", USD: "0" }, new Date("2026-10-09T13:59:00Z")),
    "Antes de las 08:00 no abre caja",
  );
  await openCash(ctx, { NIO: "50", USD: "0" });
  await openCash(other, { NIO: "50", USD: "0" });
  const accountant = { ...ctx, role: "ACCOUNTANT" as const };
  const staff = await createUser(ctx, {
    name: "Recepción",
    username: "recepcion-" + randomUUID().slice(0, 8),
    password: "824196",
    role: "BILLING",
  });
  assert.ok(staff.username);
  assert.equal(staff.email, null);
  const staffRecord = await db.user.findUniqueOrThrow({
    where: { id: staff.id },
  });
  assert.notEqual(staffRecord.passwordHash, "824196");
  await assert.rejects(
    () => analytics(billing),
    (e) => e instanceof Error && "status" in e && e.status === 403,
  );
  await assert.rejects(
    () => clinicReport(viewer, "2026-10"),
    (e) => e instanceof Error && "status" in e && e.status === 403,
  );
  await db.membership.deleteMany({ where: { userId: staff.id } });
  await db.auditLog.deleteMany({ where: { entityId: staff.id } });
  await db.user.delete({ where: { id: staff.id } });
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
  await rejected(
    () => saveGoogleCalendar(viewer, { url: "" }),
    "Consulta no modifica conexión de calendario",
  );
  await rejected(
    () => saveGoogleCalendar({ ...ctx, role: "BILLING" }, { url: "" }),
    "Solo administrador conecta Google Calendar",
  );
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:clinic-test\r\nDTSTART:20261009T160000Z\r\nDTEND:20261009T170000Z\r\nSUMMARY:Cita de prueba\r\nEND:VEVENT\r\nEND:VCALENDAR",
      )) as typeof fetch;
    const feed =
      "https://calendar.google.com/calendar/ical/test%40example.invalid/private-test123/basic.ics";
    await saveGoogleCalendar(ctx, { url: feed });
    const stored = await db.calendarConnection.findUniqueOrThrow({
      where: { companyId: ctx.companyId },
    });
    check(
      !stored.encryptedUrl.includes("calendar.google.com"),
      "Dirección del calendario se guarda cifrada",
    );
    const calendar = await googleCalendarEvents(ctx, "2026-10");
    check(
      calendar.connected && calendar.events[0].title === "Cita de prueba",
      "Calendario conectado muestra sus citas",
    );
    check(
      !(await googleCalendarEvents(other, "2026-10")).connected,
      "Conexiones de calendario aisladas por empresa",
    );
    const log = await db.auditLog.findFirstOrThrow({
      where: { companyId: ctx.companyId, action: "GOOGLE_CALENDAR_CONNECTED" },
    });
    check(
      !JSON.stringify(log).includes(feed),
      "Auditoría no expone el enlace privado",
    );
    await saveGoogleCalendar(ctx, { url: "" });
    check(
      !(await googleCalendarEvents(ctx, "2026-10")).connected,
      "Desconectar elimina la conexión sin modificar citas locales",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  const reportBook = new ExcelJS.Workbook();
  await reportBook.xlsx.load(
    Buffer.from(await clinicReport(ctx, todayString().slice(0, 7))) as never,
  );
  const sessionRows = reportBook.getWorksheet("Sesiones realizadas")!;
  check(
    sessionRows.rowCount === 2 &&
      sessionRows.getCell("C2").text === "Cliente automático" &&
      sessionRows.getCell("G2").value === 1,
    "Reporte mensual incluye paciente y sesión realizada sin duplicar reintentos",
  );
  const otherBook = new ExcelJS.Workbook();
  await otherBook.xlsx.load(
    Buffer.from(await clinicReport(other, todayString().slice(0, 7))) as never,
  );
  check(
    !otherBook
      .getWorksheet("Sesiones realizadas")!
      .getColumn(3)
      .values.includes("Cliente automático"),
    "Reporte de tratamientos aislado por empresa",
  );
  const historicalBook = new ExcelJS.Workbook();
  await historicalBook.xlsx.load(
    Buffer.from(await clinicReport(ctx, "2000-01")) as never,
  );
  check(
    historicalBook.getWorksheet("Sesiones realizadas")!.rowCount === 1,
    "Reporte respeta el mes seleccionado",
  );
  await rejected(
    () => clinicReport(ctx, "2026-13"),
    "Reporte rechaza mes inválido",
  );
  check(
    monthRange("2026-10").from.toISOString() === "2026-10-01T06:00:00.000Z",
    "Reporte aplica límite mensual de Nicaragua",
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
    paymentMode: "FULL",
    currency: "USD",
    items: [{ productId: treatment.id, quantity: 1 }],
  });
  check(
    usdSale.total.toString() === "24.66" &&
      usdSale.amountPaid.toString() === "24.66",
    "Precio se convierte desde catálogo; el pago completo se registra",
  );
  const noPaySale = await createClinicSale(ctx, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    paymentMode: "FULL",
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
    paymentMode: "FULL",
    items: [{ productId: cosmetic.id, quantity: 3 }],
  });
  check(
    (await db.product.findUniqueOrThrow({ where: { id: cosmetic.id } }))
      .stock === 10,
    "Venta pendiente también descuenta mercancía entregada",
  );
  for (const payment of await db.payment.findMany({
    where: { invoiceId: stockSale.id, deletedAt: null },
  }))
    await deletePayment(ctx, payment.id);
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
    paymentMode: "PARTIAL",
    amount: "500",
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
      ).amountPaid.toString() === "1500",
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
  const clientsRequest = {
    requestId: randomUUID(),
    rows: [
      {
        name: "Paciente Excel",
        phone: "+50588881111",
        email: "excel@example.invalid",
      },
      { name: "Duplicado", phone: "+50588881111", email: "" },
    ],
  };
  const importedClients = (await importClients(ctx, clientsRequest)) as {
    added: number;
    skipped: number;
  };
  check(
    importedClients.added === 1 && importedClients.skipped === 1,
    "Clientes importados sin duplicar teléfono",
  );
  await rejected(
    () => importClients(billing, clientsRequest),
    "Personal de facturación no importa clientes",
  );
  const deposit = await recordAdvance(billing, {
    requestId: randomUUID(),
    customerId: customer.id,
    amount: "10",
    currency: "USD",
    method: "CASH",
  });
  const depositSale = await createClinicSale(billing, {
    ...saleInput,
    checkoutKey: randomUUID(),
    newCustomer: undefined,
    customerId: customer.id,
    items: [{ productId: treatment.id, quantity: 1 }],
    paymentMode: "FULL",
    advanceIds: [deposit.id],
    currency: "USD",
  });
  check(
    depositSale.total.toFixed(2) === "24.66" &&
      depositSale.amountPaid.toFixed(2) === "24.66",
    "Adelanto de US$10 mantiene precio y cancela saldo restante",
  );
  const depositPayments = await db.payment.findMany({
    where: { invoiceId: depositSale.id },
  });
  check(
    depositPayments.some(
      (p) => p.advanceId === deposit.id && p.amount.toFixed(2) === "10.00",
    ) &&
      depositPayments.some(
        (p) => !p.advanceId && p.amount.toFixed(2) === "14.66",
      ),
    "Adelanto aplicado separado del cobro nuevo",
  );
  await rejected(
    () =>
      createClinicSale(billing, {
        ...saleInput,
        checkoutKey: randomUUID(),
        newCustomer: undefined,
        customerId: customer.id,
        advanceIds: [deposit.id],
        paymentMode: "FULL",
      }),
    "No se aplica el mismo adelanto dos veces",
  );
  await rejected(
    () => createClinicSale(accountant, saleInput),
    "Contadora no factura",
  );
  await rejected(
    () =>
      saveProduct(billing, { name: "No permitido", sku: "DENY", price: "1" }),
    "Personal no modifica inventario",
  );
  const appointmentRequest = {
    requestId: randomUUID(),
    title: "Paciente · Láser",
    customerId: customer.id,
    start: "2026-10-12T09:00",
    end: "2026-10-12T10:00",
  };
  const [appointmentA, appointmentB] = await Promise.all([
    saveAppointment(billing, appointmentRequest),
    saveAppointment(billing, appointmentRequest),
  ]);
  check(appointmentA.id === appointmentB.id, "Cita idempotente no se duplica");
  await saveAppointment(
    billing,
    {
      ...appointmentRequest,
      start: "2026-10-12T11:00",
      end: "2026-10-12T12:00",
      version: 1,
    },
    appointmentA.id,
  );
  await rejected(
    () =>
      saveAppointment(
        billing,
        { ...appointmentRequest, version: 1 },
        appointmentA.id,
      ),
    "Edición desactualizada de cita no sobrescribe otra",
  );
  const report = await financialReport(accountant, "DAILY", todayString());
  const financeBook = new ExcelJS.Workbook();
  await financeBook.xlsx.load(
    (await financialExcel(report)) as unknown as ExcelJS.Buffer,
  );
  check(
    financeBook.worksheets.some((s) => s.name === "Cobros y adelantos"),
    "Contadora descarga reporte detallado",
  );
  check(
    (await financialPDF(report)).subarray(0, 4).toString() === "%PDF",
    "Reporte PDF Carta se genera",
  );
  check(
    report.received["USD:CASH"] === "49.32",
    "Reporte cuenta adelantos al recibirlos sin duplicar su aplicación",
  );
  await rejected(
    () => financialReport(billing, "DAILY", todayString()),
    "Personal no consulta reportes administrativos",
  );
  const expense = {
    requestId: randomUUID(),
    amount: "20",
    currency: "NIO",
    reason: "Insumos",
    purpose: "Compra de material de limpieza",
    recipient: "Proveedor",
  };
  const [expenseA, expenseB] = await Promise.all([
    recordCashMovement(billing, expense),
    recordCashMovement(billing, expense),
  ]);
  check(
    expenseA.id === expenseB.id,
    "Salida de efectivo concurrente no se duplica",
  );
  await rejected(
    () =>
      recordCashMovement(billing, {
        ...expense,
        requestId: randomUUID(),
        amount: "999999999",
      }),
    "Salida no supera efectivo disponible",
  );
  const cashPayments = await db.payment.findMany({
    where: {
      companyId: ctx.companyId,
      deletedAt: null,
      method: "CASH",
      currency: "NIO",
      paymentDate: new Date(todayString() + "T00:00:00Z"),
      invoice: { status: { notIn: ["VOID", "DRAFT"] } },
    },
  });
  const cashReceived = cashPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const closeInput = {
    requestId: randomUUID(),
    day: todayString(),
    NIO: { opening: "50", out: "20", counted: (cashReceived + 30).toFixed(2) },
    USD: { opening: "0", out: "0", counted: "0" },
    notes: "Caja verificada",
  };
  const [closeA, closeB] = await Promise.all([
    submitCashClose(billing, closeInput),
    submitCashClose(billing, closeInput),
  ]);
  check(closeA.id === closeB.id, "Cierre concurrente es idempotente");
  const cashMeta = closeA.metadata as {
    NIO: { difference: string; received: string; expected: string };
  };
  check(
    cashMeta.NIO.difference === "0.00" &&
      Number(cashMeta.NIO.expected) === cashReceived + 30,
    "Cierre concilia fondo, efectivo del día y salidas",
  );
  await rejected(
    () =>
      submitCashClose(billing, {
        ...closeInput,
        NIO: { ...closeInput.NIO, counted: "0" },
      }),
    "Reintento de cierre no cambia el efectivo contado",
  );
  await rejected(
    () => submitCashClose(billing, { ...closeInput, requestId: randomUUID() }),
    "No duplica el cierre del día",
  );
  await rejected(
    () => reviewCashClose(billing, { reviewId: closeA.id, status: "APPROVED" }),
    "Facturación no revisa cierres",
  );
  await rejected(
    () => reviewCashClose(other, { reviewId: closeA.id, status: "APPROVED" }),
    "Revisión aislada por empresa",
  );
  const approval = await reviewCashClose(ctx, {
    reviewId: closeA.id,
    status: "APPROVED",
  });
  check(approval.reviewStatus === "APPROVED", "Administrador aprueba cierre");
  const originalKey = process.env.RESEND_API_KEY,
    originalFrom = process.env.REPORTS_FROM,
    originalMailFetch = globalThis.fetch;
  let emailCalls = 0;
  const bodies: string[] = [];
  try {
    process.env.RESEND_API_KEY = "test-only-not-a-provider-key";
    process.env.REPORTS_FROM = "Clinica <reportes@example.invalid>";
    globalThis.fetch = (async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      emailCalls++;
      bodies.push(String(init?.body));
      if (emailCalls === 1) throw Error("Timeout simulado");
      return Response.json({ id: "email-prueba" });
    }) as typeof fetch;
    await enqueueReports(ctx.companyId);
    await deliverReports(ctx.companyId);
    await deliverReports(ctx.companyId);
    await deliverReports(ctx.companyId);
    check(
      emailCalls === 2 && bodies[0] === bodies[1],
      "Correo reintenta payload idéntico y no duplica envíos confirmados",
    );
    const mail = JSON.parse(bodies[0]);
    check(
      mail.to[0] === "info@dramariaraul.com" && mail.attachments.length === 2,
      "Correo diario adjunta PDF y Excel al destinatario solicitado",
    );
  } finally {
    globalThis.fetch = originalMailFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.REPORTS_FROM;
    else process.env.REPORTS_FROM = originalFrom;
  }
  await rejected(
    () => openCash(billing, { NIO: "50", USD: "0" }),
    "No reabre después del cierre manual",
  );
  await rejected(
    () =>
      createClinicSale(billing, { ...saleInput, checkoutKey: randomUUID() }),
    "Caja cerrada bloquea facturación",
  );
  await rejected(
    () => recordCashMovement(billing, { ...expense, requestId: randomUUID() }),
    "Caja cerrada bloquea salidas",
  );
  await autoCloseCash(other.companyId, new Date("2026-10-10T02:00:00Z"));
  const automatic = await cashState(other, new Date("2026-10-12T14:00:00Z"));
  check(
    automatic.missed === 1 && automatic.previous?.automatic,
    "Cierre automático cuenta cierre manual omitido",
  );
  check(
    (automatic.previous?.closeData as { NIO: { counted: unknown } }).NIO
      .counted === null,
    "Automático no inventa conteo de efectivo",
  );
  await rejected(
    () =>
      openCash(
        other,
        { NIO: "50", USD: "0" },
        new Date("2026-10-10T14:00:00Z"),
      ),
    "No abre en sábado",
  );
  await openCash(
    other,
    { NIO: "50", USD: "0" },
    new Date("2026-10-12T14:00:00Z"),
  );
  check(
    (await cashState(other, new Date("2026-10-12T14:00:00Z"))).canBill,
    "Nueva jornada habilita facturación después de apertura",
  );
  console.log(`\n${checks} comprobaciones de integración pasaron.`);
}
async function cleanup() {
  for (const companyId of ids) {
    await db.auditLog.deleteMany({ where: { companyId } });
    await db.receipt.deleteMany({ where: { companyId } });
    await db.payment.deleteMany({ where: { companyId } });
    await db.appointment.deleteMany({ where: { companyId } });
    await db.customerAdvance.deleteMany({ where: { companyId } });
    await db.cashMovement.deleteMany({ where: { companyId } });
    await db.cashDay.deleteMany({ where: { companyId } });
    await db.reportDelivery.deleteMany({ where: { companyId } });
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
