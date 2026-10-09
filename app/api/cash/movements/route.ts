import { context, checkOrigin, AppError } from "@/server/auth";
import { recordCashMovement } from "@/server/cash-movements";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await recordCashMovement(await context(), await request.json()),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Revisa el monto, el motivo y el destino de la salida.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
