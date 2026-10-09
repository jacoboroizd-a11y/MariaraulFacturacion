"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Search, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { dateLabel } from "@/lib/utils";
import type { Row } from "@/types/view";
export type StockEvent = {
  id: string;
  name: string;
  date: string;
  quantity: number;
  balance: number;
  reason: string;
  invoiceId?: string;
};
export function Inventory({
  products,
  movements,
  writable,
}: {
  products: Row[];
  movements: StockEvent[];
  writable: boolean;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const shown = products.filter((p) =>
    `${p.name} ${p.sku}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
  );
  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-7">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-700 mb-2">
            COSMÉTICOS
          </p>
          <h1 className="text-3xl font-semibold">Inventario</h1>
          <p className="text-sm text-slate-500 mt-2">
            Cuántas unidades tienes y cómo cambia cada existencia.
          </p>
        </div>
        {writable && (
          <Button asChild>
            <Link href="/products/new">Agregar cosmético</Link>
          </Button>
        )}
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Productos", value: products.length },
          {
            label: "Unidades disponibles",
            value: products.reduce((n, p) => n + (p.stock || 0), 0),
          },
          {
            label: "Sin existencias",
            value: products.filter((p) => !p.stock).length,
          },
        ].map((k) => (
          <div key={k.label} className="panel p-5">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="text-3xl font-semibold mt-2">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="panel p-4 mb-5 relative">
        <Search size={18} className="absolute left-7 top-7 text-slate-400" />
        <Input
          aria-label="Buscar en inventario"
          placeholder="Buscar cosmético…"
          className="pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((p) => (
          <article className="panel p-5" key={p.id}>
            <div className="flex justify-between items-start gap-4">
              <div className="rounded-xl bg-amber-50 text-amber-600 p-3">
                <Package size={24} />
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full ${(p.stock || 0) === 0 ? "bg-red-50 text-red-600" : (p.stock || 0) <= 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {!p.stock
                  ? "Agotado"
                  : (p.stock || 0) <= 5
                    ? "Pocas unidades"
                    : "Disponible"}
              </span>
            </div>
            <h2 className="font-semibold mt-4">{p.name}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {p.sku}
              {!p.active ? " · Inactivo" : ""}
            </p>
            <p className="mt-4">
              <strong className="text-4xl">{p.stock || 0}</strong>
              <span className="text-sm text-slate-500 ml-2">unidades</span>
            </p>
            {writable && (
              <div className="mt-5">
                {selected === p.id ? (
                  <StockAdjustment
                    product={p}
                    close={() => setSelected(null)}
                  />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(p.id)}
                  >
                    <Plus size={14} />
                    Entrada o ajuste
                  </Button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {!shown.length && (
        <p className="panel p-10 text-center text-sm text-slate-500">
          No hay cosméticos para mostrar. Agrega artículos de tipo Cosmético al
          catálogo.
        </p>
      )}
      <div className="panel mt-7 overflow-x-auto">
        <h2 className="font-semibold p-5">Últimos movimientos</h2>
        <table className="table w-full">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Movimiento</th>
              <th>Saldo</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{dateLabel(m.date)}</td>
                <td>{m.name}</td>
                <td
                  className={
                    m.quantity > 0 ? "text-emerald-700" : "text-rose-600"
                  }
                >
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity}
                </td>
                <td>{m.balance}</td>
                <td>
                  {m.invoiceId ? (
                    <Link
                      className="text-emerald-700"
                      href={`/invoices/${m.invoiceId}`}
                    >
                      {m.reason}
                    </Link>
                  ) : (
                    m.reason
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!movements.length && (
          <p className="p-5 text-sm text-slate-400">
            Las entradas, ventas y ajustes aparecerán aquí.
          </p>
        )}
      </div>
    </div>
  );
}
function StockAdjustment({
  product,
  close,
}: {
  product: Row;
  close: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("1"),
    [reason, setReason] = useState("Entrada de mercancía"),
    [kind, setKind] = useState("IN"),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false);
  const submission = useRef<{
    requestId: string;
    quantity: number;
    reason: string;
  } | null>(null);
  const lock = useRef(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        try {
          submission.current ||= {
            requestId: crypto.randomUUID(),
            quantity: Number(quantity) * (kind === "IN" ? 1 : -1),
            reason,
          };
          const response = await fetch(`/api/data/inventory/${product.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submission.current),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status < 500) submission.current = null;
            throw new Error(result.error || "No se pudo guardar el ajuste.");
          }
          toast.success("Inventario actualizado");
          router.refresh();
          close();
        } catch (error) {
          setPending(Boolean(submission.current));
          toast.error((error as Error).message);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
      className="space-y-3"
    >
      <fieldset disabled={busy || pending} className="space-y-3">
        <select
          aria-label={`Tipo de ajuste de ${product.name}`}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setReason(
              e.target.value === "IN"
                ? "Entrada de mercancía"
                : "Ajuste de inventario",
            );
          }}
        >
          <option value="IN">Entrada (+)</option>
          <option value="OUT">Salida / ajuste (−)</option>
        </select>
        <Input
          aria-label={`Unidades de ${product.name}`}
          type="number"
          min="1"
          max="1000000000"
          step="1"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          aria-label={`Motivo para ${product.name}`}
          required
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </fieldset>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy}>
          {kind === "IN" ? <Plus size={14} /> : <Minus size={14} />}
          {busy ? "Guardando…" : pending ? "Reintentar" : "Guardar ajuste"}
        </Button>
        {!pending && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
