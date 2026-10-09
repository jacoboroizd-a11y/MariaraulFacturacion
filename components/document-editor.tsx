"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { api } from "./forms";
import {
  calculateDocument,
  formatMoney,
  convertCurrency,
  type LineInput,
} from "@/lib/money";
import { todayString } from "@/lib/utils";
import type { Options, Row } from "@/types/view";
const emptyLine = (): LineInput => ({
  description: "",
  quantity: "1",
  unitPrice: "0",
  discountRate: "0",
  taxRate: "0",
});
export function DocumentEditor({
  kind,
  options,
  initial,
}: {
  kind: "invoices" | "quotes";
  options: Options;
  initial?: Row;
}) {
  const router = useRouter();
  const settings = options.company.settings;
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  const [customerQuery, setCustomerQuery] = useState("");
  const [currency, setCurrency] = useState(
    initial?.currency || settings.primaryCurrency,
  );
  const [rate, setRate] = useState(
    initial?.exchangeRate || settings.exchangeRate,
  );
  const [date, setDate] = useState(
    initial?.date?.slice(0, 10) || todayString(),
  );
  const [due, setDue] = useState(
    initial?.dueDate?.slice(0, 10) ||
      new Date(new Date(todayString()).getTime() + 30 * 86400000)
        .toISOString()
        .slice(0, 10),
  );
  const [lines, setLines] = useState<LineInput[]>(
    initial?.items?.map(
      ({
        productId,
        description,
        quantity,
        unitPrice,
        discountRate,
        taxRate,
      }) => ({
        productId,
        description,
        quantity,
        unitPrice,
        discountRate,
        taxRate,
      }),
    ) || [emptyLine()],
  );
  const [discount, setDiscount] = useState(initial?.discountRate || "0");
  const [notes, setNotes] = useState(initial?.notes ?? settings.notes);
  const [terms, setTerms] = useState(initial?.terms ?? settings.terms);
  const [busy, setBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  let computed: ReturnType<typeof calculateDocument> | undefined;
  try {
    computed = calculateDocument(lines, discount);
  } catch {}
  function update(index: number, key: keyof LineInput, value: string) {
    setLines(
      lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    );
  }
  function addProduct(id: string) {
    const product = options.products.find((p) => p.id === id);
    if (!product) return;
    let unitPrice = product.price || "0";
    try {
      unitPrice = convertCurrency(
        unitPrice,
        product.currency || "NIO",
        currency,
        rate,
      );
    } catch {
      toast.error("Corrige el tipo de cambio.");
      return;
    }
    const line: LineInput = {
      productId: id,
      description: product.description || product.name || "",
      quantity: "1",
      unitPrice,
      discountRate: "0",
      taxRate: product.tax?.rate || "0",
    };
    setLines(
      lines.length === 1 && !lines[0].description ? [line] : [...lines, line],
    );
    setProductQuery("");
  }
  async function save(status: string) {
    setBusy(true);
    try {
      const result = await api(
        kind + (initial ? "/" + initial.id : ""),
        {
          customerId,
          date,
          dueDate: kind === "quotes" ? due : date,
          currency,
          exchangeRate: rate,
          items: lines,
          discountRate: discount,
          notes,
          terms,
          status,
        },
        initial ? "PUT" : "POST",
      );
      toast.success("Documento guardado");
      router.push(`/${kind}/${result.id}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Link
        href={"/" + kind}
        className="text-xs text-slate-500 flex items-center gap-2 mb-5"
      >
        <ArrowLeft size={14} />
        Volver al listado
      </Link>
      <div className="flex justify-between items-center mb-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {initial ? "Editar" : kind === "invoices" ? "Nueva" : "Nueva"}{" "}
            {kind === "invoices" ? "factura" : "cotización"}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Completa los detalles. Los totales se calculan al instante.
          </p>
        </div>
      </div>
      <div className="panel p-6">
        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-3">
            <label htmlFor="customerSearch">Buscar cliente</label>
            <Input
              id="customerSearch"
              placeholder="Nombre o RUC…"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
            />
            <select
              className="mt-2"
              aria-label="Cliente"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Selecciona un cliente</option>
              {options.customers
                .filter(
                  (c) =>
                    c.id === customerId ||
                    `${c.name} ${c.ruc}`
                      .toLowerCase()
                      .includes(customerQuery.toLowerCase()),
                )
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} {c.ruc ? `· ${c.ruc}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="date">Fecha</label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {kind === "quotes" && (
            <div>
              <label htmlFor="dueDate">Vencimiento</label>
              <Input
                id="dueDate"
                type="date"
                min={date}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="currency">Moneda</label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>NIO</option>
                <option>USD</option>
              </select>
            </div>
            <div>
              <label htmlFor="exchangeRate">NIO / USD</label>
              <Input
                id="exchangeRate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="mt-7 pt-6 border-t border-slate-100">
          <label htmlFor="productSearch">Agregar producto o servicio</label>
          <div className="relative max-w-xl">
            <Input
              id="productSearch"
              placeholder="Busca por nombre o código…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
            {productQuery && (
              <div className="absolute top-11 w-full border border-slate-200 rounded-lg bg-white shadow-lg z-10 max-h-64 overflow-auto">
                {options.products
                  .filter((p) =>
                    `${p.name} ${p.sku}`
                      .toLowerCase()
                      .includes(productQuery.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      className="flex w-full text-left justify-between p-3 text-sm hover:bg-slate-50"
                      key={p.id}
                      onClick={() => addProduct(p.id)}
                    >
                      <span>
                        {p.name}
                        <small className="block text-slate-400">{p.sku}</small>
                      </span>
                      <span>{formatMoney(p.price || 0, p.currency)}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="overflow-x-auto mt-5">
          <table className="table w-full min-w-[850px]">
            <thead>
              <tr>
                <th className="w-[32%]">Descripción</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Desc. %</th>
                <th>Impuesto %</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <Input
                      aria-label={`Descripción línea ${index + 1}`}
                      value={line.description}
                      onChange={(e) =>
                        update(index, "description", e.target.value)
                      }
                    />
                  </td>
                  {(
                    [
                      "quantity",
                      "unitPrice",
                      "discountRate",
                      "taxRate",
                    ] as const
                  ).map((key) => (
                    <td key={key}>
                      <Input
                        className="min-w-20"
                        type="number"
                        min="0"
                        step={
                          key === "quantity"
                            ? "0.0001"
                            : key === "unitPrice"
                              ? "0.01"
                              : "0.0001"
                        }
                        aria-label={`${key} línea ${index + 1}`}
                        value={line[key]}
                        onChange={(e) => update(index, key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="font-medium whitespace-nowrap tabular-nums">
                    {computed
                      ? formatMoney(computed.items[index].total, currency)
                      : "—"}
                  </td>
                  <td>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar línea ${index + 1}`}
                      onClick={() =>
                        setLines(lines.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          className="mt-4"
          size="sm"
          variant="outline"
          onClick={() => setLines([...lines, emptyLine()])}
        >
          <Plus size={14} />
          Línea personalizada
        </Button>
        <div className="grid md:grid-cols-2 gap-10 mt-8">
          <div className="space-y-5">
            <div>
              <label htmlFor="notes">Notas</label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="terms">Términos y condiciones</label>
              <textarea
                id="terms"
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>
          <div className="bg-slate-50 p-5 rounded-xl space-y-3 self-start text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal</span>
              <span>{formatMoney(computed?.subtotal || 0, currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="discount" className="mb-0">
                Descuento general (%)
              </label>
              <Input
                id="discount"
                className="w-24 h-8"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Descuentos</span>
              <span>
                − {formatMoney(computed?.discountTotal || 0, currency)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Impuestos</span>
              <span>{formatMoney(computed?.taxTotal || 0, currency)}</span>
            </div>
            <div className="border-t border-slate-200 pt-4 flex justify-between font-semibold text-xl">
              <span>Total</span>
              <span>{formatMoney(computed?.total || 0, currency)}</span>
            </div>
            <p className="text-xs text-slate-400">
              El impuesto se aplica después de los descuentos. Los precios no
              incluyen impuestos.
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" disabled={busy} onClick={() => save("DRAFT")}>
          Guardar borrador
        </Button>
        <Button
          disabled={busy || !computed}
          onClick={() =>
            save(
              kind === "invoices"
                ? "PENDING"
                : initial?.status && initial.status !== "DRAFT"
                  ? initial.status
                  : "SENT",
            )
          }
        >
          {busy
            ? "Guardando…"
            : kind === "invoices"
              ? "Emitir factura"
              : "Guardar cotización"}
        </Button>
      </div>
    </div>
  );
}
