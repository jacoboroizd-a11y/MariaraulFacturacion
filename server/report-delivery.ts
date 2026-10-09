import { syncAppointments } from "./calendar-sync";
import { createHash } from "node:crypto";
import { db } from "./db";
import { autoCloseCash } from "./cash-register";
import {
  financialData,
  financialExcel,
  financialPDF,
} from "./financial-report";
import { clinicClock, lastWorkingDay } from "@/lib/clinic-time";
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([key, v]) => JSON.stringify(key) + ":" + canonicalJSON(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const recipient = "info@dramariaraul.com";
export async function enqueueReports(companyId: string, now = new Date()) {
  await autoCloseCash(companyId, now);
  const days = await db.cashDay.findMany({
    where: { companyId, status: "CLOSED" },
    select: { day: true },
  });
  for (const day of days) {
    const period = day.day.toISOString().slice(0, 10);
    await db.reportDelivery.upsert({
      where: { companyId_kind_period: { companyId, kind: "DAILY", period } },
      create: { companyId, kind: "DAILY", period },
      update: {},
    });
  }
  const settings = await db.companySettings.findUniqueOrThrow({
    where: { companyId },
  });
  const clock = clinicClock(now);
  // Each completed month is eligible after its last working day closes; supports retries after outages.
  const months = new Set(days.map((d) => d.day.toISOString().slice(0, 7)));
  months.add(clock.day.slice(0, 7));
  for (const month of months) {
    const last = lastWorkingDay(month, settings.holidays);
    const lastCash = days.some(
      (d) => d.day.toISOString().slice(0, 10) === last,
    );
    if (
      clock.day > last ||
      (clock.day === last && (lastCash || clock.minutes >= 1200))
    )
      await db.reportDelivery.upsert({
        where: {
          companyId_kind_period: { companyId, kind: "MONTHLY", period: month },
        },
        create: { companyId, kind: "MONTHLY", period: month },
        update: {},
      });
  }
}
export async function deliverReports(companyId: string) {
  const ready = Boolean(process.env.RESEND_API_KEY && process.env.REPORTS_FROM);
  if (!ready) {
    await db.reportDelivery.updateMany({
      where: { companyId, status: { in: ["PENDING", "FAILED"] } },
      data: {
        lastError:
          "Configura RESEND_API_KEY y REPORTS_FROM con un remitente verificado para activar el envío.",
      },
    });
    return { configured: false, sent: 0 };
  }
  const jobs = await db.reportDelivery.findMany({
    where: { companyId, status: { in: ["PENDING", "FAILED", "SENDING"] } },
    orderBy: { createdAt: "asc" },
    take: 12,
  });
  let sent = 0;
  for (const job of jobs) {
    const now = new Date();
    if (
      job.status === "SENDING" &&
      job.lockedAt &&
      now.getTime() - job.lockedAt.getTime() < 5 * 60000
    )
      continue;
    // Provider idempotency lasts 24 hours. Don't automatically resend an ambiguous request beyond that window.
    if (
      job.attempts > 0 &&
      job.firstAttemptAt &&
      now.getTime() - job.firstAttemptAt.getTime() > 23 * 3600000
    ) {
      await db.reportDelivery.update({
        where: { id: job.id },
        data: {
          status: "REVIEW",
          lastError:
            "Verificar en Resend si el correo fue aceptado antes de reintentar.",
        },
      });
      continue;
    }
    const claim = await db.reportDelivery.updateMany({
      where: { id: job.id, status: job.status, attempts: job.attempts },
      data: {
        status: "SENDING",
        lockedAt: now,
        firstAttemptAt: job.firstAttemptAt || now,
        attempts: { increment: 1 },
        lastError: "",
      },
    });
    if (!claim.count) continue;
    try {
      let payload = job.payload;
      if (!payload) {
        const data = await financialData(companyId, job.kind, job.period);
        const [pdf, xlsx] = await Promise.all([
          financialPDF(data),
          financialExcel(data),
        ]);
        payload = {
          from: process.env.REPORTS_FROM!,
          to: [recipient],
          subject: `Dra. Mariaraúl · ${job.kind === "DAILY" ? "Cierre diario" : "Cierre mensual"} ${job.period}`,
          text: `Reporte ${job.period}. Adjuntos: ventas, pagos, adelantos y cierres. Treat Yourself (cuidado personal) y Dra. Mariaraúl (láser y estética). Los cierres automáticos indican los conteos de efectivo pendientes.`,
          attachments: [
            {
              filename: `reporte-${job.period}.pdf`,
              content: pdf.toString("base64"),
            },
            {
              filename: `reporte-${job.period}.xlsx`,
              content: xlsx.toString("base64"),
            },
          ],
        };
        await db.reportDelivery.update({
          where: { id: job.id },
          data: { payload },
        });
      }
      const key = createHash("sha256")
        .update(`${companyId}:${job.kind}:${job.period}`)
        .digest("hex");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: canonicalJSON(payload),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw Error(`El proveedor respondió ${response.status}.`);
      const result = (await response.json()) as { id?: string };
      if (!result.id) throw Error("El proveedor no confirmó el envío.");
      await db.reportDelivery.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          providerId: result.id,
          sentAt: new Date(),
          lastError: "",
        },
      });
      sent++;
    } catch (error) {
      await db.reportDelivery.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lastError:
            error instanceof Error && /^El proveedor/.test(error.message)
              ? error.message
              : "Envío pendiente. Se reintentará con la misma clave para evitar duplicados.",
        },
      });
    }
  }
  return { configured: true, sent };
}
export async function processClinicReports(companyId: string) {
  await enqueueReports(companyId);
  const result = await deliverReports(companyId);
  await syncAppointments(companyId);
  return result;
}
