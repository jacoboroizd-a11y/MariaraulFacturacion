import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, transaction } from "./db";
import { authorize, type Context, AppError } from "./auth";
import { clinicClock, isWorkingDay } from "@/lib/clinic-time";
import { decimal, amount } from "@/lib/money";
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export async function assertCashOpen(
  tx: Prisma.TransactionClient,
  ctx: Context,
  now = new Date(),
) {
  const clock = clinicClock(now);
  if (clock.minutes < 480 || clock.minutes >= 1200)
    throw new AppError(
      "Caja cerrada. Puedes abrir desde las 08:00 AM hasta antes de las 08:00 PM.",
      409,
    );
  const row = await tx.cashDay.findUnique({
    where: {
      companyId_day: { companyId: ctx.companyId, day: new Date(clock.day) },
    },
  });
  if (!row || row.status !== "OPEN")
    throw new AppError(
      "Realiza la apertura de caja antes de facturar o registrar cobros.",
      409,
    );
  await tx.$queryRaw`SELECT id FROM "CashDay" WHERE id=${row.id} FOR UPDATE`;
  const locked = await tx.cashDay.findUniqueOrThrow({ where: { id: row.id } });
  if (locked.status !== "OPEN")
    throw new AppError("Caja cerrada. Espera la próxima apertura.", 409);
  return locked;
}
export async function openCash(ctx: Context, input: unknown, now = new Date()) {
  authorize(ctx);
  const data = z.object({ NIO: money, USD: money }).parse(input);
  const clock = clinicClock(now);
  const settings = await db.companySettings.findUniqueOrThrow({
    where: { companyId: ctx.companyId },
  });
  if (
    clock.minutes < 480 ||
    clock.minutes >= 1200 ||
    !isWorkingDay(clock.day, settings.holidays)
  )
    throw new AppError(
      "La apertura está disponible en días laborales desde las 08:00 AM.",
      409,
    );
  await autoCloseCash(ctx.companyId, now);
  return transaction(async (tx) => {
    const previous = await tx.cashDay.findUnique({
      where: {
        companyId_day: { companyId: ctx.companyId, day: new Date(clock.day) },
      },
    });
    if (previous) {
      if (
        previous.status === "OPEN" &&
        previous.openingNIO.equals(data.NIO) &&
        previous.openingUSD.equals(data.USD)
      )
        return previous;
      throw new AppError(
        "La caja de hoy ya fue abierta o cerrada. La próxima apertura corresponde al siguiente día laboral.",
        409,
      );
    }
    return tx.cashDay.create({
      data: {
        companyId: ctx.companyId,
        day: new Date(clock.day),
        openedBy: ctx.userId,
        openedAt: now,
        openingNIO: data.NIO,
        openingUSD: data.USD,
      },
    });
  }, true);
}
export async function cashTotals(
  tx: Prisma.TransactionClient,
  companyId: string,
  day: string,
) {
  const [payments, advances] = await Promise.all([
    tx.payment.groupBy({
      by: ["method", "currency"],
      where: {
        companyId,
        deletedAt: null,
        advanceId: null,
        paymentDate: new Date(day),
        invoice: { status: { notIn: ["VOID", "DRAFT"] } },
      },
      _sum: { amount: true },
      _count: true,
    }),
    tx.customerAdvance.groupBy({
      by: ["method", "currency"],
      where: { companyId, paymentDate: new Date(day) },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const totals = new Map<
    string,
    { method: string; currency: string; amount: string; count: number }
  >();
  for (const row of [...payments, ...advances]) {
    const key = row.method + row.currency;
    const prev = totals.get(key);
    totals.set(key, {
      method: row.method,
      currency: row.currency,
      amount: amount(
        decimal(prev?.amount || "0").plus(row._sum.amount?.toString() || "0"),
      ),
      count: (prev?.count || 0) + row._count,
    });
  }
  return [...totals.values()];
}
export async function cashExpenses(
  tx: Prisma.TransactionClient,
  companyId: string,
  cashDayId: string,
) {
  const rows = await tx.cashMovement.groupBy({
    by: ["currency"],
    where: { companyId, cashDayId },
    _sum: { amount: true },
  });
  return {
    NIO:
      rows.find((r) => r.currency === "NIO")?._sum.amount?.toFixed(2) || "0.00",
    USD:
      rows.find((r) => r.currency === "USD")?._sum.amount?.toFixed(2) || "0.00",
  };
}
export async function autoCloseCash(companyId: string, now = new Date()) {
  const clock = clinicClock(now);
  const cutoff = new Date(clock.day);
  const candidates = await db.cashDay.findMany({
    where: {
      companyId,
      status: "OPEN",
      day: clock.minutes >= 1200 ? { lte: cutoff } : { lt: cutoff },
    },
  });
  for (const day of candidates)
    await transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CashDay" WHERE id=${day.id} FOR UPDATE`;
      const current = await tx.cashDay.findUniqueOrThrow({
        where: { id: day.id },
      });
      if (current.status !== "OPEN") return;
      const date = day.day.toISOString().slice(0, 10);
      const received = await cashTotals(tx, companyId, date);
      const expenses = await cashExpenses(tx, companyId, day.id);
      const cash = (currency: "NIO" | "USD") => {
        const opening = currency === "NIO" ? day.openingNIO : day.openingUSD;
        const value =
          received.find((t) => t.method === "CASH" && t.currency === currency)
            ?.amount || "0";
        return {
          opening: opening.toFixed(2),
          received: value,
          out: expenses[currency],
          expected: amount(
            decimal(opening.toString()).plus(value).minus(expenses[currency]),
          ),
          counted: null,
          difference: null,
          remaining: null,
          collectedOnlyExpected: amount(
            decimal(opening.toString()).plus(value).minus(expenses[currency]),
          ),
        };
      };
      await tx.cashDay.update({
        where: { id: day.id },
        data: {
          status: "CLOSED",
          automatic: true,
          closedAt: new Date(date + "T20:00:00-06:00"),
          closedBy: null,
          closeData: {
            day: date,
            automatic: true,
            notes:
              "No se hizo cierre. Efectivo físico y salidas pendientes de conteo.",
            NIO: cash("NIO"),
            USD: cash("USD"),
            received,
          },
        },
      });
      await tx.reportDelivery.upsert({
        where: {
          companyId_kind_period: { companyId, kind: "DAILY", period: date },
        },
        create: { companyId, kind: "DAILY", period: date },
        update: {},
      });
    });
}
export async function cashState(ctx: Context, now = new Date()) {
  authorize(ctx);
  await autoCloseCash(ctx.companyId, now);
  const clock = clinicClock(now);
  const [day, previous, missed, settings] = await Promise.all([
    db.cashDay.findUnique({
      where: {
        companyId_day: { companyId: ctx.companyId, day: new Date(clock.day) },
      },
    }),
    db.cashDay.findFirst({
      where: { companyId: ctx.companyId, day: { lt: new Date(clock.day) } },
      orderBy: { day: "desc" },
    }),
    db.cashDay.count({ where: { companyId: ctx.companyId, automatic: true } }),
    db.companySettings.findUniqueOrThrow({
      where: { companyId: ctx.companyId },
    }),
  ]);
  return {
    day,
    previous,
    missed,
    canOpen:
      !day &&
      clock.minutes >= 480 &&
      clock.minutes < 1200 &&
      isWorkingDay(clock.day, settings.holidays),
    canBill:
      day?.status === "OPEN" && clock.minutes >= 480 && clock.minutes < 1200,
    today: clock.day,
  };
}
