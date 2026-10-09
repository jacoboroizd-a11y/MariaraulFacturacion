import { context, checkOrigin, AppError } from "@/server/auth";
import { replyMessage } from "@/server/messaging";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await replyMessage(await context(), await request.json()),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "No se pudo guardar el mensaje.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
