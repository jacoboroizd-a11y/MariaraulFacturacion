import { pageContext } from "@/server/auth";
import { redirect } from "next/navigation";
import { cashState } from "@/server/cash-register";
import { db } from "@/server/db";
import { serialize } from "@/server/queries";
import { AdvanceForm } from "@/components/advance-form";
export default async function Page() {
  const ctx = await pageContext();
  if (!["ADMIN", "BILLING"].includes(ctx.role)) redirect("/");
  if (!(await cashState(ctx)).canBill) redirect("/daily-close");
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Registrar adelanto</h1>
      <AdvanceForm
        customers={serialize(
          await db.customer.findMany({
            where: { companyId: ctx.companyId, active: true },
            orderBy: { name: "asc" },
          }),
        )}
      />
    </>
  );
}
