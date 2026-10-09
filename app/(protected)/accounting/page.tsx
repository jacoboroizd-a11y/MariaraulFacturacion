import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { pageContext } from "@/server/auth";
import { financialReport, brands } from "@/server/financial-report";
import { todayString, labels } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; period?: string }>;
}) {
  const ctx = await pageContext();
  if (!["ADMIN", "ACCOUNTANT"].includes(ctx.role)) redirect("/");
  const params = await searchParams;
  const kind = params.kind === "month" ? "MONTHLY" : "DAILY",
    period =
      params.period ||
      (kind === "MONTHLY" ? todayString().slice(0, 7) : todayString());
  let data;
  try {
    data = await financialReport(ctx, kind, period);
  } catch {
    redirect(`/accounting?kind=${kind === "MONTHLY" ? "month" : "day"}`);
  }
  const query = new URLSearchParams({ kind, period });
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-3">
        {kind === "MONTHLY" ? "Reporte mensual" : "Reporte diario"}
      </h1>
      <p className="text-slate-600 mb-6">
        {ctx.name}, aquí puedes consultar y descargar los reportes.
      </p>
      <div className="flex flex-wrap gap-3 mb-6">
        <Button asChild variant={kind === "DAILY" ? "default" : "outline"}>
          <Link href="/accounting?kind=day">
            <FileText size={18} />
            Diarios
          </Link>
        </Button>
        <Button asChild variant={kind === "MONTHLY" ? "default" : "outline"}>
          <Link href="/accounting?kind=month">
            <FileSpreadsheet size={18} />
            Mensuales
          </Link>
        </Button>
      </div>
      <form className="panel p-5 flex flex-wrap items-end gap-4 mb-6">
        <input
          type="hidden"
          name="kind"
          value={kind === "MONTHLY" ? "month" : "day"}
        />
        <label className="block space-y-2">
          <span className="block font-medium">
            {kind === "MONTHLY" ? "Selecciona el mes" : "Selecciona el día"}
          </span>
          <Input
            type={kind === "MONTHLY" ? "month" : "date"}
            name="period"
            defaultValue={period}
            required
          />
        </label>
        <Button>Ver reporte</Button>
        <Button asChild variant="outline">
          <a href={`/api/reports/financial?${query}&format=pdf`}>
            <Download size={18} />
            Descargar PDF
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/reports/financial?${query}&format=xlsx`}>
            <Download size={18} />
            Descargar Excel
          </a>
        </Button>
      </form>
      <div className="grid sm:grid-cols-2 gap-5 mb-6">
        {["NIO", "USD"].map((currency) => (
          <section key={currency} className="panel p-6">
            <h2 className="font-semibold text-lg">
              {currency === "NIO" ? "Córdobas" : "Dólares"}
            </h2>
            <p className="text-sm mt-4">Ventas facturadas</p>
            <p className="text-2xl text-emerald-800 font-semibold">
              {formatMoney(data.sales[currency] || "0", currency)}
            </p>
            <div className="space-y-2 mt-4 text-sm">
              {Object.keys(brands).map((group) => (
                <p key={group} className="flex justify-between gap-3">
                  <span>{brands[group]}</span>
                  <strong>
                    {formatMoney(
                      data.grouping[currency + ":" + group] || "0",
                      currency,
                    )}
                  </strong>
                </p>
              ))}
            </div>
            <h3 className="font-medium mt-6 mb-3">Dinero recibido</h3>
            {["CASH", "CARD", "BANK_TRANSFER", "CHECK", "OTHER"].map(
              (method) => (
                <p key={method} className="flex justify-between py-1 text-sm">
                  <span>{labels[method]}</span>
                  <strong>
                    {formatMoney(
                      data.received[currency + ":" + method] || "0",
                      currency,
                    )}
                  </strong>
                </p>
              ),
            )}
            <p className="text-xs text-slate-600 mt-4">
              Incluye los adelantos recibidos en este periodo; aplicarlos
              después no crea otro ingreso.
            </p>
          </section>
        ))}
      </div>
      <section className="panel p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Cierres de caja</h2>
        {data.cashDays.length === 0 ? (
          <p className="text-slate-600">
            No hay aperturas registradas en este periodo.
          </p>
        ) : (
          data.cashDays.map((day) => {
            const meta = day.closeData as Record<string, unknown> | null;
            return (
              <div key={day.id} className="py-4 border-b last:border-0">
                <h3 className="font-medium">
                  {day.day.toISOString().slice(0, 10)} ·{" "}
                  {day.status === "OPEN"
                    ? "Caja abierta"
                    : day.automatic
                      ? "No se hizo cierre manual"
                      : "Cierre manual"}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  {["NIO", "USD"].map((c) => {
                    const cash = meta?.[c] as
                      Record<string, string | null> | undefined;
                    const value = (k: string) =>
                      cash?.[k] == null ? "Pendiente" : formatMoney(cash[k], c);
                    return (
                      <div key={c} className="text-sm space-y-1">
                        <p>
                          {c} · Apertura:{" "}
                          {formatMoney(
                            c === "NIO"
                              ? day.openingNIO.toString()
                              : day.openingUSD.toString(),
                            c,
                          )}
                        </p>
                        <p>
                          Contado: {value("counted")} · Diferencia:{" "}
                          {value("difference")}
                        </p>
                        <p className="font-semibold text-emerald-800">
                          Queda para mañana: {value("remaining")}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-600 mt-3">
                  {String(meta?.notes || "")} · Revisión: {day.reviewStatus}
                </p>
              </div>
            );
          })
        )}
      </section>
      {ctx.role === "ADMIN" && (
        <p className="text-xs text-slate-600">
          Correo a info@dramariaraul.com:{" "}
          {data.jobs[0]?.status || "Se preparará al cerrar la caja"}.{" "}
          {data.jobs[0]?.lastError}
        </p>
      )}
      <section className="panel p-5 overflow-x-auto">
        <h2 className="font-semibold mb-4">
          Ventas del periodo ({data.invoices.length} facturas)
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Factura</th>
              <th>Paciente</th>
              <th>Tratamiento / producto</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, i) => (
              <tr key={i}>
                <td>
                  {line.day} {line.time}
                </td>
                <td>{line.invoice}</td>
                <td>{line.patient}</td>
                <td>
                  {line.description}
                  <p className="text-xs text-slate-500">{line.brand}</p>
                </td>
                <td>{formatMoney(line.total, line.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
