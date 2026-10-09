"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DataTable } from "./table";
import { formatMoney } from "@/lib/money";
import { todayString } from "@/lib/utils";
import type { Analytics } from "@/types/view";
export function Reports({ data }: { data: Analytics }) {
  const router = useRouter();
  const [tab, setTab] = useState("sales");
  const [start, setStart] = useState(data.start);
  const [end, setEnd] = useState(data.end);
  const [range, setRange] = useState("THIS_MONTH");
  const ranges: Record<string, string> = {
    TODAY: "Hoy",
    THIS_WEEK: "Esta semana",
    THIS_MONTH: "Este mes",
    LAST_MONTH: "Mes anterior",
    THIS_YEAR: "Este año",
    CUSTOM: "Personalizado",
  };
  function choose(value: string) {
    setRange(value);
    if (value === "CUSTOM") return;
    const now = new Date(todayString());
    let from = new Date(now),
      to = new Date(now);
    if (value === "THIS_WEEK") {
      const day = now.getUTCDay() || 7;
      from = new Date(now.getTime() - (day - 1) * 86400000);
    }
    if (value === "THIS_MONTH")
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (value === "LAST_MONTH") {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    }
    if (value === "THIS_YEAR")
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    setStart(from.toISOString().slice(0, 10));
    setEnd(to.toISOString().slice(0, 10));
  }
  const tabs = [
    { id: "sales", name: "Ventas" },
    { id: "payments", name: "Pagos recibidos" },
    { id: "receivables", name: "Cuentas por cobrar" },
    { id: "overdue", name: "Vencidas" },
    { id: "customers", name: "Por cliente" },
    { id: "products", name: "Por producto" },
    { id: "taxes", name: "Impuestos cobrados" },
  ];
  return (
    <div>
      <div className="panel p-5 flex flex-wrap gap-3 items-center mb-6">
        <select
          aria-label="Período"
          className="w-full sm:w-48"
          value={range}
          onChange={(e) => choose(e.target.value)}
        >
          {Object.entries(ranges).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          aria-label="Inicio del período"
          type="date"
          className="w-full sm:w-44"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            setRange("CUSTOM");
          }}
        />
        <span className="text-xs text-slate-400">hasta</span>
        <Input
          aria-label="Fin del período"
          type="date"
          className="w-full sm:w-44"
          value={end}
          min={start}
          onChange={(e) => {
            setEnd(e.target.value);
            setRange("CUSTOM");
          }}
        />
        <Button
          onClick={() => router.push(`/reports?start=${start}&end=${end}`)}
          disabled={!start || !end || start > end}
        >
          Aplicar período
        </Button>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Ventas del período", value: data.sales },
          { label: "Pagos recibidos", value: data.collected },
          { label: "Saldo pendiente actual", value: data.receivable },
        ].map((s) => (
          <div key={s.label} className="panel p-5">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-semibold mt-4">
              {formatMoney(s.value, data.currency)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap mb-5">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.id)}
          >
            {t.name}
          </Button>
        ))}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        {tab === "receivables" || tab === "overdue"
          ? "Saldos actuales de todas las facturas emitidas."
          : `Período: ${data.start} a ${data.end}.`}{" "}
        Resúmenes en {data.currency}, utilizando el tipo de cambio histórico.
      </p>
      {["sales", "payments", "receivables", "overdue"].includes(tab) ? (
        <DataTable
          kind={tab === "payments" ? "payments" : "invoices"}
          rows={
            tab === "sales"
              ? data.selected
              : tab === "payments"
                ? data.received
                : tab === "overdue"
                  ? data.overdue
                  : data.receivables
          }
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>
                  {tab === "taxes"
                    ? "Tasa aplicada"
                    : tab === "products"
                      ? "Producto / Servicio"
                      : "Cliente"}
                </th>
                {tab === "products" && <th>Cantidad</th>}
                <th>Total ({data.currency})</th>
              </tr>
            </thead>
            <tbody>
              {tab === "taxes"
                ? data.taxes.map((t) => (
                    <tr key={t.rate}>
                      <td>{t.rate}</td>
                      <td>{formatMoney(t.total, data.currency)}</td>
                    </tr>
                  ))
                : tab === "products"
                  ? data.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{p.quantity}</td>
                        <td>{formatMoney(p.total, data.currency)}</td>
                      </tr>
                    ))
                  : data.topCustomers.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{formatMoney(c.total, data.currency)}</td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-4">
        Impuestos cobrados: proporción del impuesto de cada factura
        correspondiente a los pagos recibidos en el período.
      </p>
    </div>
  );
}
