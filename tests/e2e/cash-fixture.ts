import { db } from "../../server/db";
import { todayString } from "../../lib/utils";
export async function prepareCash() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "admin@ejemplo.invalid" },
  });
  const companyId = "demo-nicaragua",
    day = new Date(todayString());
  const existing = await db.cashDay.findUnique({
    where: { companyId_day: { companyId, day } },
  });
  if (existing) {
    await db.cashMovement.deleteMany({ where: { cashDayId: existing.id } });
    await db.cashDay.delete({ where: { id: existing.id } });
  }
  await db.reportDelivery.deleteMany({
    where: { companyId, period: todayString() },
  });
  await db.cashDay.create({
    data: {
      companyId,
      day,
      openedBy: user.id,
      openingNIO: "0",
      openingUSD: "0",
    },
  });
}
export async function removeCash() {
  const companyId = "demo-nicaragua";
  const rows = await db.cashDay.findMany({
    where: { companyId, day: new Date(todayString()) },
    select: { id: true },
  });
  await db.cashMovement.deleteMany({
    where: { cashDayId: { in: rows.map((r) => r.id) } },
  });
  await db.cashDay.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await db.reportDelivery.deleteMany({
    where: { companyId, period: todayString() },
  });
}
