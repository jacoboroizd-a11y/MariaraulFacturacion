"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney, decimal } from "@/lib/money";
import { todayString } from "@/lib/utils";
import type { Row } from "@/types/view";
export function InlinePayment({
  invoice,
  onSaved,
}: {
  invoice: Row;
  onSaved?: () => Promise<void>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState("FULL"),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState("CASH"),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false);
  const submission = useRef<Record<string, string> | null>(null),
    lock = useRef(false);
  if (decimal(invoice.balanceDue || "0").lte(0))
    return (
      <div
        id="cobrar"
        className="panel p-5 mt-6 no-print flex items-center gap-3 text-emerald-800"
      >
        <CheckCircle2 size={24} />
        <p className="font-semibold">
          Pagada por completo · Sin saldo pendiente
        </p>
      </div>
    );
  return (
    <form
      id="cobrar"
      className="panel p-6 mt-6 no-print scroll-mt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        try {
          submission.current ||= {
            requestId: crypto.randomUUID(),
            invoiceId: invoice.id,
            currency: invoice.currency!,
            amount:
              mode === "FULL"
                ? decimal(invoice.balanceDue!).toFixed(2)
                : amount,
            method,
            paymentDate: todayString(),
          };
          const response = await fetch("/api/data/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submission.current),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status < 500) submission.current = null;
            throw new Error(result.error || "No se pudo registrar el pago.");
          }
          if (onSaved) await onSaved();
          submission.current = null;
          setPending(false);
          setAmount("");
          toast.success("Pago guardado. Factura y recibo actualizados.");
          router.refresh();
        } catch (error) {
          setPending(Boolean(submission.current));
          toast.error((error as Error).message);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <div className="flex justify-between flex-wrap gap-3 mb-5">
        <h2 className="font-semibold flex gap-2 items-center">
          <CreditCard size={19} />
          Cobrar esta factura
        </h2>
        <p className="text-sm">
          Saldo:{" "}
          <strong>{formatMoney(invoice.balanceDue!, invoice.currency)}</strong>
        </p>
      </div>
      <fieldset
        disabled={busy || pending}
        className="grid sm:grid-cols-3 gap-4"
      >
        <div>
          <label htmlFor={`pay-mode-${invoice.id}`}>Qué deseas registrar</label>
          <select
            id={`pay-mode-${invoice.id}`}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="FULL">Pago completo del saldo</option>
            <option value="PARTIAL">Abono / adelanto</option>
          </select>
        </div>
        <div>
          <label htmlFor={`pay-method-${invoice.id}`}>
            Método de este pago
          </label>
          <select
            id={`pay-method-${invoice.id}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="BANK_TRANSFER">Transferencia</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        {mode === "PARTIAL" && (
          <div>
            <label htmlFor={`pay-amount-${invoice.id}`}>
              Monto del abono ({invoice.currency})
            </label>
            <Input
              id={`pay-amount-${invoice.id}`}
              required
              type="number"
              min="0.01"
              max={invoice.balanceDue}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        )}
      </fieldset>
      <div className="mt-5 flex flex-wrap justify-between gap-3 items-center">
        <p className="text-xs text-slate-500">
          El pago aparece en esta factura y genera su recibo.
        </p>
        <Button disabled={busy}>
          {busy
            ? "Guardando…"
            : pending
              ? "Reintentar pago"
              : mode === "FULL"
                ? "Marcar como pagada"
                : "Guardar abono"}
        </Button>
      </div>
    </form>
  );
}
