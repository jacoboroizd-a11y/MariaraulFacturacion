import { context, AppError } from "@/server/auth";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await context();
  } catch (e) {
    if (e instanceof AppError) redirect("/login");
    throw e;
  }
  return <Shell ctx={ctx}>{children}</Shell>;
}
