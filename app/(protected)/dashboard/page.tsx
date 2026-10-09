import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Wallet,
  Receipt,
  Users,
  Clock,
  Plus,
} from "lucide-react";
import { pageContext } from "@/server/auth";
import { analytics } from "@/server/queries";
import { formatMoney } from "@/lib/money";
import { todayString, dateLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesChart } from "@/components/chart";
import type { Analytics } from "@/types/view";
import { clinicOverview } from "@/server/clinic-overview";
import { appointmentLabel } from "@/lib/utils";
export default async function Dashboard() {
  const ctx = await pageContext();
  const [a, clinic]: [Analytics, Awaited<ReturnType<typeof clinicOverview>>] =
    await Promise.all([analytics(ctx), clinicOverview(ctx)]);
  const stats = [
    {
      title: "Ventas del mes",
      value: formatMoney(a.sales, a.currency),
      sub: `${a.invoiceCount} facturas emitidas`,
      icon: Receipt,
    },
    {
      title: "Dinero cobrado",
      value: formatMoney(a.collected, a.currency),
      sub: "Pagos recibidos este mes",
      icon: Wallet,
    },
    {
      title: "Cuentas por cobrar",
      value: formatMoney(a.receivable, a.currency),
      sub: "Saldos pendientes de pago",
      icon: Clock,
    },
    {
      title: "Clientes activos",
      value: String(a.customerCount),
      sub: "Relaciones que hacen crecer tu negocio",
      icon: Users,
    },
  ];
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-4 items-start mb-7">
        <div>
          <p className="text-xs text-slate-400 mb-2">
            TU NEGOCIO, EN UN VISTAZO
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-2">
            Hola, {ctx.name.split(" ")[0]}. Así va tu clínica hoy.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-xs text-slate-500 border border-slate-200 bg-white rounded-lg px-3 py-2.5">
            {dateLabel(todayString())}
          </span>
          {ctx.role !== "VIEWER" && (
            <Button asChild>
              <Link href="/sales">
                <Plus size={15} />
                Nueva factura
              </Link>
            </Button>
          )}
        </div>
      </div>
      <section className="panel p-5 mb-6 flex flex-wrap items-center justify-between gap-5">
        <div>
          <h2 className="font-semibold">Reporte mensual de tratamientos</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pacientes, fechas, horas, tratamientos estéticos y láser.
          </p>
        </div>
        <form
          action="/api/reports/clinic"
          className="flex flex-wrap items-center gap-3"
        >
          <input
            type="month"
            name="month"
            aria-label="Mes del reporte"
            defaultValue={todayString().slice(0, 7)}
            required
            className="rounded-xl border border-slate-200 px-3 h-11"
          />
          <Button type="submit" variant="outline">
            Descargar Excel
          </Button>
        </form>
      </section>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div className="panel p-5" key={s.title}>
            <div className="flex justify-between text-slate-500 text-xs">
              <span>{s.title}</span>
              <s.icon size={17} className="text-slate-400" />
            </div>
            <p className="text-2xl font-semibold tracking-tight mt-5 tabular-nums">
              {s.value}
            </p>
            <p className="text-[11px] text-slate-400 mt-3">{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        {[
          {
            label: "Estéticos facturados",
            value: clinic.aesthetic,
            note: "Tratamientos del mes",
          },
          {
            label: "Láser facturados",
            value: clinic.laser,
            note: "Tratamientos del mes",
          },
          {
            label: "Sesiones realizadas",
            value: clinic.performed,
            note: "Visitas registradas este mes",
          },
          {
            label: "Unidades en inventario",
            value: clinic.stock,
            note: `${clinic.outOfStock} productos sin existencias`,
          },
        ].map((s) => (
          <div key={s.label} className="panel p-5">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-semibold mt-3">{s.value}</p>
            <p className="text-xs text-slate-400 mt-2">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="grid xl:grid-cols-[2fr_1fr] gap-5 mt-6">
        <section className="panel p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">Últimos tratamientos facturados</h2>
            <Link href="/sessions" className="text-xs text-emerald-700">
              Ver seguimiento
            </Link>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            {clinic.contracted} sesiones contratadas este mes. Marca cada visita
            como realizada en Sesiones y citas.
          </p>
          <div className="space-y-3">
            {clinic.recent.length ? (
              clinic.recent.map((item) => (
                <Link
                  key={item.id}
                  href={`/invoices/${item.invoiceId}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/60 border border-slate-100 hover:bg-emerald-50/60 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {item.invoice.customer.name} ·{" "}
                      {item.product?.category || "Sin categoría"}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 sm:text-right">
                    <p>{dateLabel(item.invoice.date.toISOString())}</p>
                    <p className="mt-1">
                      {item.sessionsUsed} / {item.sessionsTotal} sesiones
                      realizadas
                    </p>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-500 py-5">
                Los tratamientos aparecerán al guardar tu primera factura.
              </p>
            )}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold mb-4">Próximas citas</h2>
          {clinic.appointments.length ? (
            clinic.appointments.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                className="block py-4 border-b border-slate-100 last:border-0"
              >
                <p className="text-sm font-medium">{invoice.customer.name}</p>
                <p className="text-xs text-emerald-700 mt-2">
                  {appointmentLabel(invoice.nextAppointment!.toISOString())}
                </p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              Aún no hay próximas citas agendadas.
            </p>
          )}
        </section>
      </div>
      <div className="grid xl:grid-cols-[2fr_1fr] gap-5 mt-6">
        <div className="panel p-6">
          <div className="flex justify-between mb-5">
            <div>
              <h2 className="font-semibold text-sm">
                Ventas de los últimos 30 días
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Documentos emitidos · {a.currency}
              </p>
            </div>
            <span className="text-xs text-emerald-700 flex gap-1 items-center">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ventas
            </span>
          </div>
          <SalesChart data={a.chart} currency={a.currency} />
        </div>
        <div className="panel p-6">
          <h2 className="font-semibold text-sm">Ingresos recibidos</h2>
          <p className="text-xs text-slate-400 mt-1">
            Pagos reales, en tu moneda principal
          </p>
          <div className="mt-6 space-y-5">
            {a.days.map((d) => (
              <div
                key={d.days}
                className="pb-5 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Últimos {d.days} días
                  </p>
                  <ArrowUpRight size={16} className="text-emerald-600" />
                </div>
                <p className="text-xl font-semibold mt-2">
                  {formatMoney(d.total, a.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel mt-6 overflow-hidden">
        <div className="p-5 flex justify-between">
          <h2 className="text-sm font-semibold">Facturas recientes</h2>
          <Link
            href="/invoices"
            className="text-xs text-emerald-700 flex items-center gap-2"
          >
            Ver todas
            <ArrowRight size={13} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Saldo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {a.recent.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link
                      className="font-medium text-emerald-800"
                      href={"/invoices/" + i.id}
                    >
                      {i.documentNumber}
                    </Link>
                  </td>
                  <td>{i.customer?.name}</td>
                  <td className="text-slate-500">{dateLabel(i.date || "")}</td>
                  <td className="font-medium">
                    {formatMoney(i.total || 0, i.currency)}
                  </td>
                  <td>{formatMoney(i.balanceDue || 0, i.currency)}</td>
                  <td>
                    <Badge status={i.status || ""} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!a.recent.length && (
            <p className="p-10 text-center text-sm text-slate-400">
              Las facturas emitidas aparecerán aquí.
            </p>
          )}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        {[
          { title: "Principales clientes", items: a.topCustomers },
          { title: "Productos y servicios más vendidos", items: a.topProducts },
        ].map((section) => (
          <div key={section.title} className="panel p-6">
            <h2 className="font-semibold text-sm mb-5">{section.title}</h2>
            {section.items.slice(0, 5).map((item, i) => (
              <div
                key={item.name}
                className="flex gap-3 items-center py-3 border-b border-slate-100 last:border-0"
              >
                <span className="h-7 w-7 rounded-md bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                  {i + 1}
                </span>
                <span className="text-xs flex-1">{item.name}</span>
                <span className="text-xs font-semibold">
                  {formatMoney(item.total, a.currency)}
                </span>
              </div>
            ))}
            {!section.items.length && (
              <p className="text-sm text-slate-400">
                Sin ventas en este período.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-5">
        Las operaciones en moneda secundaria se convierten con el tipo de cambio
        histórico de cada documento.
      </p>
    </div>
  );
}
