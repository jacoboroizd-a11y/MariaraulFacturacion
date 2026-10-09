import { z } from "zod";
import { transaction } from "./db";
import { type Context, authorize, AppError } from "./auth";
import { decimal, amount } from "@/lib/money";
import { todayString } from "@/lib/utils";
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const schema = z.object({
  requestId: z.uuid(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
    ),
  NIO: z.object({ opening: money, out: money, counted: money }),
  USD: z.object({ opening: money, out: money, counted: money }),
  notes: z.string().trim().max(1000).default(""),
});
export type CashCount = {
  opening: string;
  out: string;
  counted: string;
  received: string;
  expected: string;
  difference: string;
};
export type CloseData = {
  day: string;
  NIO: CashCount;
  USD: CashCount;
  notes: string;
  received: {
    method: string;
    currency: string;
    amount: string;
    count: number;
  }[];
};
export async function submitCashClose(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = schema.parse(input);
  if (data.day > todayString())
    throw new AppError("No puedes cerrar una fecha futura.");
  return transaction(async (tx) => {
    const prior = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        entityType: "CashClose",
        entityId: data.requestId,
        action: "CASH_CLOSE_SUBMITTED",
      },
    });
    if (prior) {
      const saved = prior.metadata as unknown as CloseData;
      if (
        prior.userId !== ctx.userId ||
        saved.day !== data.day ||
        ["NIO", "USD"].some((currency) => {
          const c = currency as "NIO" | "USD";
          return ["opening", "out", "counted"].some(
            (key) =>
              amount(saved[c][key as keyof CashCount]) !==
              amount(data[c][key as "opening" | "out" | "counted"]),
          );
        }) ||
        saved.notes !== data.notes
      )
        throw new AppError("Este intento ya se guardó con otros datos.", 409);
      return prior;
    }
    const existing = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        entityType: "CashClose",
        action: "CASH_CLOSE_SUBMITTED",
        metadata: { path: ["day"], equals: data.day },
      },
      orderBy: { timestamp: "desc" },
    });
    if (existing) {
      const review = await tx.auditLog.findFirst({
        where: {
          companyId: ctx.companyId,
          entityType: "CashClose",
          entityId: existing.id,
          action: "CASH_CLOSE_REVIEWED",
        },
        orderBy: { timestamp: "desc" },
      });
      if (
        (review?.metadata as { status?: string } | undefined)?.status !==
        "REJECTED"
      )
        throw new AppError(
          "Ya hay un cierre de este día pendiente o aprobado. Administración debe revisarlo antes de crear otro.",
          409,
        );
    }
    const totals = await tx.payment.groupBy({
      by: ["method", "currency"],
      where: {
        companyId: ctx.companyId,
        deletedAt: null,
        paymentDate: new Date(data.day + "T00:00:00Z"),
        invoice: { status: { notIn: ["VOID", "DRAFT"] } },
      },
      _sum: { amount: true },
      _count: true,
    });
    const cash = (currency: "NIO" | "USD"): CashCount => {
      const counted = data[currency];
      const received = amount(
        totals
          .find((t) => t.method === "CASH" && t.currency === currency)
          ?._sum.amount?.toString() || "0",
      );
      const expected = amount(
        decimal(counted.opening).plus(received).minus(counted.out),
      );
      if (decimal(expected).isNegative())
        throw new AppError("Las salidas superan el efectivo disponible.");
      return {
        ...counted,
        received,
        expected,
        difference: amount(decimal(counted.counted).minus(expected)),
      };
    };
    const metadata: CloseData = {
      day: data.day,
      NIO: cash("NIO"),
      USD: cash("USD"),
      notes: data.notes,
      received: totals.map((t) => ({
        method: t.method,
        currency: t.currency,
        amount: amount(t._sum.amount?.toString() || "0"),
        count: t._count,
      })),
    };
    return tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entityType: "CashClose",
        entityId: data.requestId,
        action: "CASH_CLOSE_SUBMITTED",
        metadata,
      },
    });
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
    const close = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        id: data.reviewId,
        entityType: "CashClose",
        action: "CASH_CLOSE_SUBMITTED",
      },
    });
    if (!close) throw new AppError("Cierre no encontrado.", 404);
    const prior = await tx.auditLog.findFirst({
      where: {
        companyId: ctx.companyId,
        entityType: "CashClose",
        entityId: close.id,
        action: "CASH_CLOSE_REVIEWED",
      },
    });
    if (prior) {
      if ((prior.metadata as { status: string }).status !== data.status)
        throw new AppError("El cierre ya fue revisado.", 409);
      return prior;
    }
    return tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        entityType: "CashClose",
        entityId: close.id,
        action: "CASH_CLOSE_REVIEWED",
        metadata: { status: data.status, notes: data.notes },
      },
    });
  });
}
