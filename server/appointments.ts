import { z } from "zod";
import { transaction } from "./db";
import { authorize, AppError, type Context } from "./auth";
const dateTime = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v + ":00-06:00")) &&
      new Date(Date.parse(v + ":00-06:00") - 21600000)
        .toISOString()
        .slice(0, 16) === v,
  );
const schema = z
  .object({
    requestId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    customerId: z.string().optional(),
    start: dateTime,
    end: dateTime,
    version: z.number().int().optional(),
    cancelled: z.boolean().default(false),
  })
  .refine((v) => v.end > v.start, "La cita debe terminar después de comenzar.");
export async function saveAppointment(
  ctx: Context,
  input: unknown,
  id?: string,
) {
  authorize(ctx);
  const data = schema.parse(input);
  const result = await transaction(async (tx) => {
    if (
      data.customerId &&
      !(await tx.customer.findFirst({
        where: { id: data.customerId, companyId: ctx.companyId },
      }))
    )
      throw new AppError("Cliente no disponible.");
    const existing = await tx.appointment.findFirst({
      where: { id: id || data.requestId, companyId: ctx.companyId },
    });
    if (id && !existing) throw new AppError("Cita no encontrada.", 404);
    const values = {
      title: data.title,
      customerId: data.customerId || null,
      start: new Date(data.start + ":00-06:00"),
      end: new Date(data.end + ":00-06:00"),
      status: data.cancelled ? "CANCELLED" : "ACTIVE",
    };
    if (existing) {
      const same =
        existing.title === values.title &&
        existing.start.getTime() === values.start.getTime() &&
        existing.end.getTime() === values.end.getTime() &&
        existing.status === values.status &&
        existing.customerId === values.customerId;
      if (same) return existing;
      if (!id || existing.version !== data.version)
        throw new AppError(
          "La cita cambió. Recarga antes de modificarla.",
          409,
        );
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data: { ...values, version: { increment: 1 }, syncStatus: "PENDING" },
      });
      if (existing.invoiceId)
        await tx.invoice.update({
          where: { id: existing.invoiceId },
          data: { nextAppointment: data.cancelled ? null : values.start },
        });
      return updated;
    }
    return tx.appointment.create({
      data: { id: data.requestId, companyId: ctx.companyId, ...values },
    });
  }, true);
  return result;
}
