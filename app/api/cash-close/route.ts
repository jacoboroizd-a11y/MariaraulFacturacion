import { context, checkOrigin, AppError } from "@/server/auth";
import { submitCashClose, reviewCashClose } from "@/server/cash-close";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    const data = await request.json();
    return Response.json(
      await (data.reviewId
        ? reviewCashClose(ctx, data)
        : submitCashClose(ctx, data)),
    );
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
