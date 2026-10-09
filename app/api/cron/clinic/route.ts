import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { processClinicReports } from "@/server/report-delivery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    provided = request.headers.get("authorization") || "",
    expected = secret ? `Bearer ${secret}` : "";
  if (
    !secret ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return Response.json({ error: "No autorizado" }, { status: 401 });
  const companies = await db.company.findMany({ select: { id: true } });
  const results = [];
  for (const company of companies)
    results.push(await processClinicReports(company.id));
  return Response.json({
    processed: results.length,
    sent: results.reduce((sum, r) => sum + r.sent, 0),
    configured: results.every((r) => r.configured),
  });
}
