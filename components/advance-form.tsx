"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Row } from "@/types/view";
export function AdvanceForm({ customers }: { customers: Row[] }) {
  const router = useRouter(),
    request = useRef<object | null>(null);
  const [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="panel p-6 max-w-xl space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        request.current ||= {
          requestId: crypto.randomUUID(),
          customerId: form.get("customerId"),
          amount: form.get("amount"),
          currency: form.get("currency"),
          method: form.get("method"),
          notes: form.get("notes"),
        };
        setBusy(true);
        try {
          const response = await fetch("/api/advances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.current),
          });
          const data = await response.json();
          if (!response.ok) {
            if (response.status < 500) request.current = null;
            throw Error(data.error);
          }
          setMessage(
            "Adelanto registrado. Estará disponible al facturar a este cliente.",
          );
          request.current = null;
          setPending(false);
          router.refresh();
        } catch (e) {
          setMessage((e as Error).message);
          setPending(Boolean(request.current));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-slate-600">
        Registra el dinero recibido antes del tratamiento. Se suma a los cobros
        del día y se descontará del importe por pagar al aplicar el adelanto.
      </p>
      <fieldset disabled={busy || pending} className="space-y-4">
        <label className="block">
          Cliente
          <select name="customerId" required>
            <option value="">Selecciona un cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Monto
            <Input
              name="amount"
              defaultValue="10.00"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            Moneda
            <select name="currency">
              <option value="USD">Dólares</option>
              <option value="NIO">Córdobas</option>
            </select>
          </label>
        </div>
        <label className="block">
          Método de pago
          <select name="method">
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="BANK_TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
        <label className="block">
          Nota (opcional)
          <Input name="notes" maxLength={1000} />
        </label>
      </fieldset>
      <Button disabled={busy}>
        {busy
          ? "Guardando…"
          : pending
            ? "Reintentar registro"
            : "Guardar adelanto"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
