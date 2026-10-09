import { after } from "next/server";
import { processClinicReports } from "@/server/report-delivery";
import { context, checkOrigin, AppError } from "@/server/auth";
import { submitCashClose, reviewCashClose } from "@/server/cash-close";
import { z } from "zod";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    const data = await request.json();
    const result = await (data.reviewId
      ? reviewCashClose(ctx, data)
      : submitCashClose(ctx, data));
    if (!data.reviewId)
      after(async () => {
        try {
          await processClinicReports(ctx.companyId);
        } catch {
          /* Saved delivery jobs retry independently. */
        }
      });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : error instanceof z.ZodError
              ? "Revisa la fecha y los montos (máximo dos decimales)."
              : "No se pudo guardar el cierre. Reintenta con los mismos datos.",
      },
      {
        status:
          error instanceof AppError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
      },
    );
  }
}
