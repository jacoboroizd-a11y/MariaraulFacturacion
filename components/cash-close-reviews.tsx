import { db } from "@/server/db";
import { type Context, authorize } from "@/server/auth";
import type { CloseData } from "@/server/cash-close";
import { CashCloseReview } from "./cash-close-form";
import { formatMoney } from "@/lib/money";
import { appointmentLabel, dateLabel } from "@/lib/utils";
export async function CashCloseReviews({ ctx }: { ctx: Context }) {
  authorize(ctx, true);
  const closes = await db.cashDay.findMany({
    where: { companyId: ctx.companyId, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take: 60,
  });
  const missed = await db.cashDay.count({
    where: { companyId: ctx.companyId, automatic: true },
  });
  const reviews = await db.auditLog.findMany({
    where: {
      companyId: ctx.companyId,
      entityType: "CashDay",
      action: "CASH_CLOSE_REVIEWED",
      entityId: { in: closes.map((c) => c.id) },
    },
    include: { user: { select: { name: true } } },
  });
  return (
    <section className="panel p-6 mt-6">
      <h2 className="text-lg font-semibold">Revisión de cierres de caja</h2>
      <p className="text-sm text-slate-500 mt-2 mb-5">
        Cierres manuales omitidos: {missed}. Últimos 60 cierres registrados. Los
        importes conservan el estado al entregar el cierre.
      </p>
      {!closes.length && (
        <p className="text-sm text-slate-500">Aún no hay cierres entregados.</p>
      )}
      <div className="space-y-4">
        {closes.map((close) => {
          const data = close.closeData as unknown as CloseData;
          const review = reviews.find((r) => r.entityId === close.id);
          const meta = review?.metadata as
            { status: string; notes: string } | undefined;
          return (
            <details
              key={close.id}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {dateLabel(data.day)} ·{" "}
                {close.automatic ? "Cierre automático" : "Cierre manual"} ·{" "}
                {meta?.status === "APPROVED"
                  ? "Aprobado"
                  : meta?.status === "REJECTED"
                    ? "Con discrepancia"
                    : "Pendiente"}
              </summary>
              <p className="text-xs text-slate-500 mt-3">
                Entregado: {appointmentLabel(close.closedAt!)}
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {(["NIO", "USD"] as const).map((currency) => (
                  <div
                    key={currency}
                    className="rounded-xl bg-slate-50 p-4 text-sm space-y-2"
                  >
                    <h3 className="font-semibold">{currency}</h3>
                    {(
                      [
                        { key: "opening", label: "Fondo inicial" },
                        { key: "received", label: "Cobros en efectivo" },
                        { key: "out", label: "Salidas" },
                        { key: "expected", label: "Esperado" },
                        { key: "counted", label: "Contado" },
                        { key: "difference", label: "Diferencia" },
                        { key: "remaining", label: "Efectivo para mañana" },
                      ] as const
                    ).map((field) => (
                      <p key={field.key} className="flex justify-between gap-3">
                        <span>{field.label}</span>
                        <strong>
                          {data[currency][field.key] == null
                            ? "Pendiente"
                            : formatMoney(data[currency][field.key], currency)}
                        </strong>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              {data.notes && (
                <p className="text-sm mt-4 whitespace-pre-wrap">
                  Observaciones: {data.notes}
                </p>
              )}
              {review ? (
                <p className="text-sm text-slate-600 mt-4">
                  Revisó {review.user.name}:{" "}
                  {meta?.notes || "Sin observaciones"}
                </p>
              ) : (
                <CashCloseReview id={close.id} />
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
