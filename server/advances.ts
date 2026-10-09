import { z } from "zod";
import { authorize, AppError, type Context } from "./auth";
import { transaction } from "./db";
import { assertCashOpen } from "./cash-register";
import { paymentSchema } from "./validation";
import { todayString } from "@/lib/utils";
import { audit } from "./domain";
export async function recordAdvance(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = z
    .object({
      requestId: z.uuid(),
      customerId: z.string().min(1),
      amount: paymentSchema.shape.amount,
      currency: paymentSchema.shape.currency,
      method: paymentSchema.shape.method,
      notes: z.string().trim().max(1000).default(""),
    })
    .parse(input);
  return transaction(async (tx) => {
    const previous = await tx.customerAdvance.findUnique({
      where: {
        companyId_requestId: {
          companyId: ctx.companyId,
          requestId: data.requestId,
        },
      },
    });
    if (previous) {
      if (
        previous.customerId !== data.customerId ||
        !previous.amount.equals(data.amount) ||
        previous.currency !== data.currency ||
        previous.method !== data.method ||
        previous.notes !== data.notes
      )
        throw new AppError(
          "Este adelanto ya fue guardado con otros datos.",
          409,
        );
      return previous;
    }
    await assertCashOpen(tx, ctx);
    if (
      !(await tx.customer.findFirst({
        where: { id: data.customerId, companyId: ctx.companyId, active: true },
      }))
    )
      throw new AppError("Cliente no disponible.");
    const advance = await tx.customerAdvance.create({
      data: {
        ...data,
        companyId: ctx.companyId,
        paymentDate: new Date(todayString()),
      },
    });
    await audit(tx, ctx, "CustomerAdvance", advance.id, "ADVANCE_RECEIVED");
    return advance;
  }, true);
}
