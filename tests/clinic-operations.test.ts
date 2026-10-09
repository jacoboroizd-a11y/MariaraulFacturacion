import { test, expect } from "vitest";
import {
  clinicClock,
  isWorkingDay,
  lastWorkingDay,
  holidays,
} from "../lib/clinic-time";
import { normalizePhone } from "../lib/phone";
import { clientsFromCells } from "../server/client-import";
import { validMetaSignature } from "../server/messaging";
import { createHmac } from "node:crypto";
import { googleEventId } from "../server/calendar-sync";
test("horario de caja usa Nicaragua aunque UTC ya cambie de día", () => {
  expect(clinicClock(new Date("2026-10-10T01:59:00Z"))).toMatchObject({
    day: "2026-10-09",
    minutes: 1199,
  });
  expect(clinicClock(new Date("2026-10-10T02:00:00Z"))).toMatchObject({
    day: "2026-10-09",
    minutes: 1200,
  });
  expect(clinicClock(new Date("2026-10-09T14:00:00Z"))).toMatchObject({
    day: "2026-10-09",
    minutes: 480,
  });
});
test("feriados y último día laboral incluyen Semana Santa y descansos configurados", () => {
  expect(holidays(2026).has("2026-04-02")).toBe(true);
  expect(holidays(2026).has("2026-04-03")).toBe(true);
  expect(isWorkingDay("2026-09-15")).toBe(false);
  expect(isWorkingDay("2026-10-10")).toBe(false);
  expect(lastWorkingDay("2026-10")).toBe("2026-10-30");
  expect(lastWorkingDay("2026-10", "2026-10-30")).toBe("2026-10-29");
});
test("teléfonos preservan el país y normalizan Nicaragua por defecto", () => {
  expect(normalizePhone("8888 1111")).toBe("+50588881111");
  expect(normalizePhone("+1 202 555 0123")).toBe("+12025550123");
  expect(normalizePhone("2025550123", "US")).toBe("+12025550123");
  expect(() => normalizePhone("123")).toThrow();
});
test("Excel clientes valida encabezados, teléfonos y correos sin datos médicos", () => {
  const headers = [
    "Nombre y Apellido",
    "Numero de Telefono",
    " Correo Electrónico",
  ];
  const result = clientsFromCells([
    headers,
    ["Ana Pérez", "88881111", "ana@example.invalid"],
    ["Nombre", "123", "x"],
  ]);
  expect(result.rows).toEqual([
    { name: "Ana Pérez", phone: "+50588881111", email: "ana@example.invalid" },
  ]);
  expect(result.errors).toHaveLength(1);
  expect(() => clientsFromCells([["nombre"]])).toThrow();
});
test("webhook rechaza cuerpos alterados y cadenas mal formadas", () => {
  const body = '{"entry":[]}',
    secret = "solo-prueba",
    signature =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  expect(validMetaSignature(body, signature, secret)).toBe(true);
  expect(validMetaSignature(body + " ", signature, secret)).toBe(false);
  expect(validMetaSignature(body, "é".repeat(signature.length), secret)).toBe(
    false,
  );
});
test("cada cita conserva su id Google y está aislada por empresa", () => {
  expect(googleEventId("A", "cita")).toBe(googleEventId("A", "cita"));
  expect(googleEventId("A", "cita")).not.toBe(googleEventId("B", "cita"));
  expect(googleEventId("A", "cita")).toMatch(/^[0-9a-f]+$/);
});
