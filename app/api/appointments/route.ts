import { after } from "next/server";
import { syncAppointments } from "@/server/calendar-sync";
import { context, checkOrigin, AppError } from "@/server/auth";
import { saveAppointment } from "@/server/appointments";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const data = await request.json();
    const ctx = await context();
    const result = await saveAppointment(ctx, data, data.id);
    after(() => syncAppointments(ctx.companyId));
    return Response.json(result);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError ? e.message : "Revisa los datos de la cita.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
