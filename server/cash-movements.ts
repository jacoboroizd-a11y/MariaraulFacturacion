import { z } from "zod";
import { authorize, AppError, type Context } from "./auth";
import { transaction } from "./db";
import { assertCashOpen, cashTotals, cashExpenses } from "./cash-register";
import { decimal } from "@/lib/money";
import { clinicClock } from "@/lib/clinic-time";
import { audit } from "./domain";
export async function recordCashMovement(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = z
    .object({
      requestId: z.uuid(),
      amount: z
        .string()
        .regex(/^\d{1,12}(\.\d{1,2})?$/)
        .refine((v) => decimal(v).gt(0)),
      currency: z.enum(["NIO", "USD"]),
      reason: z.string().trim().min(3).max(200),
      purpose: z.string().trim().min(3).max(1000),
      recipient: z.string().trim().max(200).default(""),
    })
    .parse(input);
  return transaction(async (tx) => {
    const previous = await tx.cashMovement.findUnique({
      where: {
        companyId_requestId: {
          companyId: ctx.companyId,
          requestId: data.requestId,
        },
      },
    });
    if (previous) {
      if (
        !previous.amount.equals(data.amount) ||
        previous.currency !== data.currency ||
        previous.reason !== data.reason ||
        previous.purpose !== data.purpose ||
        previous.recipient !== data.recipient
      )
        throw new AppError("Esta salida ya se registró con otros datos.", 409);
      return previous;
    }
    const day = await assertCashOpen(tx, ctx),
      income = await cashTotals(tx, ctx.companyId, clinicClock().day),
      expenses = await cashExpenses(tx, ctx.companyId, day.id),
      opening = data.currency === "NIO" ? day.openingNIO : day.openingUSD;
    const available = decimal(opening.toString())
      .plus(
        income.find((t) => t.method === "CASH" && t.currency === data.currency)
          ?.amount || "0",
      )
      .minus(expenses[data.currency]);
    if (decimal(data.amount).gt(available))
      throw new AppError(
        "La salida supera el efectivo disponible en esta moneda.",
      );
    const result = await tx.cashMovement.create({
      data: {
        ...data,
        companyId: ctx.companyId,
        cashDayId: day.id,
        createdBy: ctx.userId,
      },
    });
    await audit(tx, ctx, "CashMovement", result.id, "CASH_OUT_RECORDED", {
      amount: data.amount,
      currency: data.currency,
    });
    return result;
  }, true);
}
