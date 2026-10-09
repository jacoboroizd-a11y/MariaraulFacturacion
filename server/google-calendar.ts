import ICAL from "ical.js";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { db } from "./db";
import { AppError, authorize, type Context } from "./auth";
import { monthRange } from "./clinic-overview";
import { audit } from "./domain";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};
export function validateGoogleCalendarUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(
      "Pega el enlace público o privado de iCal de Google Calendar.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "calendar.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/calendar\/ical\/[^/]+\/(?:private-[a-zA-Z0-9]+|public)\/basic\.ics$/.test(
      url.pathname,
    )
  )
    throw new AppError(
      "Usa la dirección pública o secreta en formato iCal de Google Calendar (https://calendar.google.com/calendar/ical/…).",
    );
  return url.toString();
}
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "La aplicación necesita configurar su clave de sesión.",
      500,
    );
  return createHash("sha256")
    .update("mariaraul-google-calendar:" + secret)
    .digest();
}
export function encryptCalendarUrl(url: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptCalendarUrl(value: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
export function parseGoogleCalendar(
  text: string,
  month: string,
): CalendarEvent[] {
  const { from, to } = monthRange(month);
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== "vcalendar")
    throw new AppError("El enlace no devuelve un calendario válido.");
  for (const component of root.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(new ICAL.Timezone(component));
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 10000)
    throw new AppError(
      "El calendario es demasiado grande. Usa un calendario dedicado a las citas de la clínica.",
    );
  const result: CalendarEvent[] = [];
  for (const component of components) {
    if (
      component.hasProperty("recurrence-id") ||
      component.getFirstPropertyValue("status") === "CANCELLED"
    )
      continue;
    const event = new ICAL.Event(component);
    for (const exception of components.filter(
      (c) =>
        c.hasProperty("recurrence-id") &&
        c.getFirstPropertyValue("uid") === event.uid,
    ))
      event.relateException(exception);
    const add = (start: ICAL.Time, end: ICAL.Time, title: string) => {
      const startDate = start.isDate
        ? new Date(start.toString() + "T00:00:00-06:00")
        : start.toJSDate();
      const endDate = end.isDate
        ? new Date(end.toString() + "T00:00:00-06:00")
        : end.toJSDate();
      if (startDate < to && endDate > from)
        result.push({
          id: event.uid + ":" + startDate.toISOString(),
          title: title || "Cita en Google Calendar",
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          allDay: start.isDate,
        });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator();
      for (let count = 0; ; count++) {
        if (count >= 20000)
          throw new AppError(
            "Hay demasiadas repeticiones. Usa un calendario dedicado a las citas.",
          );
        const occurrence = iterator.next();
        if (!occurrence || occurrence.toJSDate() >= to) break;
        const details = event.getOccurrenceDetails(occurrence);
        if (
          details.item.component.getFirstPropertyValue("status") !== "CANCELLED"
        )
          add(details.startDate, details.endDate, details.item.summary);
      }
    } else add(event.startDate, event.endDate, event.summary);
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
export async function fetchCalendar(url: string) {
  const validated = validateGoogleCalendarUrl(url);
  const publicCalendar = new URL(validated).pathname.includes("/public/");
  let response: Response;
  try {
    response = await fetch(validated, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new AppError(
      "No se pudo conectar con Google Calendar. Reintenta o descarga el archivo .ics y súbelo aquí.",
    );
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 410)
      throw new AppError(
        publicCalendar
          ? "Google no encuentra este calendario público. Comprueba que esté compartido públicamente o usa su dirección secreta de iCal. También puedes subir un archivo .ics."
          : "Google no encuentra este enlace privado. Copia la dirección secreta de iCal actual desde la configuración del calendario. También puedes subir un archivo .ics.",
      );
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        publicCalendar
          ? "Google no permite consultar este calendario públicamente. Revisa sus permisos o usa su dirección secreta de iCal."
          : "Google rechazó el acceso al calendario privado. Copia la dirección secreta de iCal actual o conecta la cuenta de Google.",
      );
    throw new AppError(
      `Google Calendar no está disponible (HTTP ${response.status}). Reintenta o sube un archivo .ics.`,
    );
  }
  if (Number(response.headers.get("content-length") || 0) > 2 * 1024 * 1024)
    throw new AppError("El calendario supera los 2 MB.");
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("Google devolvió un calendario vacío.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new AppError("El calendario supera los 2 MB.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function saveGoogleCalendar(
  ctx: Context,
  input: { url?: unknown; ics?: unknown; calendarId?: unknown },
) {
  authorize(ctx, true);
  if (
    typeof input.ics !== "string" &&
    typeof input.calendarId !== "string" &&
    (typeof input.url !== "string" || input.url.length > 2000)
  )
    throw new AppError("Selecciona un enlace de Google Calendar.");
  if (
    typeof input.calendarId === "string" &&
    input.calendarId.length > 0 &&
    input.calendarId.length < 500
  ) {
    await db.calendarConnection.update({
      where: { companyId: ctx.companyId },
      data: { calendarId: input.calendarId.trim() },
    });
    return { connected: true };
  }
  if (typeof input.ics === "string") {
    if (Buffer.byteLength(input.ics) > 2 * 1024 * 1024)
      throw new AppError("El archivo supera los 2 MB.");
    parseGoogleCalendar(
      input.ics,
      new Date()
        .toLocaleDateString("en-CA", { timeZone: "America/Managua" })
        .slice(0, 7),
    );
    await db.calendarConnection.upsert({
      where: { companyId: ctx.companyId },
      create: {
        companyId: ctx.companyId,
        encryptedUrl: encryptCalendarUrl("icsfile:" + input.ics),
      },
      update: {
        encryptedUrl: encryptCalendarUrl("icsfile:" + input.ics),
        encryptedTokens: "",
      },
    });
    return { connected: true };
  }
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (url) {
    try {
      parseGoogleCalendar(
        await fetchCalendar(url),
        new Date()
          .toLocaleDateString("en-CA", { timeZone: "America/Managua" })
          .slice(0, 7),
      );
    } catch (error) {
      throw new AppError(
        error instanceof AppError
          ? error.message
          : "No se pudo conectar con Google. Revisa el enlace y vuelve a intentarlo.",
      );
    }
  }
  await db.$transaction(async (tx) => {
    if (url)
      await tx.calendarConnection.upsert({
        where: { companyId: ctx.companyId },
        create: {
          companyId: ctx.companyId,
          encryptedUrl: encryptCalendarUrl(url),
        },
        update: { encryptedUrl: encryptCalendarUrl(url), encryptedTokens: "" },
      });
    else
      await tx.calendarConnection.deleteMany({
        where: { companyId: ctx.companyId },
      });
    await audit(
      tx,
      ctx,
      "Company",
      ctx.companyId,
      url ? "GOOGLE_CALENDAR_CONNECTED" : "GOOGLE_CALENDAR_DISCONNECTED",
    );
  });
  return { connected: Boolean(url) };
}
export async function googleCalendarEvents(ctx: Context, month: string) {
  const connection = await db.calendarConnection.findUnique({
    where: { companyId: ctx.companyId },
  });
  if (!connection)
    return { connected: false, events: [] as CalendarEvent[], error: "" };
  try {
    if (connection.encryptedTokens) {
      const { calendarToken } = await import("./calendar-sync");
      const credential = await calendarToken(ctx.companyId);
      if (!credential) throw new Error("Calendar missing");
      const range = monthRange(month),
        url = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credential.calendarId)}/events`,
        );
      url.search = new URLSearchParams({
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        singleEvents: "true",
        maxResults: "2500",
      }).toString();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${credential.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Calendar unavailable");
      const data = await response.json();
      if (data.nextPageToken) throw new Error("Calendar too large");
      return {
        connected: true,
        events: (data.items || [])
          .filter((e: { status: string }) => e.status !== "cancelled")
          .map(
            (e: {
              id: string;
              summary?: string;
              start: { dateTime?: string; date?: string };
              end: { dateTime?: string; date?: string };
            }) => ({
              id: e.id,
              title: e.summary || "Cita",
              start: e.start.dateTime || e.start.date + "T00:00:00-06:00",
              end: e.end.dateTime || e.end.date + "T00:00:00-06:00",
              allDay: !e.start.dateTime,
            }),
          ),
        error: "",
      };
    }
    const source = decryptCalendarUrl(connection.encryptedUrl);
    return {
      connected: true,
      events: parseGoogleCalendar(
        source.startsWith("icsfile:")
          ? source.slice(8)
          : await fetchCalendar(source),
        month,
      ),
      error: "",
    };
  } catch {
    return {
      connected: true,
      events: [] as CalendarEvent[],
      error:
        "No se pudo actualizar Google Calendar. Las citas locales siguen disponibles. Revisa la conexión en Configuración.",
    };
  }
}
