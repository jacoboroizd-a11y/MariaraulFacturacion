import { checkOrigin, context, AppError } from "@/server/auth";
import { openCash } from "@/server/cash-register";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json(await openCash(await context(), await request.json()));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "Revisa el efectivo inicial.",
      },
      {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 500,
      },
    );
  }
}
