import { context, checkOrigin, AppError } from "@/server/auth";
import { importClients, previewClients } from "@/server/client-import";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context();
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(),
        file = form.get("file");
      if (!(file instanceof File)) throw new AppError("Selecciona un archivo.");
      return Response.json(
        await previewClients(ctx, file, String(form.get("country") || "NI")),
      );
    }
    return Response.json(await importClients(ctx, await request.json()));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo importar. Revisa el archivo y reintenta.",
      },
      { status: error instanceof AppError ? error.status : 400 },
    );
  }
}
