import { context, AppError } from "@/server/auth";
import { clinicReport } from "@/server/clinic-report";
import { todayString } from "@/lib/utils";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const ctx = await context();
    const month =
      new URL(request.url).searchParams.get("month") ||
      todayString().slice(0, 7);
    const bytes = await clinicReport(ctx, month);
    return new Response(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tratamientos-${month}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo exportar el reporte.",
      },
      { status: error instanceof AppError ? error.status : 500 },
    );
  }
}
