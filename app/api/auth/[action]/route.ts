import { NextResponse } from "next/server";
import { z } from "zod";
import { login, logout, checkOrigin, AppError } from "@/server/auth";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const isJson = request.headers
    .get("content-type")
    ?.includes("application/json");
  try {
    checkOrigin(request);
    const { action } = await params;
    if (action === "logout") {
      await logout();
      return NextResponse.json({ ok: true });
    }
    if (action !== "login") throw new AppError("No encontrado.", 404);
    const data = z
      .object({
        email: z.string().trim().min(3).max(254),
        password: z.string().min(1).max(128),
      })
      .parse(
        isJson
          ? await request.json()
          : Object.fromEntries(await request.formData()),
      );
    const result = await login(data.email, data.password);
    return isJson
      ? NextResponse.json(result)
      : NextResponse.redirect(new URL("/", request.url), 303);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Datos de acceso inválidos."
            : e instanceof AppError
              ? e.message
              : "No se pudo iniciar sesión.",
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
