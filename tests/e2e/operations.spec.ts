import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { randomUUID, randomInt } from "node:crypto";
import { db } from "../../server/db";
import { todayString } from "../../lib/utils";
import { prepareCash, removeCash } from "./cash-fixture";
async function login(
  page: import("@playwright/test").Page,
  username = "admin@ejemplo.invalid",
  pin = process.env.SEED_ADMIN_PASSWORD!,
) {
  await page.goto("/login");
  await page.getByLabel("Usuario o correo").fill(username);
  await page.getByLabel("PIN o contraseña").fill(pin);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
}
test.beforeEach(async () => {
  await prepareCash();
});
test.afterEach(async () => {
  await removeCash();
});
test("salida de efectivo alimenta cierre y reporte sin reescribir apertura", async ({
  page,
}) => {
  await db.cashDay.update({
    where: {
      companyId_day: {
        companyId: "demo-nicaragua",
        day: new Date(todayString()),
      },
    },
    data: { openingNIO: "100" },
  });
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/daily-close?tab=expenses");
  await page.getByLabel("Monto", { exact: true }).fill("20");
  await page.getByLabel("Motivo", { exact: true }).fill("Compra de insumos");
  await page
    .getByLabel("¿Para qué se utilizará?")
    .fill("Material de limpieza de la clínica");
  await page.getByLabel("Entregado a (opcional)").fill("Proveedor");
  await page.getByRole("button", { name: "Guardar salida" }).click();
  await expect(page.getByRole("status")).toContainText("Salida guardada");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/workspace/.cloud/cash-expenses-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Apertura y cierre", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Fondo inicial NIO")).toHaveValue("100.00");
  await expect(page.getByLabel("Salidas de efectivo NIO")).toHaveValue("20.00");
  await page.getByLabel("Efectivo contado NIO").fill("80");
  await page.getByLabel("Efectivo que queda para mañana NIO").fill("30");
  await page
    .getByRole("button", { name: "Entregar cierre para revisión" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Caja cerrada" }),
  ).toBeVisible();
  const noMore = await page.request.post("/api/cash/movements", {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      requestId: randomUUID(),
      amount: "1",
      currency: "NIO",
      reason: "Insumos",
      purpose: "No se permite",
    },
  });
  expect(noMore.status()).toBe(409);
  await page.goto("/accounting?kind=day");
  await expect(
    page.getByText("Queda para mañana: C$ 30.00", { exact: true }),
  ).toBeVisible();
  const response = await page.request.get(
    `/api/reports/financial?kind=DAILY&period=${todayString()}&format=xlsx`,
  );
  expect(response.status()).toBe(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await response.body()) as unknown as ExcelJS.Buffer);
  expect(
    book.getWorksheet("Salidas de efectivo")!.getRow(2).getCell(5).text,
  ).toBe("Compra de insumos");
});
test("contadora tiene bienvenida sencilla y puede descargar ambos reportes", async ({
  page,
}) => {
  const username = "contadora-" + randomUUID().slice(0, 8);
  let userId = "";
  try {
    await login(page);
    const created = await page.request.post("/api/data/users", {
      headers: { Origin: new URL(page.url()).origin },
      data: {
        name: "Contadora prueba",
        username,
        password: "824196",
        role: "ACCOUNTANT",
      },
    });
    expect(created.status()).toBe(200);
    userId = (await created.json()).id;
    await page.request.post("/api/auth/logout", {
      headers: { Origin: new URL(page.url()).origin },
      data: {},
    });
    await login(page, username, "824196");
    await expect(
      page.getByRole("heading", { name: "Hola, Contadora prueba." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Nueva factura", exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get("/api/data/customers")).status()).toBe(403);
    expect((await page.request.get("/api/data/options")).status()).toBe(403);
    await page.getByRole("link", { name: /Reporte diario Consulta/ }).click();
    await expect(
      page.getByRole("heading", { name: "Reporte diario", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/workspace/.cloud/accountant-mobile.png",
      fullPage: true,
    });
    for (const [kind, period] of [
      ["DAILY", todayString()],
      ["MONTHLY", todayString().slice(0, 7)],
    ])
      for (const format of ["pdf", "xlsx"]) {
        const report = await page.request.get(
          `/api/reports/financial?kind=${kind}&period=${period}&format=${format}`,
        );
        expect(report.status()).toBe(200);
        expect(report.headers()["content-disposition"]).toContain("attachment");
      }
    await page.goto("/products");
    await expect(page).toHaveURL(/accounting/);
  } finally {
    if (userId) {
      await db.session.deleteMany({ where: { userId } });
      await db.membership.deleteMany({ where: { userId } });
      await db.auditLog.deleteMany({
        where: { OR: [{ userId }, { entityId: userId }] },
      });
      await db.user.delete({ where: { id: userId } });
    }
  }
});
test("importación Excel de clientes revisa y omite duplicados", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8),
    name = "Paciente importado " + suffix,
    phone = "+5058" + randomInt(1000000, 9999999);
  let requestId = "";
  try {
    await login(page);
    await page.goto("/customers");
    await page
      .getByText("Importar clientes desde Excel", { exact: true })
      .click();
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Clientes");
    sheet.addRows([
      ["Nombre y Apellido", "Numero de Telefono", "Correo Electrónico"],
      [name, phone, suffix + "@example.invalid"],
      ["Duplicado", phone, ""],
    ]);
    await expect(page.getByLabel("Seleccionar Excel")).toBeEnabled();
    await page
      .getByLabel("Seleccionar Excel")
      .setInputFiles({
        name: "clientes.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(await book.xlsx.writeBuffer()),
      });
    await expect(
      page.getByRole("cell", { name: "Ya registrado", exact: true }),
    ).toBeVisible();
    const submitted = page.waitForRequest(
      (r) =>
        r.url().endsWith("/api/clients/import") &&
        r.headers()["content-type"]?.includes("application/json"),
    );
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    requestId = (await submitted).postDataJSON().requestId;
    await expect(page.getByRole("status")).toContainText(
      "1 clientes creados · 1 duplicados omitidos",
    );
    const customer = await db.customer.findFirst({
      where: { companyId: "demo-nicaragua", phone },
    });
    expect(customer?.name).toBe(name);
    expect((await page.request.get("/plantilla-clientes.xlsx")).status()).toBe(
      200,
    );
  } finally {
    await db.customer.deleteMany({
      where: { companyId: "demo-nicaragua", phone },
    });
    if (requestId)
      await db.auditLog.deleteMany({
        where: {
          companyId: "demo-nicaragua",
          action: "CLIENTS_IMPORTED",
          metadata: { path: ["requestId"], equals: requestId },
        },
      });
  }
});
