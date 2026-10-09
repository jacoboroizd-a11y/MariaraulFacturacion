import { cashState } from "@/server/cash-register";
import { DailyClose } from "@/components/daily-close";
import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { options } from "@/server/queries";
import { ClinicSale } from "@/components/clinic-sale";
export default async function SalesPage() {
  const ctx = await pageContext();
  if (!["ADMIN", "BILLING"].includes(ctx.role)) redirect("/");
  const cash = await cashState(ctx);
  if (!cash.canBill)
    return (
      <>
        <h1 className="text-2xl font-semibold mb-6">Primero abre la caja</h1>
        <DailyClose ctx={ctx} />
      </>
    );
  return <ClinicSale options={await options(ctx)} />;
}
