import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { context, authorize, AppError } from "@/server/auth";
import { encryptCalendarUrl } from "@/server/google-calendar";
export async function GET(request: Request) {
  try {
    const ctx = await context();
    authorize(ctx, true);
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
      throw new AppError(
        "Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel para enlazar Google Calendar.",
        503,
      );
    const state = randomBytes(32).toString("hex"),
      redirectUri = new URL(
        "/api/calendar/google/callback",
        request.url,
      ).toString();
    (await cookies()).set(
      "calendar-oauth",
      encryptCalendarUrl(
        JSON.stringify({
          state,
          userId: ctx.userId,
          companyId: ctx.companyId,
          redirectUri,
        }),
      ),
      {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        maxAge: 600,
        path: "/api/calendar/google",
      },
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events",
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return Response.redirect(url);
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "No se pudo conectar." },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
