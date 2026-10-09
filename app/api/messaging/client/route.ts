import { context, checkOrigin, AppError } from "@/server/auth";
import { saveMessagingClient } from "@/server/messaging";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await saveMessagingClient(await context(), await request.json()),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "No se pudo guardar el cliente. Revisa el teléfono.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
