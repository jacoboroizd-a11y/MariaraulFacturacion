import { CashCloseForm } from "./cash-close-form";
import { db } from "@/server/db";
import { authorize, type Context } from "@/server/auth";
import { formatMoney } from "@/lib/money";
import { labels, todayString } from "@/lib/utils";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { DataTable } from "./table";
import { serialize } from "@/server/queries";
export async function DailyClose({ ctx, day }: { ctx: Context; day?: string }) {
  authorize(ctx);
  const selected =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day))
      ? day
      : todayString();
  const date = new Date(selected + "T00:00:00Z");
  const where = {
    companyId: ctx.companyId,
    deletedAt: null,
    paymentDate: date,
    invoice: { status: { notIn: ["VOID", "DRAFT"] as ("VOID" | "DRAFT")[] } },
  };
  const [totals, payments] = await Promise.all([
    db.payment.groupBy({
      by: ["method", "currency"],
      where,
      _sum: { amount: true },
      _count: true,
    }),
    db.payment.findMany({
      where,
      include: { invoice: { include: { customer: true } }, receipt: true },
      orderBy: { createdAt: "asc" },
    }),
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
      <form
        action="/daily-close"
        className="flex flex-wrap items-end gap-3 my-5"
      >
        <label className="text-xs font-medium text-slate-600 space-y-2">
          <span className="block">Día del cierre</span>
          <Input
            type="date"
            name="day"
            defaultValue={selected}
            required
            aria-label="Día del cierre"
          />
        </label>
        <Button type="submit" variant="outline">
          Consultar cierre
        </Button>
      </form>
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
                      {formatMoney(
                        total?._sum.amount?.toString() || "0",
                        currency,
                      )}
                    </strong>
                  </div>
                );
              },
            )}
            <p className="text-xs text-slate-500 mt-3">
              {totals
                .filter((t) => t.currency === currency)
                .reduce((sum, t) => sum + t._count, 0)}{" "}
              pagos recibidos
            </p>
          </section>
        ))}
      </div>
      <CashCloseForm
        key={selected}
        day={selected}
        received={{
          NIO:
            totals
              .find((t) => t.method === "CASH" && t.currency === "NIO")
              ?._sum.amount?.toString() || "0",
          USD:
            totals
              .find((t) => t.method === "CASH" && t.currency === "USD")
              ?._sum.amount?.toString() || "0",
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
