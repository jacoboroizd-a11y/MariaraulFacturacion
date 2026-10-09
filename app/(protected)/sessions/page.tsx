import Link from "next/link";
import { CalendarDays, Layers, ArrowRight } from "lucide-react";
import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { serialize } from "@/server/queries";
import { SessionButton, AppointmentForm } from "@/components/clinic-followup";
import { appointmentLabel } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types/view";
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await pageContext();
  const { q = "" } = await searchParams;
  const invoices: Row[] = serialize(
    await db.invoice.findMany({
      where: {
        companyId: ctx.companyId,
        status: { notIn: ["VOID", "DRAFT"] },
        ...(q
          ? {
              customer: {
                name: { contains: q.slice(0, 200), mode: "insensitive" },
              },
            }
          : {}),
        OR: [
          { items: { some: { sessionsTotal: { gt: 0 } } } },
          { nextAppointment: { not: null } },
        ],
      },
      include: { customer: true, items: { orderBy: { position: "asc" } } },
      orderBy: [
        { nextAppointment: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 100,
    }),
  );
  return (
    <div>
      <div className="mb-7">
        <p className="text-xs font-semibold tracking-widest text-emerald-700 mb-2">
          SEGUIMIENTO
        </p>
        <h1 className="text-3xl font-semibold">Sesiones y citas</h1>
        <p className="text-sm text-slate-500 mt-2">
          Consulta lo contratado, registra cada visita y agenda la siguiente.
        </p>
      </div>
      <form className="panel p-4 mb-5 flex gap-3">
        <input
          aria-label="Buscar cliente para sesiones"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre del cliente…"
          className="flex-1 outline-none text-sm"
        />
        <button className="text-emerald-700 font-medium text-sm">Buscar</button>
      </form>
      <div className="space-y-5">
        {invoices.map((invoice) => (
          <article className="panel p-5 sm:p-6" key={invoice.id}>
            <div className="flex flex-wrap gap-4 justify-between items-center mb-5">
              <div>
                <Link
                  href={`/customers/${invoice.customerId}`}
                  className="font-semibold text-lg"
                >
                  {invoice.customer?.name}
                </Link>
                <p className="text-xs text-slate-400 mt-1">
                  {invoice.documentNumber} ·{" "}
                  {invoice.customer?.phone || "Sin teléfono"}
                </p>
              </div>
              <Link
                href={`/invoices/${invoice.id}`}
                className="flex items-center gap-2 text-sm text-emerald-700"
              >
                Ver factura / abonar <ArrowRight size={15} />
              </Link>
            </div>
            {invoice.nextAppointment && (
              <p className="flex items-center gap-2 text-sm text-emerald-800 mb-4">
                <CalendarDays size={16} />
                {appointmentLabel(invoice.nextAppointment)}
              </p>
            )}
            <div className="space-y-4">
              {invoice.items
                ?.filter((i) => (i.sessionsTotal || 0) > 0)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap gap-4 justify-between items-center rounded-xl bg-slate-50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Layers size={23} className="text-violet-500" />
                      <div>
                        <p className="text-sm font-medium">
                          {item.description}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.sessionsUsed || 0} de {item.sessionsTotal}{" "}
                          realizadas ·{" "}
                          {(item.sessionsTotal || 0) - (item.sessionsUsed || 0)}{" "}
                          disponibles
                        </p>
                      </div>
                    </div>
                    {ctx.role !== "VIEWER" && <SessionButton item={item} />}
                  </div>
                ))}
            </div>
            <div className="mt-5 text-sm flex justify-between">
              <span className="text-slate-500">Saldo pendiente</span>
              <strong>
                {formatMoney(invoice.balanceDue || "0", invoice.currency)}
              </strong>
            </div>
            {ctx.role !== "VIEWER" && (
              <div className="border-t border-slate-100 pt-5 mt-5">
                <AppointmentForm invoice={invoice} />
              </div>
            )}
          </article>
        ))}
      </div>
      {!invoices.length && (
        <div className="panel p-12 text-center">
          <Layers size={32} className="mx-auto text-violet-400 mb-3" />
          <h2 className="font-semibold">
            Aún no hay sesiones o citas para mostrar
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Aparecerán al guardar una venta de tratamiento o una próxima cita.
          </p>
        </div>
      )}
      {invoices.length === 100 && (
        <p className="text-xs text-slate-500 mt-4">
          Se muestran 100 ventas. Busca por cliente para acotar el historial.
        </p>
      )}
    </div>
  );
}
