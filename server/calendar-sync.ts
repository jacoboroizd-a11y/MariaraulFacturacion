import { createHash } from "node:crypto";
import { db } from "./db";
import { AppError } from "./auth";
import { encryptCalendarUrl, decryptCalendarUrl } from "./google-calendar";
export async function calendarToken(companyId: string) {
  const connection = await db.calendarConnection.findUnique({
    where: { companyId },
  });
  if (!connection?.encryptedTokens) return null;
  const tokens = JSON.parse(decryptCalendarUrl(connection.encryptedTokens)) as {
    access_token: string;
    refresh_token?: string;
    expires_at: number;
  };
  if (tokens.expires_at < Date.now() + 60000) {
    if (
      !tokens.refresh_token ||
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET
    )
      throw new AppError("Vuelve a conectar Google Calendar.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new AppError("Google no permitió actualizar la conexión.");
    const result = await response.json();
    tokens.access_token = result.access_token;
    tokens.expires_at = Date.now() + result.expires_in * 1000;
    await db.calendarConnection.update({
      where: { companyId },
      data: { encryptedTokens: encryptCalendarUrl(JSON.stringify(tokens)) },
    });
  }
  return { token: tokens.access_token, calendarId: connection.calendarId };
}
export const googleEventId = (companyId: string, id: string) =>
  createHash("sha256")
    .update(companyId + ":" + id)
    .digest("hex");
export async function syncAppointments(companyId: string) {
  let credential;
  try {
    credential = await calendarToken(companyId);
  } catch {
    return { connected: true, pending: true };
  }
  if (!credential) return { connected: false, pending: false };
  const appointments = await db.appointment.findMany({
    where: { companyId, syncStatus: { not: "SYNCED" } },
    orderBy: { updatedAt: "asc" },
    take: 30,
  });
  for (const appointment of appointments) {
    try {
      const id =
          appointment.googleEventId || googleEventId(companyId, appointment.id),
        url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credential.calendarId)}/events`,
        headers = {
          Authorization: `Bearer ${credential.token}`,
          "Content-Type": "application/json",
        };
      const existing = await fetch(`${url}/${id}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      const body = {
        summary: appointment.title,
        start: {
          dateTime: appointment.start.toISOString(),
          timeZone: "America/Managua",
        },
        end: {
          dateTime: appointment.end.toISOString(),
          timeZone: "America/Managua",
        },
        status: appointment.status === "CANCELLED" ? "cancelled" : "confirmed",
        extendedProperties: {
          private: {
            mariaraulAppointment: appointment.id,
            mariaraulVersion: String(appointment.version),
          },
        },
      };
      let response;
      if (existing.ok) {
        const remote = await existing.json();
        if (
          Number(remote.extendedProperties?.private?.mariaraulVersion || 0) >
          appointment.version
        )
          continue;
        response = await fetch(`${url}/${id}`, {
          method: "PATCH",
          headers: {
            ...headers,
            ...(remote.etag ? { "If-Match": remote.etag } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
      } else if (existing.status === 404 || existing.status === 410) {
        if (appointment.status === "CANCELLED") {
          await db.appointment.updateMany({
            where: { id: appointment.id, version: appointment.version },
            data: { syncStatus: "SYNCED", syncedVersion: appointment.version },
          });
          continue;
        }
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, id }),
          signal: AbortSignal.timeout(10000),
        });
      } else continue;
      if (response.ok)
        await db.appointment.updateMany({
          where: {
            id: appointment.id,
            companyId,
            version: appointment.version,
          },
          data: {
            googleEventId: id,
            syncStatus: "SYNCED",
            syncedVersion: appointment.version,
          },
        });
    } catch {
      /* Keep LOCAL/PENDING and retry with the same provider event id. */
    }
  }
  return {
    connected: true,
    pending: Boolean(
      await db.appointment.count({
        where: { companyId, syncStatus: { not: "SYNCED" } },
      }),
    ),
  };
}
