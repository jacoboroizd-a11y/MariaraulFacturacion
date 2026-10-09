import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, authorize, type Context } from "./auth";
import { db, transaction } from "./db";
import { audit, saveDocumentTx, createPaymentTx } from "./domain";
import { customerSchema, documentSchema, paymentSchema } from "./validation";
import { convertCurrency, decimal } from "@/lib/money";
import { todayString } from "@/lib/utils";

// A datetime-local entered in Nicaragua is UTC-6; never depend on server timezone.
const appointment = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine((value) => {
    const d = new Date(value + ":00-06:00");
    return (
      !isNaN(d.getTime()) &&
      new Date(d.getTime() - 6 * 3600000).toISOString().slice(0, 16) === value
    );
  }, "Fecha y hora de cita inválidas");
const saleSchema = z
  .object({
    checkoutKey: z.uuid(),
    customerId: z.string().min(1).optional(),
    newCustomer: customerSchema.pick({ name: true, phone: true }).optional(),
    currency: z.enum(["NIO", "USD"]),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(10000),
        }),
      )
      .min(1)
      .max(100),
    paymentMode: z.enum(["FULL", "PARTIAL", "LATER"]),
    amount: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/)
      .default("0"),
    method: paymentSchema.shape.method,
    nextAppointment: z.union([appointment, z.literal("")]).default(""),
    dueDate: documentSchema.shape.dueDate,
    notes: z.string().trim().max(2000).default(""),
  })
  .refine(
    (value) => Boolean(value.customerId) !== Boolean(value.newCustomer),
    "Selecciona un cliente o registra uno nuevo.",
  );
