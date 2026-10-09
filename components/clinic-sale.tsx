"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  ShoppingBag,
  Layers,
  Plus,
  Minus,
  X,
  CheckCircle2,
  Printer,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DocumentView } from "./document-view";
import { InlinePayment } from "./inline-payment";
import { SendDocument } from "./send-document";
import { PrintButton } from "./print-button";
import {
  calculateDocument,
  convertCurrency,
  decimal,
  formatMoney,
} from "@/lib/money";
import type { Options, Row } from "@/types/view";

type CartItem = { productId: string; quantity: number };
export function ClinicSale({ options }: { options: Options }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState<"NIO" | "USD">(
    options.company.settings.primaryCurrency,
  );
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<Row | null>(null);
  const [paymentMode, setPaymentMode] = useState("FULL");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [nextAppointment, setNextAppointment] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Row | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  // Preserve exact payload after an ambiguous network failure, preventing duplicate sales.
  const submission = useRef<{ key: string; payload: unknown } | null>(null);
  const lock = useRef(false);
  const unitPrice = (p: Row) =>
    convertCurrency(
      p.price || "0",
      p.currency || "NIO",
      currency,
      options.company.settings.exchangeRate,
    );
  const lines = cart.map((item) => {
    const product = options.products.find((p) => p.id === item.productId)!;
    return {
      productId: product.id,
      description: product.name || "",
      quantity: String(item.quantity),
      unitPrice: unitPrice(product),
      discountRate: "0",
      taxRate: product.tax?.rate || "0",
    };
  });
  const totals = calculateDocument(lines);
  const incoming =
    paymentMode === "FULL"
      ? totals.total
      : paymentMode === "LATER"
        ? "0"
        : amount || "0";
  let validAmount = true,
    balance = totals.total;
  try {
    balance = decimal(totals.total).minus(incoming).toFixed(2);
    validAmount =
      paymentMode !== "PARTIAL" ||
      (decimal(incoming).gt(0) &&
        decimal(incoming).lt(totals.total) &&
        decimal(incoming).decimalPlaces() <= 2);
  } catch {
    validAmount = false;
  }
  const shown = options.products.filter(
    (p) =>
      (category === "ALL" ||
        (category === "PACKAGES"
          ? p.type === "SERVICE" && (p.sessions || 1) > 1
          : category === "LASER"
            ? p.type === "SERVICE" && /l[aá]ser/i.test(p.category || "")
            : category === "AESTHETIC"
              ? p.type === "SERVICE" && /est[eé]tic/i.test(p.category || "")
              : category === "SERVICE"
                ? p.type === "SERVICE" && (p.sessions || 1) === 1
                : p.type === "PRODUCT")) &&
      `${p.name} ${p.category || ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const matches =
    !customer && clientName.trim().length >= 2
      ? options.customers
          .filter((c) =>
            `${c.name} ${c.phone || ""}`
              .toLocaleLowerCase()
              .includes(clientName.toLocaleLowerCase()),
          )
          .slice(0, 4)
      : [];
  function add(product: Row) {
    const currentQuantity =
      cart.find((i) => i.productId === product.id)?.quantity || 0;
    if (product.type === "PRODUCT" && currentQuantity >= (product.stock || 0)) {
      toast.error("No hay más unidades disponibles.");
      return;
    }
    setCart((current) =>
      current.some((i) => i.productId === product.id)
        ? current.map((i) =>
            i.productId === product.id
              ? { ...i, quantity: Math.min(10000, i.quantity + 1) }
              : i,
          )
        : [...current, { productId: product.id, quantity: 1 }],
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (
      !submission.current &&
      (!cart.length || !validAmount || (!customer && !clientName.trim()))
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      if (!submission.current) {
        const key = crypto.randomUUID();
        submission.current = {
          key,
          payload: {
            checkoutKey: key,
            ...(customer
              ? { customerId: customer.id }
              : {
                  newCustomer: { name: clientName.trim(), phone: phone.trim() },
                }),
            items: cart,
            currency,
            paymentMode,
            amount: amount || "0",
            method,
            nextAppointment,
            notes,
          },
        };
      }
      const saleResponse = await fetch("/api/data/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission.current.payload),
      });
      const invoice = await saleResponse.json();
      if (!saleResponse.ok) {
        if (saleResponse.status >= 400 && saleResponse.status < 500)
          submission.current = null;
        throw new Error(invoice.error || "No se pudo guardar la venta.");
      }
      // The sale may already be committed even if fetching the printable view fails.
      setRetryPending(true);
      const response = await fetch(`/api/data/invoices/${invoice.id}`);
      const document = await response.json();
      if (!response.ok)
        throw new Error(
          document.error ||
            "La venta se guardó. Reintenta para abrir el comprobante.",
        );
      setSaved(document);
      setRetryPending(false);
      toast.success("Factura guardada y cliente registrado");
    } catch (error) {
      toast.error((error as Error).message);
      setRetryPending(Boolean(submission.current));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (saved)
    return (
      <div>
        <div className="no-print panel p-6 mb-6 flex flex-wrap items-center justify-between gap-4 bg-emerald-50">
          <div className="flex gap-3 items-center">
            <CheckCircle2 className="text-emerald-700" size={32} />
            <div>
              <h1 className="text-xl font-semibold">Factura guardada</h1>
              <p className="text-sm text-slate-500 mt-1">
                {saved.documentNumber} · {saved.customer?.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrintButton />
            <Button variant="outline" asChild>
              <Link href={`/invoices/${saved.id}`}>
                Ver venta <ArrowRight size={15} />
              </Link>
            </Button>
            <Button
              onClick={() => {
                submission.current = null;
                setSaved(null);
                setCart([]);
                setClientName("");
                setPhone("");
                setCustomer(null);
                setAmount("");
                setNextAppointment("");
                setNotes("");
                setPaymentMode("FULL");
                router.refresh();
              }}
            >
              Nueva factura
            </Button>
          </div>
        </div>
        <div className="panel p-5 mb-5 no-print">
          <SendDocument row={saved} kind="invoices" />
        </div>
        <DocumentView row={saved} kind="invoices" />
        <InlinePayment
          invoice={saved}
          onSaved={async () => {
            const response = await fetch(`/api/data/invoices/${saved.id}`);
            if (!response.ok)
              throw new Error(
                "El pago se guardó. Reintenta para actualizar el comprobante.",
              );
            setSaved(await response.json());
          }}
        />
      </div>
    );
  return (
    <div>
      <div className="mb-7 flex flex-wrap justify-between gap-4 items-center">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-700 mb-2">
            CLÍNICA Y COSMÉTICOS
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Nueva factura
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Elige, cobra y entrega el comprobante. Todo aquí.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/invoices">
            Historial de ventas <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
      <form onSubmit={save}>
        <fieldset
          disabled={busy || retryPending}
          className="grid xl:grid-cols-[1fr_390px] gap-6 items-start"
        >
          <section className="space-y-5">
            <div className="panel p-5">
              <label htmlFor="catalogSearch" className="sr-only">
                Buscar tratamiento o cosmético
              </label>
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <Input
                  id="catalogSearch"
                  placeholder="Buscar tratamiento o cosmético…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap mt-4">
                {[
                  { id: "ALL", label: "Todo" },
                  { id: "SERVICE", label: "Tratamientos" },
                  { id: "AESTHETIC", label: "Estéticos" },
                  { id: "LASER", label: "Láser" },
                  { id: "PACKAGES", label: "Paquetes" },
                  { id: "PRODUCT", label: "Cosméticos" },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={category === t.id}
                    onClick={() => setCategory(t.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${category === t.id ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {shown.map((p) => {
                const isPackage = p.type === "SERVICE" && (p.sessions || 1) > 1;
                const Icon = isPackage
                  ? Layers
                  : p.type === "SERVICE"
                    ? Sparkles
                    : ShoppingBag;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => add(p)}
                    disabled={p.type === "PRODUCT" && !p.stock}
                    aria-label={`Agregar ${p.name}`}
                    className="panel p-5 text-left hover:border-emerald-500 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div
                      className={`rounded-2xl h-20 flex items-center justify-center mb-4 ${isPackage ? "bg-violet-50 text-violet-600" : p.type === "SERVICE" ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-600"}`}
                    >
                      <Icon size={36} strokeWidth={1.5} />
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                      {isPackage
                        ? `${p.sessions} sesiones`
                        : p.type === "SERVICE"
                          ? "Tratamiento"
                          : "Cosmético"}
                    </p>
                    <h2 className="font-semibold leading-snug min-h-10">
                      {p.name}
                    </h2>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-lg font-semibold text-emerald-800">
                        {formatMoney(unitPrice(p), currency)}
                        {p.pricingMode === "PER_UNIT" && (
                          <span className="block text-xs font-normal">
                            por {p.unit || "unidad"}
                          </span>
                        )}
                      </span>
                      <span className="rounded-full bg-emerald-50 text-emerald-700 p-2 group-hover:bg-emerald-700 group-hover:text-white">
                        <Plus size={18} />
                      </span>
                    </div>
                    {p.type === "PRODUCT" && (
                      <p className="text-xs mt-2 text-slate-500">
                        {p.stock || 0} unidades disponibles
                      </p>
                    )}
                    {p.type === "PRODUCT" && (
                      <p className="text-xs mt-2 text-slate-500">
                        {p.stock || 0} unidades disponibles
                      </p>
                    )}
                    {p.tax && (
                      <p className="text-xs text-slate-400 mt-2">
                        + {p.tax.rate}% de impuesto
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            {!shown.length && (
              <div className="panel p-10 text-center">
                <Sparkles className="mx-auto text-emerald-600 mb-4" size={32} />
                <h2 className="font-semibold">
                  {options.products.length
                    ? "No hay coincidencias"
                    : "Comienza con tu catálogo"}
                </h2>
                <p className="text-sm text-slate-500 mt-2 mb-5">
                  Agrega tus tratamientos, paquetes y cosméticos con su precio.
                </p>
                <Button asChild>
                  <Link href="/products/new">Agregar al catálogo</Link>
                </Button>
              </div>
            )}
            <div className="panel p-5">
              <h2 className="font-semibold mb-4">Cliente</h2>
              <label htmlFor="saleClient">Nombre o teléfono</label>
              <Input
                id="saleClient"
                maxLength={200}
                required={!customer}
                value={clientName}
                placeholder="Escribe el nombre; se registra al guardar"
                onChange={(e) => {
                  setClientName(e.target.value);
                  setCustomer(null);
                }}
              />
              {customer ? (
                <div className="flex items-center justify-between text-sm rounded-lg bg-emerald-50 text-emerald-800 p-3 mt-3">
                  <span>Cliente existente: {customer.name}</span>
                  <button
                    type="button"
                    aria-label="Cambiar cliente"
                    onClick={() => {
                      setCustomer(null);
                      setClientName("");
                      setPhone("");
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mt-2">
                    No necesita registro previo. Su ficha se crea junto con esta
                    factura.
                  </p>
                  {matches.length > 0 && (
                    <div className="mt-3 border rounded-lg divide-y">
                      {matches.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCustomer(c);
                            setClientName(c.name || "");
                            setPhone(c.phone || "");
                          }}
                          className="w-full text-left p-3 hover:bg-emerald-50 text-sm"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-slate-400">
                            {c.phone} · Usar cliente existente
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <label htmlFor="salePhone" className="mt-4">
                    Teléfono (opcional)
                  </label>
                  <Input
                    id="salePhone"
                    type="tel"
                    maxLength={100}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </>
              )}
            </div>
          </section>
          <section className="panel p-5 xl:sticky xl:top-5 space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Tu venta</h2>
              <select
                aria-label="Moneda de la venta"
                className="w-24"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "NIO" | "USD")}
              >
                <option>NIO</option>
                <option>USD</option>
              </select>
            </div>
            {!cart.length && (
              <div className="text-center py-7 text-slate-400">
                <ShoppingBag size={30} className="mx-auto mb-3" />
                <p className="text-sm">Toca una tarjeta para agregarla</p>
              </div>
            )}
            <div className="space-y-4">
              {cart.map((item, index) => {
                const p = options.products.find(
                  (p) => p.id === item.productId,
                )!;
                return (
                  <div key={p.id} className="border-b border-slate-100 pb-4">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-medium">{p.name}</p>
                      <button
                        type="button"
                        aria-label={`Quitar ${p.name}`}
                        onClick={() =>
                          setCart(cart.filter((i) => i.productId !== p.id))
                        }
                      >
                        <X size={15} className="text-slate-400" />
                      </button>
                    </div>
                    {p.type === "SERVICE" && (
                      <p className="text-xs text-violet-600 mt-1">
                        {p.pricingMode === "PER_UNIT"
                          ? 1
                          : (p.sessions || 1) * item.quantity}{" "}
                        sesiones incluidas
                      </p>
                    )}
                    <div className="flex justify-between items-center mt-3">
                      <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-1">
                        <button
                          type="button"
                          className="p-2"
                          aria-label={`Reducir ${p.name}`}
                          onClick={() =>
                            setCart(
                              cart.flatMap((i) =>
                                i.productId !== p.id
                                  ? [i]
                                  : i.quantity > 1
                                    ? [{ ...i, quantity: i.quantity - 1 }]
                                    : [],
                              ),
                            )
                          }
                        >
                          <Minus size={13} />
                        </button>
                        <Input
                          aria-label={
                            p.pricingMode === "PER_UNIT"
                              ? `Unidades aplicadas de ${p.name}`
                              : `Cantidad de ${p.name}`
                          }
                          type="number"
                          min="1"
                          max={p.type === "PRODUCT" ? p.stock : 10000}
                          step="1"
                          className="w-20 text-center"
                          value={item.quantity}
                          onChange={(e) => {
                            const quantity = Number(e.target.value);
                            if (
                              Number.isInteger(quantity) &&
                              quantity >= 1 &&
                              quantity <=
                                (p.type === "PRODUCT" ? p.stock || 0 : 10000)
                            )
                              setCart(
                                cart.map((i) =>
                                  i.productId === p.id ? { ...i, quantity } : i,
                                ),
                              );
                          }}
                        />
                        <button
                          type="button"
                          className="p-2"
                          aria-label={`Aumentar ${p.name}`}
                          onClick={() => add(p)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatMoney(totals.items[index].total, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {decimal(totals.taxTotal).gt(0) && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Impuestos incluidos en el total</span>
                <span>{formatMoney(totals.taxTotal, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <strong className="text-3xl text-emerald-800">
                {formatMoney(totals.total, currency)}
              </strong>
            </div>
            <div>
              <label htmlFor="salePayment">Cobro</label>
              <select
                id="salePayment"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="FULL">Pago completo</option>
                <option value="PARTIAL">Abono / adelanto</option>
                <option value="LATER">Cobrar después</option>
              </select>
            </div>
            {paymentMode === "PARTIAL" && (
              <div>
                <label htmlFor="saleAmount">Abono recibido ({currency})</label>
                <Input
                  id="saleAmount"
                  type="number"
                  min="0.01"
                  max={Math.max(0, Number(totals.total) - 0.01)}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}
            {paymentMode !== "LATER" && (
              <div>
                <label htmlFor="saleMethod">Método de pago</label>
                <select
                  id="saleMethod"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="BANK_TRANSFER">Transferencia</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
            )}
            <div className="rounded-lg bg-slate-50 p-3 flex justify-between text-sm">
              <span>Saldo pendiente</span>
              <strong>
                {formatMoney(validAmount ? balance : totals.total, currency)}
              </strong>
            </div>
            <div>
              <label
                htmlFor="saleAppointment"
                className="flex items-center gap-2"
              >
                <CalendarDays size={14} /> Próxima cita (opcional)
              </label>
              <Input
                id="saleAppointment"
                type="datetime-local"
                value={nextAppointment}
                onChange={(e) => setNextAppointment(e.target.value)}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Hora de Nicaragua · Aparece en la factura
              </p>
            </div>
            <details>
              <summary className="text-xs text-slate-500 cursor-pointer">
                Agregar una nota
              </summary>
              <textarea
                aria-label="Nota de la venta"
                className="mt-3"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </details>
          </section>
        </fieldset>
        <div className="flex justify-end mt-5 no-print">
          <div className="w-full xl:w-[390px]">
            {retryPending && (
              <p role="status" className="text-sm text-amber-800 mb-3">
                Reintenta con los mismos datos para comprobar y abrir la venta
                sin duplicarla.
              </p>
            )}
            <Button
              type="submit"
              className="w-full h-14 text-base"
              disabled={
                busy ||
                (!retryPending &&
                  (!cart.length ||
                    !validAmount ||
                    (!customer && !clientName.trim())))
              }
            >
              <Printer size={18} />
              {busy
                ? "Guardando…"
                : retryPending
                  ? "Reintentar y abrir comprobante"
                  : "Guardar y ver comprobante"}
            </Button>
            <p className="text-center text-xs text-slate-400 mt-2">
              Podrás imprimir después de guardar
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
