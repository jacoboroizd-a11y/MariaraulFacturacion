import { cookies } from "next/headers";
import { context, authorize, AppError } from "@/server/auth";
import {
  encryptCalendarUrl,
  decryptCalendarUrl,
} from "@/server/google-calendar";
import { db } from "@/server/db";
export async function GET(request: Request) {
  try {
    const ctx = await context();
    authorize(ctx, true);
    const jar = await cookies(),
      cookie = jar.get("calendar-oauth")?.value;
    jar.delete("calendar-oauth");
    if (!cookie) throw new AppError("La conexión expiró. Intenta nuevamente.");
    const saved = JSON.parse(decryptCalendarUrl(cookie)),
      url = new URL(request.url);
    if (
      saved.userId !== ctx.userId ||
      saved.companyId !== ctx.companyId ||
      saved.state !== url.searchParams.get("state") ||
      !url.searchParams.get("code")
    )
      throw new AppError("Conexión no autorizada.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: url.searchParams.get("code")!,
        redirect_uri: saved.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new AppError("Google no permitió conectar la cuenta.");
    const tokens = await response.json();
    if (!tokens.refresh_token)
      throw new AppError("Vuelve a autorizar Google con acceso sin conexión.");
    tokens.expires_at = Date.now() + tokens.expires_in * 1000;
    await db.calendarConnection.upsert({
      where: { companyId: ctx.companyId },
      create: {
        companyId: ctx.companyId,
        encryptedTokens: encryptCalendarUrl(JSON.stringify(tokens)),
      },
      update: { encryptedTokens: encryptCalendarUrl(JSON.stringify(tokens)) },
    });
    return Response.redirect(new URL("/settings", request.url));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "No se pudo enlazar Google Calendar.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
