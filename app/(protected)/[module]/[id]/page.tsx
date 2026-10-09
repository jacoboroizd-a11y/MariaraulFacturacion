import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Plus, Pencil } from "lucide-react";
import { pageContext, AppError } from "@/server/auth";
import { detail, list, options, serialize } from "@/server/queries";
import { db } from "@/server/db";
import { EntityForm, ActionButton } from "@/components/forms";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentView } from "@/components/document-view";
import { PaymentForm } from "@/components/payment-form";
import { DataTable } from "@/components/table";
import { InlinePayment } from "@/components/inline-payment";
import { AppointmentForm, SessionButton } from "@/components/clinic-followup";
import { SendDocument } from "@/components/send-document";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { formatMoney, decimal } from "@/lib/money";
import { dateLabel } from "@/lib/utils";
import type { Row } from "@/types/view";
export default async function DetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string; id: string }>;
  searchParams: Promise<{ edit?: string; invoice?: string }>;
}) {
  const { module, id } = await params;
  const query = await searchParams;
  const ctx = await pageContext();
  const writable = ctx.role !== "VIEWER";
  if (
    ![
      "customers",
      "products",
      "quotes",
      "invoices",
      "payments",
      "receipts",
      "taxes",
    ].includes(module)
  )
    notFound();
  if ((id === "new" || query.edit) && !writable) redirect("/" + module);
  if (module === "taxes" && ctx.role !== "ADMIN") redirect("/dashboard");
  if (id === "new") {
    const opts = await options(ctx);
    if (module === "quotes" || module === "invoices")
      return <DocumentEditor kind={module} options={opts} />;
    if (module === "payments")
      return (
        <>
          <Title title="Registrar pago" />
          <PaymentForm
            invoices={serialize(await list(ctx, "invoices"))}
            initialInvoice={query.invoice}
          />
        </>
      );
    if (module === "customers" || module === "products")
      return (
        <>
          <Title
            title={
              module === "customers"
                ? "Nuevo cliente"
                : "Nuevo producto o servicio"
            }
          />
          <EntityForm kind={module} options={opts} />
        </>
      );
    notFound();
  }
  let row: Row;
  try {
    if (module === "taxes") {
      const tax = await db.tax.findFirst({
        where: { id, companyId: ctx.companyId },
      });
      if (!tax) notFound();
      row = serialize(tax);
    } else row = serialize(await detail(ctx, module, id));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  if (module === "taxes")
    return (
      <>
        <Title title="Editar impuesto" />
        <EntityForm kind="taxes" initial={row} options={await options(ctx)} />
        <div className="mt-5">
          <ActionButton
            path={"taxes/" + id}
            label="Eliminar impuesto"
            destructive
            redirectTo="/settings"
          />
        </div>
      </>
    );
  if (query.edit) {
    const opts = await options(ctx);
    if (module === "quotes" || module === "invoices") {
      if (
        (module === "invoices" && row.status !== "DRAFT") ||
        row.status === "CONVERTED"
      )
        redirect(`/${module}/${id}`);
      return <DocumentEditor kind={module} initial={row} options={opts} />;
    }
    if (module === "customers" || module === "products")
      return (
        <>
          <Title title={"Editar " + row.name} />
          <EntityForm kind={module} initial={row} options={opts} />
        </>
      );
  }
  if (module === "customers") {
    const invoices = row.invoices || [];
    const quotes = row.quotes || [];
    const payments = invoices.flatMap((i) =>
      (i.payments || []).map((p) => ({ ...p, invoice: i })),
    );
    const audit = await db.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        OR: [
          { entityType: "Customer", entityId: id },
          {
            entityType: "Invoice",
            entityId: { in: invoices.map((i) => i.id) },
          },
          { entityType: "Quote", entityId: { in: quotes.map((i) => i.id) } },
          {
            entityType: "Payment",
            entityId: { in: payments.map((i) => i.id) },
          },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    });
    return (
      <>
        <div className="flex justify-between gap-4 mb-7">
          <Title title={row.name!} />
          {writable && (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/customers/${id}?edit=1`}>
                  <Pencil size={13} />
                  Editar
                </Link>
              </Button>
              <ActionButton
                path={"customers/" + id}
                label="Eliminar"
                destructive
                redirectTo="/customers"
              />
            </div>
          )}
        </div>
        <div className="panel p-6 mb-6">
          <h2 className="font-semibold">Información general</h2>
          <dl className="grid sm:grid-cols-3 gap-5 mt-5 text-sm">
            {[
              { label: "Razón social", value: row.legalName },
              { label: "Nombre comercial", value: row.tradeName },
              { label: "RUC / Cédula", value: row.ruc },
              { label: "Correo", value: row.email },
              { label: "Teléfono", value: row.phone },
              { label: "Dirección", value: row.address },
              { label: "Ciudad", value: row.city },
              { label: "Notas", value: row.notes },
              { label: "Estado", value: row.active ? "Activo" : "Inactivo" },
            ].map((x) => (
              <div key={x.label}>
                <dt className="text-xs text-slate-400 mb-2">{x.label}</dt>
                <dd>{x.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid sm:grid-cols-2 gap-5 mb-6">
          {["NIO", "USD"].map((currency) => {
            const issued = invoices.filter(
              (i) =>
                i.currency === currency &&
                !["VOID", "DRAFT"].includes(i.status || ""),
            );
            const sum = (key: "total" | "amountPaid" | "balanceDue") =>
              issued
                .reduce((s, i) => s.plus(i[key] || 0), decimal(0))
                .toFixed(2);
            return (
              <div key={currency} className="panel p-5">
                <h3 className="font-semibold mb-4">Resumen · {currency}</h3>
                {[
                  { label: "Total facturado", value: sum("total") },
                  { label: "Total pagado", value: sum("amountPaid") },
                  { label: "Saldo pendiente", value: sum("balanceDue") },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex justify-between py-2 text-sm"
                  >
                    <span className="text-slate-500">{s.label}</span>
                    <span className="font-medium">
                      {formatMoney(s.value, currency)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <h2 className="font-semibold my-4">Cotizaciones</h2>
        <DataTable rows={quotes} kind="quotes" />
        <h2 className="font-semibold my-4">Facturas</h2>
        <DataTable rows={invoices} kind="invoices" />
        <h2 className="font-semibold my-4">Pagos</h2>
        <DataTable rows={payments} kind="payments" />
        <h2 className="font-semibold my-4">Historial</h2>
        <div className="panel p-5 space-y-3">
          {audit.map((a) => (
            <div
              key={a.id}
              className="text-xs flex gap-4 border-b border-slate-100 pb-3"
            >
              <span className="text-slate-400">{dateLabel(a.timestamp)}</span>
              <span>{a.action}</span>
              <span className="ml-auto text-slate-500">{a.user.name}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (module === "products")
    return (
      <>
        <div className="flex justify-between mb-6">
          <Title title={row.name!} />
          {writable && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/${module}/${id}?edit=1`}>Editar</Link>
              </Button>
              <ActionButton
                path={"products/" + id}
                label="Eliminar producto"
                destructive
                redirectTo="/products"
              />
            </div>
          )}
        </div>
        <div className="panel p-6 space-y-4">
          <p className="text-sm text-slate-500">
            {row.sku} · {row.category} · {row.active ? "Activo" : "Inactivo"}
          </p>
          <p className="text-3xl font-semibold">
            {formatMoney(row.price || 0, row.currency)}
          </p>
          <p className="text-sm">{row.description || "Sin descripción"}</p>
          <p className="text-xs text-slate-400">
            Por {row.unit} · Impuesto: {row.tax?.name || "Exento"}{" "}
            {row.tax?.rate || "0"}%
          </p>
        </div>
      </>
    );
  if (module === "payments") notFound();
  return (
    <>
      <Link
        className="text-xs text-slate-500 flex gap-2 items-center mb-5 no-print"
        href={"/" + module}
      >
        <ArrowLeft size={14} />
        Volver al listado
      </Link>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 no-print">
        <Title title={row.documentNumber!} />
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Button size="sm" variant="outline" asChild>
            <a
              href={`/api/pdf/${module}/${id}`}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={13} />
              PDF
            </a>
          </Button>
          {writable && module !== "receipts" && (
            <>
              {((module === "invoices" && row.status === "DRAFT") ||
                (module === "quotes" && row.status !== "CONVERTED")) && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/${module}/${id}?edit=1`}>Editar</Link>
                </Button>
              )}
              {row.status === "DRAFT" && (
                <ActionButton
                  path={`${module}/${id}`}
                  label="Eliminar borrador"
                  destructive
                  redirectTo={"/" + module}
                />
              )}{" "}
              {module === "quotes" &&
                !["CONVERTED", "REJECTED", "EXPIRED"].includes(
                  row.status || "",
                ) && (
                  <ActionButton
                    path={`quotes/${id}`}
                    action="convert"
                    label="Convertir en factura"
                  />
                )}
              {module === "quotes" && row.status === "SENT" && (
                <>
                  <ActionButton
                    path={`quotes/${id}`}
                    action="accept"
                    label="Aceptar"
                  />
                  <ActionButton
                    path={`quotes/${id}`}
                    action="reject"
                    label="Rechazar"
                    destructive
                  />
                </>
              )}
              {module === "invoices" && (
                <>
                  {row.status === "DRAFT" && (
                    <ActionButton
                      path={`invoices/${id}`}
                      action="issue"
                      label="Emitir factura"
                    />
                  )}
                  {!["DRAFT", "VOID", "PAID"].includes(row.status || "") && (
                    <Button size="sm" asChild>
                      <Link href="#cobrar">
                        <Plus size={13} />
                        Registrar pago
                      </Link>
                    </Button>
                  )}
                  {row.status !== "VOID" && (
                    <ActionButton
                      path={`invoices/${id}`}
                      action="void"
                      label="Anular factura"
                      destructive
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {(module === "invoices" || module === "receipts") && (
        <div className="panel p-5 mb-5 no-print">
          <SendDocument row={row} kind={module} />
        </div>
      )}
      <DocumentView row={row} kind={module} />
      {module === "invoices" &&
        writable &&
        !["VOID", "DRAFT"].includes(row.status || "") && (
          <InlinePayment invoice={row} />
        )}
      {module === "invoices" &&
        writable &&
        !["VOID", "DRAFT"].includes(row.status || "") && (
          <div className="panel p-6 mt-6 no-print space-y-5">
            <h2 className="font-semibold">Seguimiento del tratamiento</h2>
            {row.items
              ?.filter((i) => (i.sessionsTotal || 0) > 0)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap justify-between gap-3 items-center text-sm"
                >
                  <span>
                    {item.description} ·{" "}
                    {(item.sessionsTotal || 0) - (item.sessionsUsed || 0)}{" "}
                    sesiones disponibles
                  </span>
                  <SessionButton item={item} />
                </div>
              ))}
            <AppointmentForm invoice={row} />
          </div>
        )}
      {module === "quotes" && row.invoice && (
        <p className="mt-5 text-sm text-emerald-700">
          <Link href={"/invoices/" + row.invoice.id}>
            Ver factura {row.invoice.documentNumber} →
          </Link>
        </p>
      )}
      {module === "invoices" && (
        <div className="mt-8 no-print">
          <h2 className="font-semibold mb-4">Pagos aplicados</h2>
          <div className="panel overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                  <th>Recibo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row.payments?.map((p) => (
                  <tr key={p.id}>
                    <td>{dateLabel(p.paymentDate!)}</td>
                    <td>{formatMoney(p.amount!, p.currency)}</td>
                    <td>{p.reference || "—"}</td>
                    <td>
                      <Link
                        href={"/receipts/" + p.receipt?.id}
                        className="text-emerald-700"
                      >
                        {p.receipt?.documentNumber}
                      </Link>
                    </td>
                    <td>
                      {writable && (
                        <ActionButton
                          path={"payments/" + p.id}
                          label="Eliminar pago"
                          destructive
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!row.payments?.length && (
              <p className="p-7 text-sm text-slate-400 text-center">
                Aún no se han registrado pagos.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
function Title({ title }: { title: string }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight mb-5">{title}</h1>
  );
}
