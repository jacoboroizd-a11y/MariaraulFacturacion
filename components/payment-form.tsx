"use client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { api } from "./forms";
import { formatMoney } from "@/lib/money";
import { todayString } from "@/lib/utils";
import type { Row } from "@/types/view";
export function PaymentForm({
  invoices,
  initialInvoice,
}: {
  invoices: Row[];
  initialInvoice?: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(initialInvoice || "");
  const invoice = invoices.find((i) => i.id === invoiceId);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    setValue,
  } = useForm<Record<string, string>>({
    defaultValues: {
      amount: "",
      paymentDate: todayString(),
      method: "BANK_TRANSFER",
      reference: "",
      account: "",
      notes: "",
    },
  });
  return (
    <form
      method="post"
      className="panel p-6 max-w-3xl"
      onSubmit={handleSubmit(async (values) => {
        try {
          const result = await api("payments", {
            ...values,
            invoiceId,
            currency: invoice?.currency,
          });
          toast.success("Pago registrado y recibo generado");
          router.push("/receipts/" + result.receipt.id);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      })}
    >
      <div className="grid md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label htmlFor="invoice">Factura</label>
          <select
            id="invoice"
            value={invoiceId}
            required
            onChange={(e) => {
              setInvoiceId(e.target.value);
              setValue("amount", "");
            }}
          >
            <option value="">Selecciona una factura</option>
            {invoices
              .filter(
                (i) => !["VOID", "DRAFT", "PAID"].includes(i.status || ""),
              )
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.documentNumber} · {i.customer?.name} · Saldo{" "}
                  {formatMoney(i.balanceDue || 0, i.currency)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="amount">
            Monto ({invoice?.currency || "moneda de la factura"})
          </label>
          <Input
            id="amount"
            type="number"
            min="0.01"
            max={invoice?.balanceDue}
            step="0.01"
            required
            {...register("amount")}
          />
        </div>
        <div>
          <label htmlFor="paymentDate">Fecha del pago</label>
          <Input
            id="paymentDate"
            type="date"
            min={invoice?.date?.slice(0, 10)}
            required
            {...register("paymentDate")}
          />
        </div>
        <div>
          <label htmlFor="method">Método</label>
          <select id="method" {...register("method")}>
            <option value="CASH">Efectivo</option>
            <option value="BANK_TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="CHECK">Cheque</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        <div>
          <label htmlFor="reference">Referencia</label>
          <Input id="reference" {...register("reference")} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="account">Cuenta</label>
          <Input id="account" {...register("account")} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="paymentNotes">Notas</label>
          <textarea id="paymentNotes" rows={3} {...register("notes")} />
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button disabled={isSubmitting || !invoice || !hydrated}>
          {isSubmitting ? "Registrando…" : "Registrar pago y generar recibo"}
        </Button>
      </div>
    </form>
  );
}
