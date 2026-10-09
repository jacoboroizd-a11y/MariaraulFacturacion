import { after } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { googleCalendarEvents } from "@/server/google-calendar";
import { syncAppointments } from "@/server/calendar-sync";
import { monthRange } from "@/server/clinic-overview";
import { todayString, appointmentLabel } from "@/lib/utils";
import { serialize } from "@/server/queries";
import { AppointmentEditor } from "@/components/appointment-editor";
import { Button } from "@/components/ui/button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const ctx = await pageContext();
  if (!["ADMIN", "BILLING"].includes(ctx.role)) redirect("/");
  const params = await searchParams,
    month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month || "")
      ? params.month!
      : todayString().slice(0, 7),
    range = monthRange(month);
  after(() => syncAppointments(ctx.companyId));
  const [appointments, google, customers] = await Promise.all([
    db.appointment.findMany({
      where: {
        companyId: ctx.companyId,
        status: "ACTIVE",
        start: { gte: range.from, lt: range.to },
      },
      include: { customer: true },
      orderBy: { start: "asc" },
    }),
    googleCalendarEvents(ctx, month),
    db.customer.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const ids = new Set(appointments.map((a) => a.googleEventId).filter(Boolean));
  const external = google.events.filter(
    (e: { id: string }) => !ids.has(e.id) && !ids.has(e.id.split("@")[0]),
  );
  const dayOf = (value: Date | string) =>
    new Date(new Date(value).getTime() - 21600000).toISOString().slice(8, 10);
  const selected = /^(0[1-9]|[12]\d|3[01])$/.test(params.day || "")
    ? params.day
    : undefined;
  const date = new Date(month + "-01T12:00:00Z"),
    offset = (date.getUTCDay() + 6) % 7,
    days = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
  const shift = (delta: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
      .toISOString()
      .slice(0, 7);
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold">Citas</h1>
          <p className="text-sm text-slate-600 mt-2">
            Agenda de la clínica · Hora de Nicaragua
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link
              href={`/appointments?month=${shift(-1)}`}
              aria-label="Mes anterior"
            >
              ←
            </Link>
          </Button>
          <span className="p-3 font-semibold">{month}</span>
          <Button asChild variant="outline">
            <Link
              href={`/appointments?month=${shift(1)}`}
              aria-label="Mes siguiente"
            >
              →
            </Link>
          </Button>
        </div>
      </div>
      {google.error && (
        <p role="alert" className="text-sm text-amber-800 panel p-4 mb-5">
          {google.error}
        </p>
      )}
      <details className="panel p-5 mb-6">
        <summary className="font-semibold text-emerald-800 cursor-pointer">
          Crear una cita
        </summary>
        <div className="mt-5">
          <AppointmentEditor customers={serialize(customers)} />
        </div>
      </details>
      <section className="panel p-3 sm:p-5 mb-6">
        <div className="grid grid-cols-7 text-center text-xs text-slate-500 pb-3">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: offset }, (_, i) => (
            <span key={`blank${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = String(i + 1).padStart(2, "0"),
              count =
                appointments.filter((a) => dayOf(a.start) === day).length +
                external.filter(
                  (e: { start: string }) => dayOf(e.start) === day,
                ).length;
            return (
              <Link
                key={day}
                href={`/appointments?month=${month}&day=${day}`}
                className={`rounded-xl p-2 sm:p-4 min-h-16 text-center ${selected === day ? "bg-emerald-100 text-emerald-900" : "bg-white/60 hover:bg-emerald-50"}`}
              >
                <span>{i + 1}</span>
                {count > 0 && (
                  <span className="block text-xs text-emerald-700 mt-1">
                    {count} citas
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>
      <h2 className="font-semibold text-lg mb-4">
        {selected ? `Citas del ${selected}/${month.slice(5)}` : "Citas del mes"}
      </h2>
      <div className="space-y-4">
        {appointments
          .filter((a) => !selected || dayOf(a.start) === selected)
          .map((a) => (
            <section key={a.id} className="panel p-5">
              <p className="text-sm text-emerald-800 font-medium">
                {appointmentLabel(a.start.toISOString())}
              </p>
              <h3 className="text-lg font-semibold mt-2">{a.title}</h3>
              <p className="text-sm text-slate-600">{a.customer?.name}</p>
              <p className="text-xs text-slate-500 mt-2">
                {a.syncStatus === "SYNCED"
                  ? "Sincronizada con Google"
                  : google.connected
                    ? "Pendiente de sincronización / ICS solo lectura"
                    : "Cita local · Google sin enlazar"}
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-emerald-800">
                  Mover o editar cita
                </summary>
                <div className="mt-4">
                  <AppointmentEditor
                    customers={serialize(customers)}
                    initial={serialize(a)}
                  />
                </div>
              </details>
            </section>
          ))}
        {external
          .filter(
            (e: { start: string }) => !selected || dayOf(e.start) === selected,
          )
          .map((e: { id: string; start: string; title: string }) => (
            <section key={e.id} className="panel p-5">
              <p className="text-sm text-emerald-800">
                {appointmentLabel(e.start)}
              </p>
              <h3 className="font-semibold mt-2">{e.title}</h3>
              <p className="text-xs text-slate-500 mt-2">
                Google / ICS · Edita este evento en Google Calendar.
              </p>
            </section>
          ))}
      </div>
    </div>
  );
}
