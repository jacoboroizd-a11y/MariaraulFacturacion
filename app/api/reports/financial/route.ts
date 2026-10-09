import { context, AppError } from "@/server/auth";
import {
  financialReport,
  financialExcel,
  financialPDF,
} from "@/server/financial-report";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const format = query.get("format");
    if (!["pdf", "xlsx"].includes(format || ""))
      throw new AppError("Formato inválido.");
    const data = await financialReport(
      await context(),
      query.get("kind") || "DAILY",
      query.get("period") || "",
    );
    const buffer =
      format === "pdf" ? await financialPDF(data) : await financialExcel(data);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte-${data.period}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "No se pudo generar el reporte.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
