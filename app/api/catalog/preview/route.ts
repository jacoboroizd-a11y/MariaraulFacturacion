import { NextResponse } from "next/server";
import { context, authorize, checkOrigin, AppError } from "@/server/auth";
import { parseCatalogFile } from "@/server/catalog-import";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    authorize(ctx);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Selecciona un archivo.");
    return NextResponse.json(await parseCatalogFile(file));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo leer el archivo. Revisa el formato y utiliza la plantilla.",
      },
      { status: error instanceof AppError ? error.status : 400 },
    );
  }
}
