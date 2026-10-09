import { context, checkOrigin, AppError } from "@/server/auth";
import { saveGoogleCalendar } from "@/server/google-calendar";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await saveGoogleCalendar(await context(), await request.json()),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo guardar la conexión.",
      },
      { status: error instanceof AppError ? error.status : 500 },
    );
  }
}
