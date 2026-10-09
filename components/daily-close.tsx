import { cashState, cashTotals, cashExpenses } from "@/server/cash-register";
import { CashOpening } from "./cash-opening";
import { CashCloseForm } from "./cash-close-form";
import { db } from "@/server/db";
import { authorize, type Context } from "@/server/auth";
import { formatMoney } from "@/lib/money";
import { labels } from "@/lib/utils";
import { DataTable } from "./table";
import { serialize } from "@/server/queries";
export async function DailyClose({ ctx }: { ctx: Context; day?: string }) {
  authorize(ctx);
  const state = await cashState(ctx);
  const previous = state.previous?.closeData as {
    NIO?: { remaining?: string };
    USD?: { remaining?: string };
  } | null;
  if (!state.day)
    return (
      <CashOpening
        canOpen={state.canOpen}
        missed={state.missed}
        warning={Boolean(state.previous?.automatic)}
        NIO={previous?.NIO?.remaining || "0"}
        USD={previous?.USD?.remaining || "0"}
      />
    );
  if (state.day.status === "CLOSED")
    return (
      <div className="panel p-6">
        <h2 className="text-xl font-semibold">Caja cerrada</h2>
        <p className="text-sm text-slate-600 mt-3">
          {state.day.automatic
            ? "No se hizo cierre manual. El conteo del efectivo quedó pendiente para Administración."
            : "Cierre entregado. La facturación queda bloqueada hasta la próxima apertura."}
        </p>
        <p className="text-sm mt-3">
          Cierres manuales omitidos: {state.missed}
        </p>
      </div>
    );
  const selected = state.today;
  const date = new Date(selected + "T00:00:00Z");
  const where = {
    companyId: ctx.companyId,
    deletedAt: null,
    advanceId: null,
    paymentDate: date,
    invoice: { status: { notIn: ["VOID", "DRAFT"] as ("VOID" | "DRAFT")[] } },
  };
  const [totals, payments, expenses] = await Promise.all([
    db.$transaction((tx) => cashTotals(tx, ctx.companyId, selected)),
    db.payment.findMany({
      where,
      include: { invoice: { include: { customer: true } }, receipt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.$transaction((tx) => cashExpenses(tx, ctx.companyId, state.day!.id)),
  ]);
  return (
    <details className="panel p-5 mb-6" open>
      <summary className="cursor-pointer text-lg font-semibold">
        Cierre diario
      </summary>
      <p className="text-sm text-slate-500 mt-2">
        Pagos y abonos por fecha de pago. No incluye pagos anulados ni mezcla
        monedas. El efectivo recibido no incluye fondo inicial ni egresos de
        caja.
      </p>
      <p className="text-sm font-semibold my-5">Jornada: {selected}</p>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        {(["NIO", "USD"] as const).map((currency) => (
          <section
            key={currency}
            className="rounded-2xl border border-slate-200/70 bg-white/60 p-5"
          >
            <h3 className="font-semibold mb-3">
              {currency === "NIO" ? "Córdobas" : "Dólares"}
            </h3>
            {(["CASH", "CARD", "BANK_TRANSFER", "CHECK", "OTHER"] as const).map(
              (method) => {
                const total = totals.find(
                  (t) => t.currency === currency && t.method === method,
                );
                return (
                  <div
                    key={method}
                    className="flex justify-between py-2 text-sm"
                  >
                    <span className="text-slate-600">{labels[method]}</span>
                    <strong>
                      {formatMoney(total?.amount || "0", currency)}
                    </strong>
                  </div>
                );
              },
            )}
            <p className="text-xs text-slate-500 mt-3">
              {totals
                .filter((t) => t.currency === currency)
                .reduce((sum, t) => sum + t.count, 0)}{" "}
              pagos recibidos
            </p>
          </section>
        ))}
      </div>
      <CashCloseForm
        expenses={expenses}
        opening={{
          NIO: state.day.openingNIO.toFixed(2),
          USD: state.day.openingUSD.toFixed(2),
        }}
        key={selected}
        day={selected}
        received={{
          NIO:
            totals.find((t) => t.method === "CASH" && t.currency === "NIO")
              ?.amount || "0",
          USD:
            totals.find((t) => t.method === "CASH" && t.currency === "USD")
              ?.amount || "0",
        }}
      />
      <details>
        <summary className="cursor-pointer text-sm font-medium text-emerald-800 mb-4">
          Ver pagos del día ({payments.length})
        </summary>
        <DataTable kind="payments" rows={serialize(payments)} />
      </details>
    </details>
  );
}
