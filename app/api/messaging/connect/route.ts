import { context, checkOrigin, AppError } from "@/server/auth";
import { connectMessaging } from "@/server/messaging";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await connectMessaging(await context(), await request.json()),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "Revisa los datos de conexión.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
