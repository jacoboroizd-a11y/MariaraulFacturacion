import "dotenv/config";
import { hash } from "bcryptjs";
import { db } from "../server/db";
import {
  saveCustomer,
  saveProduct,
  saveDocument,
  convertQuote,
  createPayment,
} from "../server/domain";
import { decimal } from "../lib/money";
import type { Context } from "../server/auth";
async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD,
    billingPassword = process.env.SEED_BILLING_PASSWORD;
  if (
    !adminPassword ||
    adminPassword.length < 12 ||
    !billingPassword ||
    billingPassword.length < 12
  )
    throw new Error(
      "Configura SEED_ADMIN_PASSWORD y SEED_BILLING_PASSWORD (mínimo 12 caracteres).",
    );
  // Non-destructive and repeatable: never reseed an existing demo company or overwrite user passwords.
  if (await db.company.findUnique({ where: { id: "demo-nicaragua" } })) {
    console.log(
      "La empresa demo ya existe. Seed omitido; datos existentes preservados.",
    );
    return;
  }
  const company = await db.company.create({
    data: {
      id: "demo-nicaragua",
      name: "Distribuidora Ejemplo Nicaragua, S.A.",
      tradeName: "Ejemplo Nicaragua",
      ruc: "J0310000000000",
      address: "Zona comercial ficticia, Managua, Nicaragua",
      phone: "+505 2222 0000",
      email: "ventas@ejemplo.invalid",
      settings: {
        create: {
          exchangeRate: "36.6243",
          bankInfo: "Banco de demostración · Cuenta ficticia 000-000-000",
          terms: "Pago a 30 días. Documento de demostración.",
          notes: "Gracias por confiar en nuestra empresa.",
        },
      },
    },
  });
  const admin = await db.user.create({
    data: {
      email: "admin@ejemplo.invalid",
      name: "Administración Demo",
      passwordHash: await hash(adminPassword, 12),
      memberships: { create: { companyId: company.id, role: "ADMIN" } },
    },
  });
  await db.user.create({
    data: {
      email: "facturacion@ejemplo.invalid",
      name: "Operaciones Demo",
      passwordHash: await hash(billingPassword, 12),
      memberships: { create: { companyId: company.id, role: "BILLING" } },
    },
  });
  const ctx: Context = {
    userId: admin.id,
    companyId: company.id,
    role: "ADMIN",
    name: admin.name,
    companyName: company.name,
  };
  const tax = await db.tax.create({
    data: { companyId: company.id, name: "IVA", rate: "15" },
  });
  const names = [
    "Comercial Horizonte Demo",
    "Ferretería Sendero Demo",
    "Café Aurora Demo",
    "Suministros Litoral Demo",
    "Oficina Bosque Demo",
    "Servicios Brisa Demo",
    "Mercado Colina Demo",
    "Taller Estrella Demo",
  ];
  const customers = [];
  for (let i = 0; i < 8; i++)
    customers.push(
      await saveCustomer(ctx, {
        name: names[i],
        legalName: names[i] + " S.A.",
        tradeName: names[i],
        ruc: `DEMO-${100 + i}`,
        email: `cliente${i + 1}@ejemplo.invalid`,
        phone: `+505 8000 00${10 + i}`,
        address: `Dirección ficticia ${i + 1}`,
        city: ["Managua", "León", "Granada", "Masaya"][i % 4],
        active: true,
      }),
    );
  const productNames = [
    "Papel tamaño carta",
    "Tóner de impresión",
    "Silla de oficina",
    "Escritorio ejecutivo",
    "Archivador metálico",
    "Kit de limpieza",
    "Resma tamaño legal",
    "Monitor de escritorio",
    "Teclado compacto",
    "Mouse inalámbrico",
    "Instalación de equipos",
    "Soporte técnico mensual",
    "Mantenimiento preventivo",
    "Consultoría administrativa",
    "Diseño de papelería",
  ];
  const products = [];
  for (let i = 0; i < 15; i++)
    products.push(
      await saveProduct(ctx, {
        name: productNames[i],
        sku: `SKU-${String(i + 1).padStart(3, "0")}`,
        description: productNames[i],
        type: i >= 10 ? "SERVICE" : "PRODUCT",
        category: i >= 10 ? "Servicios" : "Oficina",
        price: String((i + 1) * 125),
        currency: "NIO",
        unit: i >= 10 ? "servicio" : "unidad",
        taxId: tax.id,
        active: true,
      }),
    );
  const today = new Date(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Managua" }),
  );
  const day = (offset: number) =>
    new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 5; i++)
    await saveDocument(ctx, "quotes", {
      customerId: customers[i].id,
      date: day(-i),
      dueDate: day(30 - i),
      currency: i === 4 ? "USD" : "NIO",
      exchangeRate: "36.6243",
      status: i === 0 ? "DRAFT" : "SENT",
      discountRate: "0",
      notes: "Cotización de demostración",
      terms: "Válida por 30 días",
      items: [
        {
          productId: products[i].id,
          description: products[i].name,
          quantity: "2",
          unitPrice: i === 4 ? "45.00" : products[i].price.toString(),
          discountRate: "0",
          taxRate: "15",
        },
      ],
    });
  for (let i = 0; i < 15; i++) {
    const date = day(-i * 3);
    const dueDate = i >= 10 ? day(-i) : day(30 - i);
    const document = {
      customerId: customers[i % 8].id,
      date,
      dueDate,
      currency: i % 4 === 0 ? "USD" : "NIO",
      exchangeRate: "36.6243",
      status: "PENDING",
      discountRate: i % 3 === 0 ? "5" : "0",
      notes: "Factura de demostración",
      terms: "Pago a 30 días",
      items: [
        {
          productId: products[i].id,
          description: products[i].name,
          quantity: String((i % 3) + 1),
          unitPrice: i % 4 === 0 ? "85.00" : products[i].price.toString(),
          discountRate: "0",
          taxRate: "15",
        },
      ],
    };
    const invoice =
      i === 0
        ? await convertQuote(
            ctx,
            (
              await db.quote.findFirstOrThrow({
                where: { companyId: company.id, status: "SENT" },
                orderBy: { date: "desc" },
              })
            ).id,
          )
        : await saveDocument(ctx, "invoices", document);
    if (i < 5) {
      const half = decimal(invoice.total.toString())
        .div(2)
        .toDecimalPlaces(2)
        .toFixed(2);
      await createPayment(ctx, {
        invoiceId: invoice.id,
        amount: half,
        currency: invoice.currency,
        paymentDate: day(0),
        method: "BANK_TRANSFER",
        reference: `DEMO-P${i}-A`,
      });
      await createPayment(ctx, {
        invoiceId: invoice.id,
        amount: decimal(invoice.total.toString()).minus(half).toFixed(2),
        currency: invoice.currency,
        paymentDate: day(0),
        method: "CASH",
        reference: `DEMO-P${i}-B`,
      });
    } else if (i < 9)
      await createPayment(ctx, {
        invoiceId: invoice.id,
        amount: decimal(invoice.total.toString())
          .div(3)
          .toDecimalPlaces(2)
          .toFixed(2),
        currency: invoice.currency,
        paymentDate: day(0),
        method: "BANK_TRANSFER",
        reference: `DEMO-P${i}`,
      });
  }
  console.log(
    "Demo creada: 1 empresa, 2 usuarios, 8 clientes, 15 productos, 5 cotizaciones, 15 facturas, 14 pagos y recibos. Contraseñas: las variables SEED_* que configuraste.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
