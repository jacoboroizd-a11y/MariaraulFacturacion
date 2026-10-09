import Link from "next/link";
import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { cashState } from "@/server/cash-register";
import { serialize } from "@/server/queries";
import { DailyClose } from "@/components/daily-close";
import { CashMovements } from "@/components/cash-movements";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await pageContext();
  if (!["ADMIN", "BILLING"].includes(ctx.role)) redirect("/");
  const tab = (await searchParams).tab === "expenses" ? "expenses" : "close";
  const state = await cashState(ctx);
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Caja de la clínica</h1>
      <nav className="flex gap-2 mb-6" aria-label="Caja">
        {[
          ["close", "Apertura y cierre"],
          ["expenses", "Salidas de efectivo"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/daily-close?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-xl px-4 py-3 text-sm font-medium ${tab === key ? "bg-emerald-100 text-emerald-900" : "panel"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "close" ? (
        <DailyClose ctx={ctx} />
      ) : (
        <CashMovements
          canRecord={state.canBill}
          movements={serialize(
            state.day
              ? await db.cashMovement.findMany({
                  where: { companyId: ctx.companyId, cashDayId: state.day.id },
                  orderBy: { createdAt: "desc" },
                })
              : [],
          )}
        />
      )}
    </>
  );
}
