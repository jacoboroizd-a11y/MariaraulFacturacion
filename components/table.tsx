"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  FilePlus2,
} from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { formatMoney, decimal } from "@/lib/money";
import { labels, dateLabel } from "@/lib/utils";
import type { Row } from "@/types/view";
const titles: Record<string, string> = {
  customers: "clientes",
  products: "productos",
  quotes: "cotizaciones",
  invoices: "facturas",
  payments: "pagos",
  receipts: "recibos",
  users: "usuarios",
  audit: "eventos",
};
export function DataTable({ rows, kind }: { rows: Row[]; kind: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState("date");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);
  const isDocument = ["invoices", "quotes", "receipts"].includes(kind);
  const isPayment = kind === "payments";
  const states = [
    ...new Set(
      rows.map(
        (r) =>
          r.status ||
          (r.active !== undefined
            ? r.active
              ? "Activo"
              : "Inactivo"
            : r.voidedAt
              ? "VOID"
              : ""),
      ),
    ),
  ].filter(Boolean);
  const customers = [
    ...new Set(
      rows.map((r) => r.customer?.name || r.invoice?.customer?.name || ""),
    ),
  ].filter(Boolean);
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => {
          const state =
            r.status ||
            (r.active !== undefined
              ? r.active
                ? "Activo"
                : "Inactivo"
              : r.voidedAt
                ? "VOID"
                : "");
          const c = r.currency || r.payment?.currency || r.invoice?.currency;
          const date = (
            r.date ||
            r.paymentDate ||
            r.createdAt ||
            r.timestamp ||
            ""
          ).slice(0, 10);
          const value =
            r.total || r.amount || r.price || r.payment?.amount || "0";
          return (
            JSON.stringify(r).toLowerCase().includes(q.toLowerCase()) &&
            (!status || state === status) &&
            (!currency || c === currency) &&
            (!customer ||
              (r.customer?.name || r.invoice?.customer?.name) === customer) &&
            (!from || date >= from) &&
            (!to || date <= to) &&
            (!min || decimal(value).gte(min)) &&
            (!max || decimal(value).lte(max))
          );
        })
        .sort((a, b) => {
          let result = 0;
          if (sort === "total")
            result = decimal(
              a.total || a.amount || a.price || a.payment?.amount || 0,
            ).cmp(b.total || b.amount || b.price || b.payment?.amount || 0);
          else if (sort === "name")
            result = (
              a.name ||
              a.documentNumber ||
              a.user?.name ||
              ""
            ).localeCompare(b.name || b.documentNumber || b.user?.name || "");
          else
            result = (
              a.date ||
              a.paymentDate ||
              a.createdAt ||
              a.timestamp ||
              ""
            ).localeCompare(
              b.date || b.paymentDate || b.createdAt || b.timestamp || "",
            );
          return asc ? result : -result;
        }),
    [rows, q, status, currency, customer, from, to, min, max, sort, asc],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * 10, current * 10);
  const sortBy = (key: string) => {
    setSort(key);
    setAsc(sort === key ? !asc : true);
  };
  return (
    <div className="panel overflow-hidden">
      <div className="p-5 filter-controls">
        <div className="relative min-w-0">
          <Search size={15} className="absolute top-3 left-3 text-slate-400" />
          <Input
            className="pl-9"
            placeholder={`Buscar ${titles[kind] || kind}…`}
            aria-label="Buscar registros"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {states.length > 0 && (
          <select
            aria-label="Filtrar estado"
            className="w-full"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {labels[s] || s}
              </option>
            ))}
          </select>
        )}
        {(isDocument || isPayment || kind === "products") && (
          <select
            aria-label="Filtrar moneda"
            className="w-full"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">Monedas</option>
            <option>NIO</option>
            <option>USD</option>
          </select>
        )}
        {customers.length > 0 && (
          <select
            aria-label="Filtrar cliente"
            className="w-full"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="">Todos los clientes</option>
            {customers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      {(isDocument || isPayment) && (
        <div className="px-4 pb-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-medium text-slate-600">
          <label className="space-y-2">
            <span className="block">Desde</span>
            <Input
              type="date"
              className="w-full h-11 text-slate-700"
              aria-label="Fecha desde"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="block">Hasta</span>
            <Input
              type="date"
              className="w-full h-11 text-slate-700"
              aria-label="Fecha hasta"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="block">Monto mínimo</span>
            <Input
              className="w-full h-11 text-slate-700"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Monto mínimo"
              aria-label="Monto mínimo"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="block">Monto máximo</span>
            <Input
              className="w-full h-11 text-slate-700"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="Monto máximo"
              aria-label="Monto máximo"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>
                <button
                  className="flex items-center gap-2"
                  onClick={() => sortBy("name")}
                >
                  {isDocument
                    ? "Documento"
                    : isPayment
                      ? "Factura"
                      : kind === "audit"
                        ? "Acción"
                        : "Nombre"}
                  <ArrowUpDown size={12} />
                </button>
              </th>
              {kind === "customers" ? (
                <>
                  <th>RUC / Cédula</th>
                  <th>Contacto</th>
                  <th>Ciudad</th>
                </>
              ) : kind === "products" ? (
                <>
                  <th>SKU / Tipo</th>
                  <th>Categoría</th>
                  <th>
                    <button onClick={() => sortBy("total")}>Precio ↕</button>
                  </th>
                </>
              ) : kind === "users" ? (
                <>
                  <th>Correo</th>
                  <th>Rol</th>
                </>
              ) : kind === "audit" ? (
                <>
                  <th>Entidad</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                </>
              ) : (
                <>
                  <th>Cliente</th>
                  <th>
                    <button onClick={() => sortBy("date")}>Fecha ↕</button>
                  </th>
                  <th>
                    <button onClick={() => sortBy("total")}>Monto ↕</button>
                  </th>
                  {kind === "invoices" && <th>Saldo</th>}
                </>
              )}
              <th>{kind === "payments" ? "Método" : "Estado"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const href = isPayment
                ? `/invoices/${r.invoiceId}`
                : kind === "users" || kind === "audit"
                  ? ""
                  : `/${kind}/${r.id}`;
              return (
                <tr key={r.id}>
                  <td className="font-medium text-slate-800">
                    {href ? (
                      <Link className="hover:text-emerald-700" href={href}>
                        {r.documentNumber ||
                          r.name ||
                          r.invoice?.documentNumber}
                      </Link>
                    ) : kind === "audit" ? (
                      r.action
                    ) : (
                      r.name || r.user?.name
                    )}
                    {kind === "products" && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {r.unit}
                      </p>
                    )}
                  </td>
                  {kind === "customers" ? (
                    <>
                      <td>{r.ruc || "—"}</td>
                      <td>
                        <p>{r.email || "—"}</p>
                        <p className="text-slate-400 text-xs mt-1">{r.phone}</p>
                      </td>
                      <td>{r.city || "—"}</td>
                    </>
                  ) : kind === "products" ? (
                    <>
                      <td>
                        {r.sku}
                        <p className="text-slate-400 text-xs mt-1">
                          {labels[r.type || ""]}
                        </p>
                      </td>
                      <td>{r.category || "—"}</td>
                      <td className="font-medium tabular-nums">
                        {formatMoney(r.price || 0, r.currency)}
                      </td>
                    </>
                  ) : kind === "users" ? (
                    <>
                      <td>{r.user?.email}</td>
                      <td>{labels[r.role || ""]}</td>
                    </>
                  ) : kind === "audit" ? (
                    <>
                      <td>
                        {r.entityType}
                        <p className="text-xs text-slate-400">
                          {r.entityId?.slice(-10)}
                        </p>
                      </td>
                      <td>{r.user?.name}</td>
                      <td>{dateLabel(r.timestamp || "")}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        {r.customer?.name || r.invoice?.customer?.name || "—"}
                      </td>
                      <td className="text-slate-500">
                        {dateLabel(
                          r.date ||
                            r.paymentDate ||
                            r.payment?.paymentDate ||
                            r.createdAt ||
                            "",
                        )}
                      </td>
                      <td className="font-medium tabular-nums">
                        {formatMoney(
                          r.total || r.amount || r.payment?.amount || 0,
                          r.currency ||
                            r.payment?.currency ||
                            r.invoice?.currency,
                        )}
                      </td>
                      {kind === "invoices" && (
                        <td className="tabular-nums">
                          {formatMoney(r.balanceDue || 0, r.currency)}
                        </td>
                      )}
                    </>
                  )}
                  <td>
                    {kind === "payments" ? (
                      labels[r.method || ""]
                    ) : (
                      <Badge
                        status={
                          r.status ||
                          (r.active !== undefined
                            ? r.active
                              ? "Activo"
                              : "Inactivo"
                            : r.voidedAt
                              ? "VOID"
                              : kind === "receipts"
                                ? "Vigente"
                                : "Activo")
                        }
                      />
                    )}
                  </td>
                  <td>
                    {href && (
                      <Link
                        href={href}
                        className="text-xs font-medium text-emerald-700"
                      >
                        Ver →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!shown.length && (
        <div className="p-14 text-center">
          <FilePlus2 className="mx-auto text-slate-300 mb-4" size={32} />
          <p className="font-medium">No hay registros para mostrar</p>
          <p className="text-sm text-slate-400 mt-2">
            Crea el primero o ajusta los filtros de búsqueda.
          </p>
        </div>
      )}
      <div className="p-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
        <span>
          {filtered.length} {titles[kind] || "registros"} · Página {current} de{" "}
          {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Página anterior"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Página siguiente"
            disabled={current === totalPages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
