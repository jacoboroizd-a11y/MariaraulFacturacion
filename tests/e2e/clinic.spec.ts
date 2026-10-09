import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { cleanupCustomer } from "./cleanup";
import { db } from "../../server/db";
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
test("venta clínica: cliente automático, paquete, abono, cita e impresión", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8),
    name = `Cliente clínica ${suffix}`;
  let productId = "";
  let cosmeticId = "";
  let botoxId = "";
  let importRequestId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("admin@ejemplo.invalid");
    await page.getByLabel("Contraseña").fill(process.env.SEED_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/dashboard/);
    const created = await page.request.post("/api/data/products", {
      headers: { origin: baseURL },
      data: {
        name: `Facial ${suffix}`,
        sku: `CLINIC-${suffix}`,
        type: "SERVICE",
        sessions: 3,
        price: "300",
        currency: "NIO",
      },
    });
    expect(created.status()).toBe(200);
    productId = (await created.json()).id;
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Últimos tratamientos facturados" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Próximas citas" }),
    ).toBeVisible();
    const template = await page.request.get("/plantilla-inventario.xlsx");
    expect(template.status()).toBe(200);
    const report = await page.request.get("/api/reports/clinic?month=2026-10");
    expect(report.status()).toBe(200);
    expect(report.headers()["content-disposition"]).toContain(
      "tratamientos-2026-10.xlsx",
    );
    await page.screenshot({
      path: "/workspace/.cloud/clinic-dashboard.png",
      fullPage: true,
    });
    await page.goto("/appointments?month=2026-10");
    await expect(
      page.getByRole("heading", { name: "Citas", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/workspace/.cloud/clinic-appointments-mobile.png",
      animations: "disabled",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/products");
    await expect(page.getByLabel("Archivo del catálogo")).toBeEnabled();
    await page.getByLabel("Archivo del catálogo").setInputFiles({
      name: "catalogo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `nombre,tipo,precio,moneda,sesiones,existencias,cobro,codigo\nBotox ${suffix},tratamiento,200,NIO,1,,unidad,BOTOX-${suffix}\nCrema ${suffix},cosmetico,50,NIO,1,4,fijo,CREMA-${suffix}`,
      ),
    });
    await expect(
      page.getByRole("button", { name: "Guardar 2 artículos" }),
    ).toBeVisible();
    const importRequest = page.waitForRequest(
      (r) =>
        r.method() === "POST" && r.url().endsWith("/api/data/catalog-import"),
    );
    await page.getByRole("button", { name: "Guardar 2 artículos" }).click();
    importRequestId = (await importRequest).postDataJSON().requestId;
    await expect(page.getByText("2 artículos importados")).toBeVisible();
    const allProducts = await (
      await page.request.get("/api/data/products")
    ).json();
    cosmeticId = allProducts.find(
      (p: { sku: string }) => p.sku === `CREMA-${suffix}`,
    ).id;
    botoxId = allProducts.find(
      (p: { sku: string }) => p.sku === `BOTOX-${suffix}`,
    ).id;
    await page.goto("/inventory");
    await expect(
      page.getByRole("button", { name: "Importar productos e inventario" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Archivo del catálogo")).toBeEnabled();
    await page.getByLabel("Archivo del catálogo").setInputFiles({
      name: "inventario.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `nombre,precio,existencias,codigo\nCrema ${suffix},50,4,CREMA-${suffix}`,
      ),
    });
    await expect(
      page.getByRole("button", { name: "Guardar 1 artículos" }),
    ).toBeVisible();
    const inventoryImport = page.waitForRequest(
      (r) =>
        r.method() === "POST" && r.url().endsWith("/api/data/catalog-import"),
    );
    await page.getByRole("button", { name: "Guardar 1 artículos" }).click();
    const inventoryKey = (await inventoryImport).postDataJSON().requestId;
    await expect(page.getByText("1 artículos importados")).toBeVisible();
    await db.auditLog.deleteMany({
      where: {
        action: "CATALOG_IMPORTED",
        metadata: { path: ["requestId"], equals: inventoryKey },
      },
    });
    const stockCard = page
      .getByRole("article")
      .filter({ hasText: `Crema ${suffix}` });
    await stockCard.getByRole("button", { name: "Entrada o ajuste" }).click();
    await page.getByLabel(`Unidades de Crema ${suffix}`).fill("2");
    await stockCard.getByRole("button", { name: "Guardar ajuste" }).click();
    await expect(stockCard.getByText("6", { exact: true })).toBeVisible();
    await page.goto("/sales");
    await page.reload();
    await expect(page.getByLabel("Fecha para pagar el saldo")).toHaveCount(0);
    await page.getByRole("button", { name: "Paquetes", exact: true }).click();
    await page
      .getByRole("button", { name: `Agregar Facial ${suffix}` })
      .click();
    await page.getByLabel("Nombre o teléfono").fill(name);
    await page.getByLabel("Teléfono (opcional)").fill("88881111");
    await page.getByLabel("Cobro", { exact: true }).selectOption("PARTIAL");
    await page.getByLabel(/Abono recibido/).fill("100");
    await expect(page.getByLabel("Fecha para pagar el saldo")).toHaveCount(0);
    await page.getByLabel("Próxima cita (opcional)").fill("2099-03-01T10:00");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/workspace/.cloud/clinic-sale.png",
      fullPage: true,
    });
    const submission = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/api/data/sales"),
    );
    await page
      .getByRole("button", { name: "Guardar y ver comprobante" })
      .click();
    const payload = (await submission).postDataJSON();
    await expect(
      page.getByRole("heading", { name: "Factura guardada" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Imprimir", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Próxima cita", { exact: true })).toBeVisible();
    await expect(page.getByText(/0 de 3 realizadas/)).toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: "Método de pago / abonos" })
        .locator(".."),
    ).toContainText("Efectivo");
    await page.getByLabel("Método de este pago").selectOption("BANK_TRANSFER");
    await page.getByRole("button", { name: "Marcar como pagada" }).click();
    await expect(
      page.getByText("Pagada por completo · Sin saldo pendiente"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { name: "Método de pago / abonos" })
        .locator(".."),
    ).toContainText("Transferencia");
    const viewLink = page.getByRole("link", { name: "Ver venta" });
    const invoiceId = (await viewLink.getAttribute("href"))!.split("/").pop()!;
    const retry = await page.request.post("/api/data/sales", {
      headers: { origin: baseURL },
      data: payload,
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe(invoiceId);
    expect(
      await db.customer.count({ where: { companyId: "demo-nicaragua", name } }),
    ).toBe(1);
    const invoice = await (
      await page.request.get(`/api/data/invoices/${invoiceId}`)
    ).json();
    expect(invoice.amountPaid).toBe("300");
    expect(invoice.balanceDue).toBe("0");
    expect(invoice.nextAppointment).toBe("2099-03-01T16:00:00.000Z");
    const pdf = await page.request.get(`/api/pdf/invoices/${invoiceId}`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    await writeFile(
      "/workspace/.cloud/clinic-invoice-letter.pdf",
      await pdf.body(),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/workspace/.cloud/clinic-invoice.png",
      fullPage: true,
    });
    await viewLink.click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Registrar sesión" }).click();
    await expect(page.getByText(/1 de 3 realizadas/)).toBeVisible();
    await page.goto(`/sessions?q=${encodeURIComponent(name)}`);
    await expect(page.getByText(/1 de 3 realizadas/)).toBeVisible();
    await page.getByLabel(/Próxima cita · Hora/).fill("2099-03-02T09:30");
    await page.getByRole("button", { name: "Guardar cita" }).click();
    await expect(page.getByText(/2 mar 2099/)).toBeVisible();
    await page.goto("/sales");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Nombre o teléfono").fill(name);
    await expect(
      page.getByRole("button", { name: /Usar cliente existente/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Usar cliente existente/ }).click();
    await expect(page.getByText(`Cliente existente: ${name}`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: `Agregar Botox ${suffix}` }).click();
    await page.getByLabel(`Unidades aplicadas de Botox ${suffix}`).fill("20");
    await page.getByRole("button", { name: `Agregar Crema ${suffix}` }).click();
    await expect(page.getByText("C$ 4,050.00").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/workspace/.cloud/clinic-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Guardar y ver comprobante" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Factura guardada" }),
    ).toBeVisible();
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: cosmeticId } })).stock,
    ).toBe(5);
  } finally {
    await cleanupCustomer(name);
    for (const id of [productId, cosmeticId, botoxId].filter(Boolean)) {
      await db.auditLog.deleteMany({
        where: { companyId: "demo-nicaragua", entityId: id },
      });
      await db.product.delete({ where: { id } });
    }
    if (importRequestId)
      await db.auditLog.deleteMany({
        where: {
          companyId: "demo-nicaragua",
          action: "CATALOG_IMPORTED",
          metadata: { path: ["requestId"], equals: importRequestId },
        },
      });
  }
});
