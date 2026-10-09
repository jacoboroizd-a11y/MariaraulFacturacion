import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { monthRange } from "@/server/clinic-overview";
import { todayString, appointmentLabel } from "@/lib/utils";
import { AppointmentForm } from "@/components/clinic-followup";
import { Button } from "@/components/ui/button";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const ctx = await pageContext();
  const params = await searchParams;
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month || "")
    ? params.month!
    : todayString().slice(0, 7);
  const range = monthRange(month);
  const appointments = await db.invoice.findMany({
    where: {
      companyId: ctx.companyId,
      status: { notIn: ["VOID", "DRAFT"] },
      nextAppointment: { gte: range.from, lt: range.to },
    },
    include: { customer: true, items: { orderBy: { position: "asc" } } },
    orderBy: { nextAppointment: "asc" },
  });
  const selectedDay = /^\d{2}$/.test(params.day || "") ? params.day : undefined;
  const date = new Date(month + "-01T12:00:00Z");
  const days = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const offset = (date.getUTCDay() + 6) % 7;
  const shift = (delta: number) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
      .toISOString()
      .slice(0, 7);
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Managua",
      day: "2-digit",
    }).format(d);
  const shown = appointments.filter(
    (a) => !selectedDay || dayOf(a.nextAppointment!) === selectedDay,
  );
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-700 mb-2">
            AGENDA DE LA CLÍNICA
          </p>
          <h1 className="text-3xl font-semibold">Citas</h1>
          <p className="text-sm text-slate-500 mt-2">
            Pacientes, tratamientos y próximas visitas, en hora de Nicaragua.
          </p>
        </div>
        {ctx.role !== "VIEWER" && (
          <Button asChild>
            <Link href="/sales">
              <Plus size={16} />
              Facturar y agendar
            </Link>
          </Button>
        )}
      </div>
      <div className="grid xl:grid-cols-[320px_1fr] gap-6 items-start">
        <section className="panel p-5">
          <div className="flex justify-between items-center mb-5">
            <Link
              href={`/appointments?month=${shift(-1)}`}
              aria-label="Mes anterior"
              className="p-2 rounded-lg hover:bg-emerald-50"
            >
              <ChevronLeft size={18} />
            </Link>
            <h2 className="text-sm font-semibold capitalize">
              {date.toLocaleDateString("es-NI", {
                month: "long",
                year: "numeric",
                timeZone: "America/Managua",
              })}
            </h2>
            <Link
              href={`/appointments?month=${shift(1)}`}
              aria-label="Mes siguiente"
              className="p-2 rounded-lg hover:bg-emerald-50"
            >
              <ChevronRight size={18} />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {["L", "M", "M", "J", "V", "S", "D"].map((day, i) => (
              <span key={i} className="text-xs text-slate-400 py-2">
                {day}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = String(i + 1).padStart(2, "0");
              const count = appointments.filter(
                (a) => dayOf(a.nextAppointment!) === day,
              ).length;
              return (
                <Link
                  key={day}
                  href={`/appointments?month=${month}&day=${day}`}
                  aria-label={`${i + 1}, ${count} citas`}
                  className={`rounded-xl py-2 text-sm ${selectedDay === day ? "bg-emerald-800 text-white" : month + "-" + day === todayString() ? "bg-emerald-50 text-emerald-800" : "hover:bg-slate-50"}`}
                >
                  <span>{i + 1}</span>
                  <span
                    className={`block mx-auto mt-1 w-1 h-1 rounded-full ${count ? "bg-emerald-500" : "bg-transparent"}`}
                  />
                </Link>
              );
            })}
          </div>
          <Link
            href={`/appointments?month=${month}`}
            className="block text-center mt-5 text-xs text-emerald-700"
          >
            Ver todas las citas del mes ({appointments.length})
          </Link>
        </section>
        <section className="space-y-4">
          <h2 className="font-semibold">
            {selectedDay ? `Citas del ${selectedDay}` : "Citas del mes"}
          </h2>
          {shown.length ? (
            shown.map((a) => (
              <article key={a.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-emerald-700 flex items-center gap-2">
                      <CalendarDays size={15} />
                      {appointmentLabel(a.nextAppointment!.toISOString())}
                    </p>
                    <h3 className="text-lg font-semibold mt-2">
                      {a.customer.name}
                    </h3>
                    <p className="text-sm text-slate-500 mt-2">
                      {a.items
                        .filter((i) => i.sessionsTotal > 0)
                        .map((i) => i.description)
                        .join(" · ") || "Cita de seguimiento"}
                    </p>
                    {a.customer.phone && (
                      <p className="text-xs text-slate-500 mt-2">
                        {a.customer.phone}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/invoices/${a.id}`}
                    className="text-sm text-emerald-700"
                  >
                    Ver factura
                  </Link>
                </div>
                {ctx.role !== "VIEWER" && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <AppointmentForm
                      invoice={{
                        id: a.id,
                        nextAppointment: a.nextAppointment!.toISOString(),
                      }}
                    />
                  </div>
                )}
              </article>
            ))
          ) : (
            <div className="panel p-8 text-center">
              <CalendarDays size={32} className="mx-auto text-emerald-300" />
              <p className="text-sm text-slate-500 mt-4">
                No hay citas en este periodo.
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Agenda la próxima visita al guardar una factura o desde el
                seguimiento del paciente.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