export async function createClinicSale(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = saleSchema.parse(input);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  const existingSale = async () => {
    const existing = await db.invoice.findUnique({
      where: {
        companyId_checkoutKey: {
          companyId: ctx.companyId,
          checkoutKey: data.checkoutKey,
        },
      },
    });
    if (existing && existing.checkoutHash !== fingerprint)
      throw new AppError(
        "Esta venta ya se guardó con otros datos. Abre una nueva venta.",
        409,
      );
    return existing;
  };
  const existing = await existingSale();
  if (existing) return existing;
  try {
    return await transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: {
          companyId_checkoutKey: {
            companyId: ctx.companyId,
            checkoutKey: data.checkoutKey,
          },
        },
      });
      if (existing) {
        if (existing.checkoutHash !== fingerprint)
          throw new AppError("Esta venta ya se guardó con otros datos.", 409);
        return existing;
      }
      const company = await tx.company.findUniqueOrThrow({
        where: { id: ctx.companyId },
        include: { settings: true },
      });
      if (!company.settings)
        throw new AppError("Configura la empresa antes de vender.");
      const products = await tx.product.findMany({
        where: {
          companyId: ctx.companyId,
          active: true,
          id: { in: data.items.map((i) => i.productId) },
        },
        include: { tax: true },
      });
      const lines = data.items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product)
          throw new AppError(
            "Un tratamiento o cosmético ya no está disponible.",
          );
        if (product.tax && !product.tax.active)
          throw new AppError("El impuesto del catálogo está inactivo.");
        return {
          productId: product.id,
          description:
            product.name +
            (product.pricingMode === "PER_UNIT"
              ? ` · ${product.unit} aplicadas`
              : "") +
            (product.type === "SERVICE" && product.sessions > 1
              ? ` · Paquete de ${product.sessions} sesiones`
              : ""),
          quantity: String(item.quantity),
          unitPrice: convertCurrency(
            product.price.toString(),
            product.currency,
            data.currency,
            company.settings!.exchangeRate.toString(),
          ),
          discountRate: "0",
          taxRate: product.tax?.rate.toString() || "0",
        };
      });
      let customerId = data.customerId;
      if (data.newCustomer) {
        const customer = await tx.customer.create({
          data: {
            ...customerSchema.parse(data.newCustomer),
            companyId: ctx.companyId,
          },
        });
        customerId = customer.id;
        await audit(tx, ctx, "Customer", customer.id, "CUSTOMER_CREATED");
      }
      const doc = documentSchema.parse({
        customerId,
        date: todayString(),
        dueDate: data.dueDate,
        currency: data.currency,
        exchangeRate: company.settings.exchangeRate.toString(),
        items: lines,
        notes: data.notes,
        terms: company.settings.terms,
        status: "PENDING",
      });
      const invoice = await saveDocumentTx(tx, ctx, "invoices", doc);
      const items = await tx.invoiceItem.findMany({
        where: { invoiceId: invoice.id },
        orderBy: { position: "asc" },
      });
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId)!;
        if (product.type === "SERVICE")
          await tx.invoiceItem.update({
            where: { id: item.id },
            data: {
              sessionsTotal:
                product.pricingMode === "PER_UNIT"
                  ? 1
                  : product.sessions * Number(item.quantity),
            },
          });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          checkoutKey: data.checkoutKey,
          checkoutHash: fingerprint,
          nextAppointment: data.nextAppointment
            ? new Date(data.nextAppointment + ":00-06:00")
            : null,
        },
      });
      const amount =
        data.paymentMode === "FULL" ? invoice.total.toFixed(2) : data.amount;
      if (
        data.paymentMode === "PARTIAL" &&
        (decimal(amount).lte(0) || decimal(amount).gte(invoice.total))
      )
        throw new AppError(
          "El abono debe ser mayor que cero y menor que el total. Para cancelar usa Pago completo.",
        );
      if (data.paymentMode !== "LATER")
        await createPaymentTx(
          tx,
          ctx,
          paymentSchema.parse({
            invoiceId: invoice.id,
            amount,
            currency: invoice.currency,
            paymentDate: doc.date,
            method: data.method,
          }),
        );
      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await existingSale();
      if (existing) return existing;
    }
    throw error;
  }
}
export async function recordSession(
  ctx: Context,
  itemId: string,
  input: unknown,
) {
  authorize(ctx);
  const { requestId } = z.object({ requestId: z.uuid() }).parse(input);
  return transaction(async (tx) => {
    const item = await tx.invoiceItem.findFirst({
      where: { id: itemId, companyId: ctx.companyId },
      include: { invoice: true },
    });
    if (!item || ["VOID", "DRAFT"].includes(item.invoice.status))
      throw new AppError("Paquete no disponible.", 404);
    const previous = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        entityId: item.id,
        action: "SESSION_COMPLETED",
        metadata: { path: ["requestId"], equals: requestId },
      },
    });
    if (previous) return item;
    if (item.sessionsUsed >= item.sessionsTotal)
      throw new AppError("No quedan sesiones disponibles.");
    const updated = await tx.invoiceItem.update({
      where: { id: item.id },
      data: { sessionsUsed: { increment: 1 } },
    });
    await audit(tx, ctx, "InvoiceItem", item.id, "SESSION_COMPLETED", {
      requestId,
      invoiceId: item.invoiceId,
      session: updated.sessionsUsed,
    });
    return updated;
  });
}
export async function changeAppointment(
  ctx: Context,
  invoiceId: string,
  input: unknown,
) {
  authorize(ctx);
  const { nextAppointment } = z
    .object({ nextAppointment: z.union([appointment, z.literal("")]) })
    .parse(input);
  return transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId: ctx.companyId },
    });
    if (!invoice || ["VOID", "DRAFT"].includes(invoice.status))
      throw new AppError("Factura no disponible.", 404);
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        nextAppointment: nextAppointment
          ? new Date(nextAppointment + ":00-06:00")
          : null,
      },
    });
    await audit(tx, ctx, "Invoice", invoiceId, "APPOINTMENT_UPDATED", {
      nextAppointment,
      previous: invoice.nextAppointment?.toISOString() || "",
    });
    return updated;
  });
}

export async function adjustStock(
  ctx: Context,
  productId: string,
  input: unknown,
) {
  authorize(ctx);
  const data = z
    .object({
      requestId: z.uuid(),
      quantity: z.coerce
        .number()
        .int()
        .min(-1000000000)
        .max(1000000000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(1).max(200),
    })
    .parse(input);
  return transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, companyId: ctx.companyId, type: "PRODUCT" },
    });
    if (!product) throw new AppError("Cosmético no encontrado.", 404);
    if (
      await tx.auditLog.findFirst({
        where: {
          companyId: ctx.companyId,
          entityId: productId,
          action: "STOCK_ADJUSTED",
          metadata: { path: ["requestId"], equals: data.requestId },
        },
      })
    )
      return product;
    const balance = product.stock + data.quantity;
    if (balance < 0 || balance > 1000000000)
      throw new AppError(
        "El ajuste deja existencias fuera del rango permitido.",
      );
    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: balance },
    });
    await audit(tx, ctx, "Product", productId, "STOCK_ADJUSTED", {
      ...data,
      balance,
    });
    return updated;
  });
}
