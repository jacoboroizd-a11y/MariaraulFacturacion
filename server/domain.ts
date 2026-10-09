import { todayString } from "@/lib/utils";
import { assertCashOpen } from "./cash-register";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { transaction } from "./db";
import { AppError, authorize, type Context } from "./auth";
import {
  calculateDocument,
  paymentBalance,
  invoiceStatus,
  decimal,
} from "@/lib/money";
import {
  customerSchema,
  productSchema,
  taxSchema,
  documentSchema,
  paymentSchema,
  settingsSchema,
  userSchema,
} from "./validation";
import { z } from "zod";
type Tx = Prisma.TransactionClient;
export async function audit(
  tx: Tx,
  ctx: Context,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await tx.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      entityType,
      entityId,
      action,
      metadata,
    },
  });
}
export async function nextNumber(
  tx: Tx,
  companyId: string,
  kind: "invoice" | "quote" | "receipt",
) {
  const field =
    kind === "invoice"
      ? "nextInvoice"
      : kind === "quote"
        ? "nextQuote"
        : "nextReceipt";
  const settings = await tx.companySettings.update({
    where: { companyId },
    data: { [field]: { increment: 1 } },
  });
  const prefix =
    kind === "invoice"
      ? settings.invoicePrefix
      : kind === "quote"
        ? settings.quotePrefix
        : settings.receiptPrefix;
  return `${prefix}${String(settings[field] - 1).padStart(6, "0")}`;
}
async function scopedCustomer(tx: Tx, ctx: Context, id: string) {
  const customer = await tx.customer.findFirst({
    where: { id, companyId: ctx.companyId },
  });
  if (!customer) throw new AppError("Cliente no encontrado.", 404);
  return customer;
}
export async function saveCustomer(ctx: Context, input: unknown, id?: string) {
  authorize(ctx);
  const data = customerSchema.parse(input);
  return transaction(async (tx) => {
    if (id) await scopedCustomer(tx, ctx, id);
    const customer = id
      ? await tx.customer.update({ where: { id }, data })
      : await tx.customer.create({
          data: { ...data, companyId: ctx.companyId },
        });
    await audit(
      tx,
      ctx,
      "Customer",
      customer.id,
      id ? "CUSTOMER_UPDATED" : "CUSTOMER_CREATED",
    );
    return customer;
  });
}
export async function saveProduct(ctx: Context, input: unknown, id?: string) {
  authorize(ctx, true);
  const data = productSchema.parse(input);
  data.taxId = data.taxId || null;
  return transaction((tx) => saveProductTx(tx, ctx, data, id));
}
export async function saveProductTx(
  tx: Tx,
  ctx: Context,
  data: z.infer<typeof productSchema>,
  id?: string,
) {
  if (
    id &&
    !(await tx.product.findFirst({ where: { id, companyId: ctx.companyId } }))
  )
    throw new AppError("Producto no encontrado.", 404);
  if (
    data.taxId &&
    !(await tx.tax.findFirst({
      where: { id: data.taxId, companyId: ctx.companyId, active: true },
    }))
  )
    throw new AppError("Impuesto no válido.");
  const previous = id
    ? await tx.product.findUniqueOrThrow({ where: { id } })
    : null;
  if (
    previous &&
    previous.type !== data.type &&
    (await tx.invoiceItem.count({ where: { productId: id } }))
  )
    throw new AppError(
      "Un artículo facturado no puede cambiar entre cosmético y tratamiento.",
    );
  const product = id
    ? await tx.product.update({ where: { id }, data })
    : await tx.product.create({
        data: { ...data, companyId: ctx.companyId },
      });
  if (data.stock !== undefined && (previous?.stock || 0) !== product.stock)
    await audit(tx, ctx, "Product", product.id, "STOCK_ADJUSTED", {
      quantity: product.stock - (previous?.stock || 0),
      balance: product.stock,
      reason: previous ? "Ajuste desde catálogo" : "Inventario inicial",
    });
  await audit(
    tx,
    ctx,
    "Product",
    product.id,
    id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
  );
  return product;
}
export async function saveTax(ctx: Context, input: unknown, id?: string) {
  authorize(ctx, true);
  const data = taxSchema.parse(input);
  return transaction(async (tx) => {
    if (
      id &&
      !(await tx.tax.findFirst({ where: { id, companyId: ctx.companyId } }))
    )
      throw new AppError("Impuesto no encontrado.", 404);
    const tax = id
      ? await tx.tax.update({ where: { id }, data })
      : await tx.tax.create({ data: { ...data, companyId: ctx.companyId } });
    await audit(tx, ctx, "Tax", tax.id, "SETTINGS_UPDATED");
    return tax;
  });
}
export async function deleteEntity(
  ctx: Context,
  kind: "customers" | "products" | "taxes",
  id: string,
) {
  authorize(ctx, true);
  return transaction(async (tx) => {
    if (kind === "customers") {
      await scopedCustomer(tx, ctx, id);
      if (
        (await tx.invoice.count({ where: { customerId: id } })) ||
        (await tx.quote.count({ where: { customerId: id } }))
      )
        throw new AppError(
          "El cliente tiene documentos. Desactívalo para preservar su historial.",
        );
      await tx.customer.delete({ where: { id } });
    }
    if (kind === "products") {
      if (
        !(await tx.product.findFirst({
          where: { id, companyId: ctx.companyId },
        }))
      )
        throw new AppError("Producto no encontrado.", 404);
      if (
        (await tx.invoiceItem.count({
          where: { productId: id, companyId: ctx.companyId },
        })) ||
        (await tx.quoteItem.count({
          where: { productId: id, companyId: ctx.companyId },
        }))
      )
        throw new AppError(
          "El producto tiene documentos. Desactívalo para preservar su historial.",
        );
      await tx.product.delete({ where: { id } });
    }
    if (kind === "taxes") {
      if (
        !(await tx.tax.findFirst({ where: { id, companyId: ctx.companyId } }))
      )
        throw new AppError("Impuesto no encontrado.", 404);
      if (await tx.product.count({ where: { taxId: id } }))
        throw new AppError("Impuesto en uso. Desactívalo.");
      await tx.tax.delete({ where: { id } });
    }
    await audit(
      tx,
      ctx,
      kind,
      id,
      kind === "customers"
        ? "CUSTOMER_DELETED"
        : kind === "products"
          ? "PRODUCT_DELETED"
          : "SETTINGS_UPDATED",
    );
    return { id };
  });
}
function snapshots(
  customer: Awaited<ReturnType<typeof scopedCustomer>>,
  company: Prisma.CompanyGetPayload<{ include: { settings: true } }>,
) {
  return {
    customerSnapshot: {
      name: customer.name,
      legalName: customer.legalName,
      tradeName: customer.tradeName,
      ruc: customer.ruc,
      email: customer.email,
      address: customer.address,
      phone: customer.phone,
    },
    companySnapshot: {
      name: company.name,
      tradeName: company.tradeName,
      ruc: company.ruc,
      logo: company.logo,
      address: company.address,
      email: company.email,
      phone: company.phone,
      bankInfo: company.settings?.bankInfo || "",
      dateFormat: company.settings?.dateFormat || "dd/MM/yyyy",
    },
  };
}
export async function saveDocument(
  ctx: Context,
  kind: "quotes" | "invoices",
  input: unknown,
  id?: string,
) {
  authorize(ctx, true);
  const data = documentSchema.parse(input);
  if (kind === "invoices" && !["DRAFT", "PENDING"].includes(data.status))
    throw new AppError("Estado de factura inválido.");
  if (kind === "quotes" && data.status === "PENDING")
    throw new AppError("Estado de cotización inválido.");
  return transaction((tx) => saveDocumentTx(tx, ctx, kind, data, id));
}
export async function saveDocumentTx(
  tx: Tx,
  ctx: Context,
  kind: "quotes" | "invoices",
  data: z.infer<typeof documentSchema>,
  id?: string,
) {
  if (kind === "invoices" && data.status !== "DRAFT")
    await assertCashOpen(tx, ctx);
  const customer = await scopedCustomer(tx, ctx, data.customerId);
  if (!customer.active) throw new AppError("El cliente está inactivo.");
  const company = await tx.company.findUniqueOrThrow({
    where: { id: ctx.companyId },
    include: { settings: true },
  });
  const productIds = [
    ...new Set(data.items.flatMap((i) => (i.productId ? [i.productId] : []))),
  ];
  if (
    (await tx.product.count({
      where: {
        companyId: ctx.companyId,
        id: { in: productIds },
        active: true,
      },
    })) !== productIds.length
  )
    throw new AppError(
      "Uno de los productos no está disponible en esta empresa.",
    );
  if (id) {
    const existing =
      kind === "invoices"
        ? await tx.invoice.findFirst({
            where: { id, companyId: ctx.companyId },
          })
        : await tx.quote.findFirst({
            where: { id, companyId: ctx.companyId },
          });
    if (!existing) throw new AppError("Documento no encontrado.", 404);
    if (kind === "invoices" && existing.status !== "DRAFT")
      throw new AppError("Solo se pueden editar facturas en borrador.");
    if (kind === "quotes" && existing.status === "CONVERTED")
      throw new AppError("La cotización ya fue convertida.");
  }
  const computed = calculateDocument(data.items, data.discountRate);
  if (decimal(computed.total).lte(0))
    throw new AppError("El total del documento debe ser mayor que cero.");
  const values = [
    computed.subtotal,
    computed.discountTotal,
    computed.taxTotal,
    computed.total,
    ...computed.items.flatMap((item) => [
      item.subtotal,
      item.discount,
      item.tax,
      item.total,
    ]),
  ];
  if (values.some((value) => decimal(value).gte("10000000000000000")))
    throw new AppError("El documento excede el límite de importe admitido.");
  const { items: computedItems, ...totals } = computed;
  const catalog =
    kind === "invoices"
      ? await tx.product.findMany({
          where: { companyId: ctx.companyId, id: { in: productIds } },
          select: { id: true, type: true, category: true },
        })
      : [];
  const items = computedItems.map((item) =>
    kind === "quotes"
      ? item
      : {
          ...item,
          reportGroup:
            catalog.find((p) => p.id === item.productId)?.type === "PRODUCT"
              ? "SKINCARE"
              : /l[aá]ser/i.test(
                    catalog.find((p) => p.id === item.productId)?.category ||
                      "",
                  )
                ? "LASER"
                : "ESTHETIC",
        },
  );
  const base = {
    customerId: customer.id,
    date: new Date(data.date),
    dueDate: new Date(data.dueDate),
    currency: data.currency,
    exchangeRate: data.exchangeRate,
    discountRate: data.discountRate,
    notes: data.notes,
    terms: data.terms,
    ...totals,
    ...snapshots(customer, company),
  };
  if (kind === "quotes") {
    const status = data.status as
      "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
    const quote = id
      ? await tx.quote.update({
          where: { id },
          data: { ...base, status, items: { deleteMany: {}, create: items } },
        })
      : await tx.quote.create({
          data: {
            ...base,
            status,
            companyId: ctx.companyId,
            documentNumber: await nextNumber(tx, ctx.companyId, "quote"),
            items: { create: items },
          },
        });
    await audit(
      tx,
      ctx,
      "Quote",
      quote.id,
      id ? "QUOTE_UPDATED" : "QUOTE_CREATED",
    );
    return quote;
  }
  const status = invoiceStatus(base.total, "0", null, data.status) as
    "DRAFT" | "PENDING" | "OVERDUE";
  const invoice = id
    ? await tx.invoice.update({
        where: { id },
        data: {
          ...base,
          dueDate: null,
          status,
          balanceDue: base.total,
          items: { deleteMany: {}, create: items },
        },
      })
    : await tx.invoice.create({
        data: {
          ...base,
          dueDate: null,
          status,
          balanceDue: base.total,
          companyId: ctx.companyId,
          documentNumber: await nextNumber(tx, ctx.companyId, "invoice"),
          items: { create: items },
        },
      });
  if (invoice.status !== "DRAFT")
    await applyInvoiceStock(tx, ctx, invoice.id, -1);
  await audit(
    tx,
    ctx,
    "Invoice",
    invoice.id,
    id ? "INVOICE_UPDATED" : "INVOICE_CREATED",
  );
  return invoice;
}
export async function convertQuote(ctx: Context, id: string) {
  authorize(ctx, true);
  return transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { items: { orderBy: { position: "asc" } }, invoice: true },
    });
    if (!quote) throw new AppError("Cotización no encontrada.", 404);
    if (quote.invoice) return quote.invoice;
    await assertCashOpen(tx, ctx);
    if (["REJECTED", "EXPIRED", "CONVERTED"].includes(quote.status))
      throw new AppError("La cotización no se puede convertir.");
    const catalog = await tx.product.findMany({
      where: {
        companyId: ctx.companyId,
        id: {
          in: quote.items
            .map((i) => i.productId)
            .filter((id): id is string => Boolean(id)),
        },
      },
      select: { id: true, type: true, category: true },
    });
    const invoice = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        quoteId: id,
        customerId: quote.customerId,
        documentNumber: await nextNumber(tx, ctx.companyId, "invoice"),
        date: quote.date,
        dueDate: null,
        currency: quote.currency,
        exchangeRate: quote.exchangeRate,
        discountRate: quote.discountRate,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
        balanceDue: quote.total,
        status: invoiceStatus(quote.total.toString(), "0", null) as
          "PENDING" | "OVERDUE",
        notes: quote.notes,
        terms: quote.terms,
        customerSnapshot: quote.customerSnapshot as Prisma.InputJsonValue,
        companySnapshot: quote.companySnapshot as Prisma.InputJsonValue,
        items: {
          create: quote.items.map((i) => ({
            productId: i.productId,
            reportGroup:
              catalog.find((p) => p.id === i.productId)?.type === "PRODUCT"
                ? "SKINCARE"
                : /l[aá]ser/i.test(
                      catalog.find((p) => p.id === i.productId)?.category || "",
                    )
                  ? "LASER"
                  : "ESTHETIC",
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountRate: i.discountRate,
            taxRate: i.taxRate,
            subtotal: i.subtotal,
            discount: i.discount,
            tax: i.tax,
            total: i.total,
            position: i.position,
          })),
        },
      },
    });
    await applyInvoiceStock(tx, ctx, invoice.id, -1);
    await tx.quote.update({ where: { id }, data: { status: "CONVERTED" } });
    await audit(tx, ctx, "Quote", id, "QUOTE_CONVERTED", {
      invoiceId: invoice.id,
    });
    await audit(tx, ctx, "Invoice", invoice.id, "INVOICE_CREATED", {
      quoteId: id,
    });
    return invoice;
  });
}
export async function documentAction(
  ctx: Context,
  kind: "quotes" | "invoices",
  id: string,
  action: string,
) {
  authorize(ctx, true);
  if (kind === "quotes" && action === "convert") return convertQuote(ctx, id);
  return transaction(async (tx) => {
    if (kind === "quotes") {
      const quote = await tx.quote.findFirst({
        where: { id, companyId: ctx.companyId },
      });
      if (!quote) throw new AppError("No encontrado.", 404);
      if (["accept", "reject"].includes(action)) {
        if (quote.status !== "SENT")
          throw new AppError(
            "Solo se pueden aceptar o rechazar cotizaciones enviadas.",
          );
        const result = await tx.quote.update({
          where: { id },
          data: { status: action === "accept" ? "ACCEPTED" : "REJECTED" },
        });
        await audit(tx, ctx, "Quote", id, "QUOTE_UPDATED", { action });
        return result;
      }
      if (quote.status !== "DRAFT" || action !== "delete")
        throw new AppError("Solo se pueden eliminar borradores.");
      await tx.quote.delete({ where: { id } });
      await audit(tx, ctx, "Quote", id, "QUOTE_DELETED");
      return { id };
    }
    const invoice = await tx.invoice.findFirst({
      where: { id, companyId: ctx.companyId },
    });
    if (!invoice) throw new AppError("No encontrado.", 404);
    if (action === "delete") {
      if (invoice.status !== "DRAFT")
        throw new AppError("Solo se pueden eliminar borradores.");
      await tx.invoice.delete({ where: { id } });
      await audit(tx, ctx, "Invoice", id, "INVOICE_DELETED");
      return { id };
    }
    if (action === "issue") {
      await assertCashOpen(tx, ctx);
      if (invoice.status !== "DRAFT")
        throw new AppError("La factura ya fue emitida.");
      const result = await tx.invoice.update({
        where: { id },
        data: {
          status: invoiceStatus(
            invoice.total.toString(),
            "0",
            invoice.dueDate,
          ) as "PENDING" | "OVERDUE",
        },
      });
      await applyInvoiceStock(tx, ctx, id, -1);
      await audit(tx, ctx, "Invoice", id, "INVOICE_UPDATED", { issued: true });
      return result;
    }
    if (action === "void") {
      if (invoice.status === "VOID") return invoice;
      if (
        await tx.invoiceItem.count({
          where: { invoiceId: id, sessionsUsed: { gt: 0 } },
        })
      )
        throw new AppError(
          "La factura tiene sesiones realizadas y no se puede anular.",
        );
      if (invoice.amountPaid.gt(0))
        throw new AppError(
          "Elimina o revierte los pagos antes de anular la factura.",
        );
      const result = await tx.invoice.update({
        where: { id },
        data: { status: "VOID" },
      });
      if (invoice.status !== "DRAFT") await applyInvoiceStock(tx, ctx, id, 1);
      await audit(tx, ctx, "Invoice", id, "INVOICE_VOIDED");
      return result;
    }
    throw new AppError("Acción inválida.");
  });
}
export async function createPayment(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = paymentSchema.parse(input);
  return transaction((tx) => createPaymentTx(tx, ctx, data));
}
export async function createPaymentTx(
  tx: Tx,
  ctx: Context,
  data: z.infer<typeof paymentSchema>,
) {
  const invoice = await tx.invoice.findFirst({
    where: { id: data.invoiceId, companyId: ctx.companyId },
  });
  if (!invoice) throw new AppError("Factura no encontrada.", 404);
  if (["VOID", "DRAFT"].includes(invoice.status))
    throw new AppError(
      "Emite la factura antes de registrar pagos. Las facturas anuladas no aceptan pagos.",
    );
  if (data.currency !== invoice.currency)
    throw new AppError("El pago debe usar la moneda de la factura.");
  if (new Date(data.paymentDate) < invoice.date)
    throw new AppError("El pago no puede preceder a la factura.");
  const { requestId, ...values } = data;
  if (requestId) {
    const log = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        entityType: "Payment",
        action: "PAYMENT_CREATED",
        metadata: { path: ["requestId"], equals: requestId },
      },
    });
    if (log) {
      const previous = await tx.payment.findFirstOrThrow({
        where: { id: log.entityId, companyId: ctx.companyId },
        include: { receipt: true },
      });
      if (
        previous.invoiceId !== data.invoiceId ||
        !previous.amount.equals(data.amount) ||
        previous.method !== data.method ||
        previous.currency !== data.currency ||
        previous.paymentDate.toISOString().slice(0, 10) !== data.paymentDate ||
        previous.reference !== data.reference ||
        previous.notes !== data.notes ||
        previous.account !== data.account
      )
        throw new AppError("Este pago ya se registró con otros datos.", 409);
      if (!previous.receipt)
        throw new AppError("El pago existe pero falta su recibo.", 409);
      return { ...previous, receipt: previous.receipt };
    }
  }
  await assertCashOpen(tx, ctx);
  if (data.paymentDate !== todayString())
    throw new AppError("Los cobros se registran en la caja del día actual.");
  const balances = paymentBalance(
    invoice.total.toString(),
    invoice.amountPaid.toString(),
    data.amount,
  );
  const payment = await tx.payment.create({
    data: {
      ...values,
      paymentDate: new Date(data.paymentDate),
      companyId: ctx.companyId,
    },
  });
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      ...balances,
      status: invoiceStatus(
        invoice.total.toString(),
        balances.amountPaid,
        invoice.dueDate,
      ) as "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE",
    },
  });
  const receipt = await tx.receipt.create({
    data: {
      companyId: ctx.companyId,
      paymentId: payment.id,
      invoiceId: invoice.id,
      documentNumber: await nextNumber(tx, ctx.companyId, "receipt"),
      balanceRemaining: balances.balanceDue,
    },
  });
  await audit(tx, ctx, "Payment", payment.id, "PAYMENT_CREATED", {
    ...(requestId ? { requestId } : {}),
    invoiceId: invoice.id,
    amount: data.amount,
    receiptId: receipt.id,
  });
  return { ...payment, receipt };
}
export async function deletePayment(ctx: Context, id: string) {
  authorize(ctx, true);
  return transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { invoice: true },
    });
    if (payment?.advanceId)
      throw new AppError(
        "El pago corresponde a un adelanto aplicado y no se puede eliminar como un cobro nuevo.",
      );
    if (!payment || payment.deletedAt)
      throw new AppError("Pago no encontrado.", 404);
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.receipt.updateMany({
      where: { paymentId: id, companyId: ctx.companyId },
      data: { voidedAt: new Date() },
    });
    const sum = await tx.payment.aggregate({
      where: {
        invoiceId: payment.invoiceId,
        companyId: ctx.companyId,
        deletedAt: null,
      },
      _sum: { amount: true },
    });
    const paid = sum._sum.amount?.toString() || "0";
    const balance = decimal(payment.invoice.total.toString())
      .minus(paid)
      .toFixed(2);
    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        amountPaid: paid,
        balanceDue: balance,
        status: invoiceStatus(
          payment.invoice.total.toString(),
          paid,
          payment.invoice.dueDate,
          payment.invoice.status,
        ) as "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE",
      },
    });
    await audit(tx, ctx, "Payment", id, "PAYMENT_DELETED", {
      invoiceId: payment.invoiceId,
      amount: payment.amount.toString(),
    });
    return { id };
  });
}
export async function saveSettings(ctx: Context, input: unknown) {
  authorize(ctx, true);
  const data = settingsSchema.parse(input);
  return transaction(async (tx) => {
    const { name, tradeName, ruc, logo, address, phone, email, ...settings } =
      data;
    const existing = await tx.companySettings.findUniqueOrThrow({
      where: { companyId: ctx.companyId },
    });
    if (
      settings.nextInvoice < existing.nextInvoice ||
      settings.nextQuote < existing.nextQuote ||
      settings.nextReceipt < existing.nextReceipt
    )
      throw new AppError("La numeración no puede retroceder.");
    await tx.company.update({
      where: { id: ctx.companyId },
      data: { name, tradeName, ruc, logo, address, phone, email },
    });
    const result = await tx.companySettings.update({
      where: { companyId: ctx.companyId },
      data: settings,
    });
    await audit(tx, ctx, "Company", ctx.companyId, "SETTINGS_UPDATED");
    return result;
  });
}
export async function createUser(ctx: Context, input: unknown) {
  authorize(ctx, true);
  const { password, role, ...data } = userSchema.parse(input);
  const passwordHash = await hash(password, 12);
  return transaction(async (tx) => {
    if (
      (data.email &&
        (await tx.user.findUnique({ where: { email: data.email } }))) ||
      (data.username &&
        (await tx.user.findUnique({ where: { username: data.username } })))
    )
      throw new AppError("Ese usuario o correo ya está registrado.");
    const user = await tx.user.create({
      data: {
        ...data,
        passwordHash,
        memberships: { create: { companyId: ctx.companyId, role } },
      },
      select: { id: true, name: true, email: true, username: true },
    });
    await audit(tx, ctx, "User", user.id, "USER_CREATED", { role });
    return user;
  });
}
export async function updateMembership(
  ctx: Context,
  id: string,
  input: unknown,
) {
  authorize(ctx, true);
  const data = z
    .object({
      role: z.enum(["ADMIN", "BILLING", "VIEWER", "ACCOUNTANT"]),
      active: z.boolean(),
    })
    .parse(input);
  return transaction(async (tx) => {
    const member = await tx.membership.findFirst({
      where: { userId: id, companyId: ctx.companyId },
      include: { user: true },
    });
    if (!member) throw new AppError("Usuario no encontrado.", 404);
    if (id === ctx.userId)
      throw new AppError("No puedes modificar tu propio acceso.");
    if (
      member.role === "ADMIN" &&
      (data.role !== "ADMIN" || !data.active) &&
      (await tx.membership.count({
        where: {
          companyId: ctx.companyId,
          role: "ADMIN",
          user: { active: true },
        },
      })) <= 1
    )
      throw new AppError("Debe existir un administrador activo.");
    await tx.membership.update({
      where: { id: member.id },
      data: { role: data.role },
    }); // active applies to this membership: remove sessions and membership on deactivation; global user remains intact.
    if (!data.active) {
      await tx.membership.delete({ where: { id: member.id } });
      await tx.session.deleteMany({ where: { userId: id } });
    }
    await audit(tx, ctx, "User", id, "USER_UPDATED", data);
    return { id };
  });
}

export async function applyInvoiceStock(
  tx: Tx,
  ctx: Context,
  invoiceId: string,
  direction: -1 | 1,
) {
  const items = await tx.invoiceItem.findMany({
    where: { invoiceId, companyId: ctx.companyId },
    include: { product: true },
  });
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.product || item.product.type !== "PRODUCT") continue;
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity))
      throw new AppError("Los cosméticos se venden en unidades enteras.");
    quantities.set(
      item.product.id,
      (quantities.get(item.product.id) || 0) + quantity,
    );
  }
  for (const [productId, quantity] of quantities) {
    const product = await tx.product.findFirstOrThrow({
      where: { id: productId, companyId: ctx.companyId },
    });
    if (direction === -1 && product.stock < quantity)
      throw new AppError(
        `No hay suficientes unidades de ${product.name}. Disponibles: ${product.stock}.`,
      );
    if (direction === 1 && product.stock + quantity > 1000000000)
      throw new AppError("El inventario supera el límite permitido.");
    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: direction * quantity } },
    });
    await audit(
      tx,
      ctx,
      "Product",
      productId,
      direction === -1 ? "STOCK_SOLD" : "STOCK_RETURNED",
      { invoiceId, quantity: direction * quantity, balance: updated.stock },
    );
  }
}
