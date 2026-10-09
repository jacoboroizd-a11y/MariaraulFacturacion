import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { cleanupCustomer } from "./cleanup";
let createdCustomerName = "";
test.afterEach(async () => {
  if (createdCustomerName) await cleanupCustomer(createdCustomerName);
  createdCustomerName = "";
});
test("flujo completo de facturación desde el navegador", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const customerName = `Cliente E2E ${suffix}`;
  createdCustomerName = customerName;
  const productName = `Producto E2E ${suffix}`;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password)
    throw new Error("SEED_ADMIN_PASSWORD requerido para las pruebas E2E.");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@ejemplo.invalid");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await page.goto("/customers/new");
  await page.getByLabel("Nombre del cliente").fill(customerName);
  await page.getByLabel("RUC / Cédula").fill("E2E-" + suffix);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: customerName, exact: true }),
  ).toBeVisible();
  await page.goto("/products/new");
  await page.getByLabel("Nombre *", { exact: true }).fill(productName);
  await page.getByLabel("Código / SKU").fill("E2E-" + suffix);
  await page.getByLabel("Precio *", { exact: true }).fill("100.00");
  await page
    .getByLabel("Impuesto", { exact: true })
    .selectOption({ label: "IVA (15%)" });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: productName, exact: true }),
  ).toBeVisible();
  await page.goto("/quotes/new");
  await page.getByLabel("Buscar cliente").fill(customerName);
  await page
    .getByLabel("Cliente", { exact: true })
    .selectOption({ label: customerName + " · E2E-" + suffix });
  await page.getByLabel("Agregar producto o servicio").fill(productName);
  await page.getByRole("button").filter({ hasText: productName }).click();
  await expect(page.getByLabel("unitPrice línea 1")).toHaveValue("100.00");
  await page.getByRole("button", { name: "Guardar cotización" }).click();
  await expect(page).toHaveURL(/quotes\/(?!new)/);
  await expect(page.getByText("C$ 115.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Convertir en factura" }).click();
  await expect(page).toHaveURL(/invoices\//);
  const invoiceUrl = page.url();
  const invoiceId = invoiceUrl.split("/").pop()!;
  const pdf = await page.request.get(`/api/pdf/invoices/${invoiceId}`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("link", { name: "Registrar pago" }).click();
  await page.getByLabel(/Monto \(/).fill("50.00");
  await page
    .getByRole("button", { name: "Registrar pago y generar recibo" })
    .click();
  await expect(page).toHaveURL(/receipts\//);
  await expect(
    page.getByText("Saldo después de este pago: C$ 65.00"),
  ).toBeVisible();
  const receiptId = page.url().split("/").pop()!;
  const receiptPdf = await page.request.get(`/api/pdf/receipts/${receiptId}`);
  expect(receiptPdf.status()).toBe(200);
  expect((await receiptPdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.goto(invoiceUrl);
  await expect(page.getByText("Pago parcial", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Registrar pago" }).click();
  await page.getByLabel(/Monto \(/).fill("65.00");
  await page
    .getByRole("button", { name: "Registrar pago y generar recibo" })
    .click();
  await expect(page).toHaveURL(/receipts\//);
  await page.goto(invoiceUrl);
  await expect(page.getByText("Pagada", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saldo pendiente", { exact: true }).locator(".."),
  ).toContainText("C$ 0.00");
  const updated = await page.request.get(`/api/data/invoices/${invoiceId}`);
  const invoice = await updated.json();
  expect(invoice.status).toBe("PAID");
  expect(invoice.balanceDue).toBe("0");
  expect(invoice.amountPaid).toBe("115");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(customerName).first()).toBeVisible();
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Reportes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: customerName, exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Configuración", exact: true }),
  ).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByText("QUOTE_CONVERTED").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".recharts-area-curve")).toBeVisible();
  await page.screenshot({
    path: "/workspace/.cloud/dashboard.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(
    page.getByRole("link", { name: "Productos y servicios" }),
  ).toBeVisible();
});
test("protección de rutas, origen y credenciales", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page).toHaveURL(/login/);
  const anon = await page.request.get("/api/data/invoices");
  expect(anon.status()).toBe(401);
  const badOrigin = await page.request.post("/api/auth/login", {
    headers: { origin: "https://untrusted.invalid" },
    data: { email: "admin@ejemplo.invalid", password: "incorrect" },
  });
  expect(badOrigin.status()).toBe(403);
  await page.getByLabel("Correo electrónico").fill("admin@ejemplo.invalid");
  await page.getByLabel("Contraseña").fill("incorrect");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByText("Correo o contraseña incorrectos.", { exact: true }),
  ).toBeVisible();
});
