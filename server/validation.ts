import { z } from "zod";
const text = z.string().trim().max(2000).default("");
const name = z.string().trim().min(1).max(200);
const money = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Monto inválido (máximo dos decimales)");
const rate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/)
  .refine((v) => Number(v) <= 100, "Porcentaje entre 0 y 100");
const exchange = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,6})?$/)
  .refine((v) => Number(v) > 0);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(new Date(v).getTime()) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Fecha inválida",
  );
export const customerSchema = z.object({
  name,
  legalName: text,
  tradeName: text,
  ruc: text,
  phone: text,
  email: z.union([z.email(), z.literal("")]).default(""),
  address: text,
  city: text,
  notes: text,
  active: z.boolean().default(true),
});
export const productSchema = z.object({
  sku: name,
  name,
  description: text,
  category: text,
  type: z.enum(["PRODUCT", "SERVICE"]).default("PRODUCT"),
  price: money,
  currency: z.enum(["NIO", "USD"]).default("NIO"),
  unit: name.default("unidad"),
  taxId: z.string().nullable().optional(),
  active: z.boolean().default(true),
});
export const taxSchema = z.object({
  name,
  rate,
  active: z.boolean().default(true),
});
export const lineSchema = z.object({
  productId: z.string().nullable().optional(),
  description: name,
  quantity: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,4})?$/)
    .refine((v) => Number(v) > 0),
  unitPrice: money,
  discountRate: rate.default("0"),
  taxRate: rate.default("0"),
});
export const documentSchema = z
  .object({
    customerId: name,
    date,
    dueDate: date,
    currency: z.enum(["NIO", "USD"]),
    exchangeRate: exchange,
    items: z.array(lineSchema).min(1).max(100),
    discountRate: rate.default("0"),
    notes: text,
    terms: text,
    status: z
      .enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "PENDING"])
      .default("DRAFT"),
  })
  .refine(
    (v) => v.dueDate >= v.date,
    "El vencimiento no puede preceder a la fecha.",
  );
export const paymentSchema = z.object({
  invoiceId: name,
  amount: money.refine((v) => Number(v) > 0),
  currency: z.enum(["NIO", "USD"]),
  paymentDate: date,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHECK", "OTHER"]),
  reference: text,
  account: text,
  notes: text,
});
export const settingsSchema = z
  .object({
    name,
    tradeName: text,
    ruc: text,
    logo: z
      .union([
        z
          .string()
          .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
          .max(350000),
        z.literal(""),
      ])
      .default(""),
    address: text,
    phone: text,
    email: z.union([z.email(), z.literal("")]).default(""),
    primaryCurrency: z.enum(["NIO", "USD"]),
    secondaryCurrency: z.enum(["NIO", "USD"]),
    exchangeRate: exchange,
    invoicePrefix: z.string().regex(/^[A-Za-z0-9-]{1,12}$/),
    quotePrefix: z.string().regex(/^[A-Za-z0-9-]{1,12}$/),
    receiptPrefix: z.string().regex(/^[A-Za-z0-9-]{1,12}$/),
    nextInvoice: z.coerce.number().int().min(1).max(999999999),
    nextQuote: z.coerce.number().int().min(1).max(999999999),
    nextReceipt: z.coerce.number().int().min(1).max(999999999),
    bankInfo: text,
    terms: text,
    notes: text,
    dateFormat: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  })
  .refine(
    (v) => v.primaryCurrency !== v.secondaryCurrency,
    "Las monedas deben ser diferentes.",
  );
export const userSchema = z.object({
  name,
  email: z.email().transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "La contraseña admite máximo 72 bytes.",
    ),
  role: z.enum(["ADMIN", "BILLING", "VIEWER"]),
});
