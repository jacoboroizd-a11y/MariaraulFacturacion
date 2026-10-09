import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { options } from "@/server/queries";
import { ClinicSale } from "@/components/clinic-sale";
export default async function SalesPage() {
  const ctx = await pageContext();
  if (ctx.role === "VIEWER") redirect("/dashboard");
  return <ClinicSale options={await options(ctx)} />;
}
