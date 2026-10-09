import Image from "next/image";
import { formatMoney, convertCurrency } from "@/lib/money";
import { dateLabel, labels, appointmentLabel } from "@/lib/utils";
import { Badge } from "./ui/badge";
import type { Row } from "@/types/view";
export function DocumentView({ row, kind }: { row: Row; kind: string }) {
  const receipt = kind === "receipts";
  const doc = receipt ? row.invoice! : row;
  const company = doc.companySnapshot || {};
  const customer = doc.customerSnapshot || {};
  const currency = doc.currency;
  const fmt = company.dateFormat || "dd/MM/yyyy";
  const hasTax = doc.items?.some((i) => Number(i.tax) !== 0);
  const hasDiscount = doc.items?.some((i) => Number(i.discount) !== 0);
  return (
    <div
      className={`panel p-6 md:p-10 max-w-5xl mx-auto print-document ${kind === "quotes" ? "print-quote" : "print-note"}`}
    >
      <div className="flex justify-between gap-5 border-b border-slate-100 pb-8">
        <div>
          {
            <Image
              unoptimized
              width={2833}
              height={682}
              src={company.logo || "/brand/mariaraul.png"}
              alt="Logo de la empresa"
              className="w-64 max-w-full h-auto max-h-20 object-contain object-left mb-4"
            />
          }
          <h2 className="font-semibold text-lg">
            {company.tradeName || company.name}
          </h2>
          <p className="text-xs text-slate-500 mt-2">{company.name}</p>
          <p className="text-xs text-slate-500 mt-1">
            RUC: {company.ruc || "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">{company.address}</p>
          <p className="text-xs text-slate-500 mt-1">
            {[company.email, company.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-semibold">
            {receipt ? "RECIBO" : kind === "quotes" ? "COTIZACIÓN" : "FACTURA"}
          </h2>
          <p className="text-sm text-emerald-800 font-medium mt-2">
            {row.documentNumber}
          </p>
          <div className="mt-3">
            <Badge
              status={
                receipt ? (row.voidedAt ? "VOID" : "Vigente") : row.status || ""
              }
            />
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-6 py-7">
        <div>
          <p className="text-[10px] text-slate-400 tracking-wide mb-2">
            {receipt ? "RECIBIMOS DE" : "CLIENTE"}
          </p>
          <p className="text-sm font-semibold">
            {customer.legalName || customer.name}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {[customer.email, customer.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-sm sm:text-right space-y-2">
          <p>
            <span className="text-slate-400 mr-3">Fecha</span>
            {dateLabel(receipt ? row.payment!.paymentDate! : doc.date!, fmt)}
          </p>
          {(receipt || kind === "quotes") && (
            <p>
              <span className="text-slate-400 mr-3">
                {receipt ? "Factura" : "Vencimiento"}
              </span>
              {receipt ? doc.documentNumber : dateLabel(doc.dueDate!, fmt)}
            </p>
          )}
          <p>
            <span className="text-slate-400 mr-3">Moneda</span>
            {currency}
          </p>
        </div>
      </div>
      {receipt ? (
        <div className="rounded-xl bg-emerald-50 p-6">
          <p className="text-sm text-emerald-800">Monto recibido</p>
          <p className="text-3xl font-semibold mt-3">
            {formatMoney(row.payment!.amount!, currency)}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-500 mt-6">
            <p>Método: {labels[row.payment!.method!]}</p>
            <p>Referencia: {row.payment!.reference || "—"}</p>
            <p>Cuenta: {row.payment!.account || "—"}</p>
            <p>
              Saldo después de este pago:{" "}
              {formatMoney(row.balanceRemaining!, currency)}
            </p>
          </div>
          {row.payment?.notes && (
            <p className="text-xs mt-4">{row.payment.notes}</p>
          )}
          {row.voidedAt && (
            <p className="text-red-600 text-sm mt-4 font-medium">
              Este recibo fue anulado. El pago ya no se aplica a la factura.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Precio</th>
                  {hasDiscount && <th>Descuento</th>}
                  {hasTax && <th>Impuesto</th>}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {doc.items?.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>{i.quantity}</td>
                    <td>{formatMoney(i.unitPrice, currency)}</td>
                    {hasDiscount && (
                      <td>{formatMoney(i.discount, currency)}</td>
                    )}
                    {hasTax && (
                      <td>
                        {formatMoney(i.tax, currency)}
                        <p className="text-xs text-slate-400">{i.taxRate}%</p>
                      </td>
                    )}
                    <td className="font-medium">
                      {formatMoney(i.total, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-sm mt-6 space-y-3 text-sm">
            {[
              { label: "Subtotal", value: doc.subtotal },
              { label: "Descuentos", value: doc.discountTotal },
              { label: "Impuestos", value: doc.taxTotal },
            ]
              .filter((x) => x.label === "Subtotal" || Number(x.value))
              .map((x) => (
                <div
                  className="flex justify-between text-slate-500"
                  key={x.label}
                >
                  <span>{x.label}</span>
                  <span>{formatMoney(x.value || 0, currency)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t border-slate-200 pt-4 text-xl font-semibold">
              <span>Total</span>
              <span>{formatMoney(doc.total || 0, currency)}</span>
            </div>
            <p className="text-right text-xs text-slate-400">
              Equivalente:{" "}
              {formatMoney(
                convertCurrency(
                  doc.total || 0,
                  currency || "NIO",
                  currency === "USD" ? "NIO" : "USD",
                  doc.exchangeRate || "1",
                ),
                currency === "USD" ? "NIO" : "USD",
              )}{" "}
              · TC {doc.exchangeRate}
            </p>
            {kind === "invoices" && (
              <>
                <div className="flex justify-between">
                  <span>Pagado</span>
                  <span>{formatMoney(doc.amountPaid || 0, currency)}</span>
                </div>
                <div className="flex justify-between bg-emerald-50 p-3 rounded-lg font-semibold text-emerald-800">
                  <span>Saldo pendiente</span>
                  <span>{formatMoney(doc.balanceDue || 0, currency)}</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
      <div className="mt-10 pt-6 border-t border-slate-100 space-y-4">
        {kind === "invoices" && (
          <div className="mt-6 text-sm">
            <h3 className="font-semibold mb-3">Método de pago / abonos</h3>
            {doc.payments?.length ? (
              <div className="space-y-2">
                {doc.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      {dateLabel(p.paymentDate!, fmt)} ·{" "}
                      {labels[p.method || ""] || p.method}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <strong>{formatMoney(p.amount || 0, currency)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">
                Sin pagos registrados · Pendiente de cobro
              </p>
            )}
          </div>
        )}
        {doc.nextAppointment && (
          <div className="mt-6 rounded-xl bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              Próxima cita
            </p>
            <p className="mt-2 font-semibold">
              {appointmentLabel(doc.nextAppointment)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Hora de Nicaragua</p>
          </div>
        )}
        {doc.items?.some((i) => (i.sessionsTotal || 0) > 0) && (
          <div className="mt-6 space-y-2 text-sm">
            <h3 className="font-semibold">Tratamientos y sesiones</h3>
            {doc.items
              .filter((i) => (i.sessionsTotal || 0) > 0)
              .map((i) => (
                <p key={i.id}>
                  {i.description}: {i.sessionsUsed || 0} de {i.sessionsTotal}{" "}
                  realizadas · {(i.sessionsTotal || 0) - (i.sessionsUsed || 0)}{" "}
                  disponibles
                </p>
              ))}
          </div>
        )}
        {!receipt && doc.notes && (
          <div>
            <p className="text-xs font-semibold mb-2">Notas</p>
            <p className="text-xs text-slate-500 whitespace-pre-line">
              {doc.notes}
            </p>
          </div>
        )}
        {!receipt && doc.terms && (
          <div>
            <p className="text-xs font-semibold mb-2">Términos y condiciones</p>
            <p className="text-xs text-slate-500 whitespace-pre-line">
              {doc.terms}
            </p>
          </div>
        )}
        {company.bankInfo && (
          <div>
            <p className="text-xs font-semibold mb-2">Información bancaria</p>
            <p className="text-xs text-slate-500 whitespace-pre-line">
              {company.bankInfo}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
