"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney } from "@/lib/money";
export type MovementView = {
  id: string;
  amount: string;
  currency: string;
  reason: string;
  purpose: string;
  recipient: string;
  createdAt: string;
};
export function CashMovements({
  canRecord,
  movements,
}: {
  canRecord: boolean;
  movements: MovementView[];
}) {
  const router = useRouter(),
    request = useRef<object | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <div className="panel p-5">
        <h2 className="text-xl font-semibold">Registrar salida de efectivo</h2>
        <p className="text-sm text-slate-600 mt-2 mb-5">
          Las salidas se descuentan automáticamente del efectivo esperado en el
          cierre. No modifican tus ventas.
        </p>
        {canRecord ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const form = e.currentTarget,
                data = new FormData(form);
              request.current ||= {
                requestId: crypto.randomUUID(),
                ...Object.fromEntries(data),
              };
              setBusy(true);
              try {
                const response = await fetch("/api/cash/movements", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(request.current),
                });
                const result = await response.json();
                if (!response.ok) {
                  if (response.status < 500) request.current = null;
                  throw Error(result.error);
                }
                setMessage("Salida guardada e incluida en el cierre.");
                request.current = null;
                setPending(false);
                form.reset();
                router.refresh();
              } catch (e) {
                setMessage((e as Error).message);
                setPending(Boolean(request.current));
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset
              disabled={busy || pending}
              className="grid sm:grid-cols-2 gap-4"
            >
              <label>
                Monto
                <Input
                  name="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                />
              </label>
              <label>
                Moneda
                <select name="currency">
                  <option value="NIO">Córdobas</option>
                  <option value="USD">Dólares</option>
                </select>
              </label>
              <label>
                Motivo
                <Input
                  name="reason"
                  minLength={3}
                  maxLength={200}
                  required
                  placeholder="Ej. Compra de insumos"
                />
              </label>
              <label>
                Entregado a (opcional)
                <Input name="recipient" maxLength={200} />
              </label>
              <label className="sm:col-span-2">
                ¿Para qué se utilizará?
                <textarea
                  name="purpose"
                  minLength={3}
                  maxLength={1000}
                  required
                  placeholder="Detalle del gasto o destino del dinero"
                />
              </label>
            </fieldset>
            <Button disabled={busy}>
              {busy
                ? "Guardando…"
                : pending
                  ? "Reintentar registro"
                  : "Guardar salida"}
            </Button>
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            Abre la caja para registrar salidas. Después del cierre no se pueden
            añadir movimientos.
          </p>
        )}
      </div>
      <div className="panel p-5">
        <h2 className="font-semibold mb-4">Salidas de la jornada</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-slate-600">No hay salidas registradas.</p>
        ) : (
          movements.map((m) => (
            <article key={m.id} className="py-4 border-b last:border-0">
              <div className="flex justify-between gap-3">
                <strong>{m.reason}</strong>
                <strong className="text-emerald-800">
                  {formatMoney(m.amount, m.currency)}
                </strong>
              </div>
              <p className="text-sm text-slate-600 mt-2">{m.purpose}</p>
              <p className="text-xs text-slate-500 mt-2">
                {m.recipient && `Entregado a ${m.recipient} · `}
                {new Date(m.createdAt).toLocaleTimeString("es-NI", {
                  timeZone: "America/Managua",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
