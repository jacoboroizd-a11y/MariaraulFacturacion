import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
export default async function Home() {
  const ctx = await pageContext();
  redirect(ctx.role === "VIEWER" ? "/dashboard" : "/sales");
}
