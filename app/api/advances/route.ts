import { context, checkOrigin, AppError } from "@/server/auth";
import { recordAdvance } from "@/server/advances";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(
      await recordAdvance(await context(), await request.json()),
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "Revisa los datos del adelanto.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
