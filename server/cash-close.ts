import { z } from "zod";
import { transaction } from "./db";
import { type Context, authorize, AppError } from "./auth";
import { decimal, amount } from "@/lib/money";
import { clinicClock } from "@/lib/clinic-time";
import { assertCashOpen, cashTotals, cashExpenses } from "./cash-register";
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const count = z.object({
  opening: money,
  out: money,
  counted: money,
  remaining: money.optional(),
});
const schema = z.object({
  requestId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  NIO: count,
  USD: count,
  notes: z.string().trim().max(1000).default(""),
});
export type CashCount = {
  opening: string;
  out: string;
  counted: string;
  received: string;
  expected: string;
  difference: string;
  remaining: string;
};
export type CloseData = {
  day: string;
  automatic?: boolean;
  NIO: CashCount;
  USD: CashCount;
  notes: string;
  requestId?: string;
  received: {
    method: string;
    currency: string;
    amount: string;
    count: number;
  }[];
};
export async function submitCashClose(
  ctx: Context,
  input: unknown,
  now = new Date(),
) {
  authorize(ctx);
  const data = schema.parse(input);
  return transaction(async (tx) => {
    const day = await tx.cashDay.findUnique({
      where: {
        companyId_day: { companyId: ctx.companyId, day: new Date(data.day) },
      },
    });
    if (day?.status === "CLOSED") {
      const saved = day.closeData as unknown as CloseData;
      if (saved?.requestId === data.requestId) {
        if (
          saved.notes !== data.notes ||
          ["NIO", "USD"].some((c) => {
            const currency = c as "NIO" | "USD";
            return ["out", "counted", "opening", "remaining"].some(
              (key) =>
                amount(saved[currency][key as keyof CashCount]) !==
                amount(
                  data[currency][key as keyof typeof data.NIO] ||
                    data[currency].counted,
                ),
            );
          })
        )
          throw new AppError("El cierre ya se guardó con otros datos.", 409);
        return { id: day.id, metadata: saved };
      }
      throw new AppError(
        "La caja ya está cerrada. No se puede volver a facturar ni abrir hasta el siguiente día laboral.",
        409,
      );
    }
    if (data.day !== clinicClock(now).day)
      throw new AppError("Solo puedes cerrar la caja del día actual.");
    const opened = await assertCashOpen(tx, ctx, now);
    if (
      !opened.openingNIO.equals(data.NIO.opening) ||
      !opened.openingUSD.equals(data.USD.opening)
    )
      throw new AppError(
        "El fondo inicial debe coincidir con la apertura guardada.",
      );
    const totals = await cashTotals(tx, ctx.companyId, data.day);
    const expenses = await cashExpenses(tx, ctx.companyId, opened.id);
    if (
      !decimal(data.NIO.out).equals(expenses.NIO) ||
      !decimal(data.USD.out).equals(expenses.USD)
    )
      throw new AppError(
        "Las salidas cambiaron. Recarga el cierre para incluir todos los movimientos.",
        409,
      );
    const cash = (currency: "NIO" | "USD"): CashCount => {
      const v = data[currency];
      const received =
        totals.find((t) => t.method === "CASH" && t.currency === currency)
          ?.amount || "0";
      const expected = amount(decimal(v.opening).plus(received).minus(v.out));
      if (decimal(expected).isNegative())
        throw new AppError("Las salidas superan el efectivo disponible.");
      const remaining = v.remaining || v.counted;
      if (decimal(remaining).gt(v.counted))
        throw new AppError(
          "El efectivo para mañana no puede superar el efectivo contado.",
        );
      return {
        ...v,
        remaining,
        received,
        expected,
        difference: amount(decimal(v.counted).minus(expected)),
      };
    };
    const metadata: CloseData = {
      day: data.day,
      requestId: data.requestId,
      NIO: cash("NIO"),
      USD: cash("USD"),
      notes: data.notes,
      received: totals,
    };
    await tx.cashDay.update({
      where: { id: opened.id },
      data: {
        status: "CLOSED",
        closedAt: now,
        closedBy: ctx.userId,
        automatic: false,
        closeData: metadata,
      },
    });
    await tx.reportDelivery.upsert({
      where: {
        companyId_kind_period: {
          companyId: ctx.companyId,
          kind: "DAILY",
          period: data.day,
        },
      },
      create: { companyId: ctx.companyId, kind: "DAILY", period: data.day },
      update: {},
    });
    return { id: opened.id, metadata };
  });
}
export async function reviewCashClose(ctx: Context, input: unknown) {
  authorize(ctx, true);
  const data = z
    .object({
      reviewId: z.string().min(1),
      status: z.enum(["APPROVED", "REJECTED"]),
      notes: z.string().trim().max(1000).default(""),
    })
    .parse(input);
  return transaction(async (tx) => {
    const close = await tx.cashDay.findFirst({
      where: { companyId: ctx.companyId, id: data.reviewId, status: "CLOSED" },
    });
    if (!close) throw new AppError("Cierre no encontrado.", 404);
    if (close.reviewStatus !== "PENDING") {
      if (close.reviewStatus === data.status) return close;
      throw new AppError("El cierre ya fue revisado.", 409);
    }
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entityType: "CashDay",
        entityId: close.id,
        action: "CASH_CLOSE_REVIEWED",
        metadata: { status: data.status, notes: data.notes },
      },
    });
    return tx.cashDay.update({
      where: { id: close.id },
      data: {
        reviewStatus: data.status,
        reviewNotes: data.notes,
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
      },
    });
  });
}
