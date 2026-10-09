import { test, expect } from "vitest";
import {
  parseGoogleCalendar,
  validateGoogleCalendarUrl,
  encryptCalendarUrl,
  decryptCalendarUrl,
} from "../server/google-calendar";
const calendar = (events: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//ES\r\n${events}\r\nEND:VCALENDAR`;
test("solo acepta el enlace privado de Google y rechaza otros hosts", () => {
  expect(
    validateGoogleCalendarUrl(
      "https://calendar.google.com/calendar/ical/test%40example.invalid/private-abc123/basic.ics",
    ),
  ).toContain("calendar.google.com");
  for (const url of [
    "http://localhost/calendar",
    "https://calendar.google.com.evil.example/calendar/ical/a/private-abc/basic.ics",
    "https://calendar.google.com/calendar/ical/a/public/basic.ics",
    "https://calendar.google.com:444/calendar/ical/a/private-abc/basic.ics",
  ])
    expect(() => validateGoogleCalendarUrl(url)).toThrow();
});
test("la dirección se cifra y rechaza cambios en el contenido", () => {
  const original = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "clave-exclusiva-para-pruebas-de-calendario-123";
  try {
    const encrypted = encryptCalendarUrl("enlace-privado-de-prueba");
    expect(encrypted).not.toContain("enlace-privado");
    expect(decryptCalendarUrl(encrypted)).toBe("enlace-privado-de-prueba");
    const pieces = encrypted.split(".");
    pieces[2] = Buffer.from("contenido-alterado").toString("base64url");
    expect(() => decryptCalendarUrl(pieces.join("."))).toThrow();
  } finally {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  }
});
test("expande citas recurrentes, respeta cancelaciones y el mes de Nicaragua", () => {
  const events = parseGoogleCalendar(
    calendar(
      `BEGIN:VEVENT
UID:daily
DTSTART:20261001T160000Z
DTEND:20261001T170000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Láser
END:VEVENT
BEGIN:VEVENT
UID:daily
RECURRENCE-ID:20261002T160000Z
DTSTART:20261002T160000Z
DTEND:20261002T170000Z
STATUS:CANCELLED
SUMMARY:Láser
END:VEVENT
BEGIN:VEVENT
UID:previous-month
DTSTART:20261001T010000Z
DTEND:20261001T020000Z
SUMMARY:Septiembre en Nicaragua
END:VEVENT
BEGIN:VEVENT
UID:all-day
DTSTART;VALUE=DATE:20261004
DTEND;VALUE=DATE:20261005
SUMMARY:Evento del día
END:VEVENT`.replaceAll("\n", "\r\n"),
    ),
    "2026-10",
  );
  expect(events.map((e) => e.title)).toEqual([
    "Láser",
    "Láser",
    "Evento del día",
  ]);
  expect(events[2]).toMatchObject({
    allDay: true,
    start: "2026-10-04T06:00:00.000Z",
  });
});

test("respeta la zona horaria del calendario de Managua", () => {
  const events = parseGoogleCalendar(
    calendar(
      `BEGIN:VTIMEZONE
TZID:America/Managua
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:-0600
TZOFFSETTO:-0600
TZNAME:CST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:timezone-test
DTSTART;TZID=America/Managua:20261009T100000
DTEND;TZID=America/Managua:20261009T110000
SUMMARY:Tratamiento estético
END:VEVENT`.replaceAll("\n", "\r\n"),
    ),
    "2026-10",
  );
  expect(events[0].start).toBe("2026-10-09T16:00:00.000Z");
});
