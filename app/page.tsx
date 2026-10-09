import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
export default async function Home() {
  await pageContext();
  redirect("/dashboard");
}
