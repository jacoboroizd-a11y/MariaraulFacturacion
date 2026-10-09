import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { DailyClose } from "@/components/daily-close";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const ctx = await pageContext();
  if (ctx.role === "VIEWER") redirect("/customers");
  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Cierre de caja</h1>
      <DailyClose ctx={ctx} day={(await searchParams).day} />
    </>
  );
}
