import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../server/db";
test("usuario corto y PIN: facturación sin reportes", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const username = "recepcion-" + randomUUID().slice(0, 8);
  let userId = "";
  let closeId = "";
  try {
    await page.goto("/login");
    await page.getByLabel("Usuario o correo").fill("admin@ejemplo.invalid");
    await page
      .getByLabel("PIN o contraseña")
      .fill(process.env.SEED_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/dashboard/);
    const response = await page.request.post("/api/data/users", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name: username, username, password: "824196", role: "BILLING" },
    });
    expect(response.status()).toBeLessThan(300);
    userId = (await response.json()).id;
    await page.request.post("/api/auth/logout", {
      headers: { Origin: new URL(page.url()).origin },
      data: {},
    });
    await page.goto("/login");
    await page.getByLabel("Usuario o correo").fill(username);
    await page.getByLabel("PIN o contraseña").fill("824196");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/sales/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("img", { name: "Dra. Mariaraúl · Medicina estética" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Reportes", exact: true }),
    ).toHaveCount(0);
    expect(
      (await page.request.get("/api/reports/clinic?month=2026-10")).status(),
    ).toBe(403);
    expect((await page.request.get("/api/data/analytics")).status()).toBe(403);
    await page.goto("/daily-close");
    await page.getByLabel("Efectivo contado NIO").fill("0");
    const closeResponse = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && r.url().endsWith("/api/cash-close"),
    );
    await page
      .getByRole("button", { name: "Entregar cierre para revisión" })
      .click();
    const close = await closeResponse;
    expect(close.status()).toBe(200);
    closeId = (await close.json()).id;
    await expect(
      page.getByRole("status").filter({ hasText: "Cierre entregado" }),
    ).toBeVisible();
    const forbidden = await page.request.post("/api/cash-close", {
      headers: { Origin: new URL(page.url()).origin },
      data: { reviewId: closeId, status: "APPROVED" },
    });
    expect(forbidden.status()).toBe(403);
    await page.goto("/reports");
    await expect(page).toHaveURL(/sales/);
  } finally {
    if (closeId)
      await db.auditLog.deleteMany({
        where: { OR: [{ id: closeId }, { entityId: closeId }] },
      });
    if (userId) {
      await db.session.deleteMany({ where: { userId } });
      await db.membership.deleteMany({ where: { userId } });
      await db.auditLog.deleteMany({ where: { entityId: userId } });
      await db.auditLog.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
  }
});
