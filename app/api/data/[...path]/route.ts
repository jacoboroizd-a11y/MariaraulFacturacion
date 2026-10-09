import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { context, checkOrigin, AppError } from "@/server/auth";
import { list, detail, options, search, analytics } from "@/server/queries";
import {
  saveCustomer,
  saveProduct,
  saveTax,
  saveDocument,
  deleteEntity,
  documentAction,
  createPayment,
  deletePayment,
  saveSettings,
  createUser,
  updateMembership,
} from "@/server/domain";
import {
  createClinicSale,
  recordSession,
  changeAppointment,
  adjustStock,
} from "@/server/clinic";
import { importCatalog } from "@/server/catalog-import";
type Params = { params: Promise<{ path: string[] }> };
function failure(e: unknown) {
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
    return NextResponse.json(
      { error: "Ya existe un registro con ese número, código o correo." },
      { status: 409 },
    );
  console.error(e instanceof Error ? e.message : "Unknown failure");
  return NextResponse.json(
    { error: "No se pudo completar la operación." },
    { status: 500 },
  );
}
export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await context();
    const [kind, id] = (await params).path;
    const url = new URL(request.url);
    const result =
      kind === "options"
        ? await options(ctx)
        : kind === "search"
          ? await search(ctx, url.searchParams.get("q") || "")
          : kind === "analytics"
            ? await analytics(
                ctx,
                url.searchParams.get("start") || undefined,
                url.searchParams.get("end") || undefined,
              )
            : id
              ? await detail(ctx, kind, id)
              : await list(ctx, kind);
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
async function mutate(request: Request, { params }: Params) {
  try {
    checkOrigin(request);
    const ctx = await context();
    const [kind, id, action] = (await params).path;
    const input = request.method === "DELETE" ? {} : await request.json();
    let result;
    if (request.method === "DELETE") {
      if (kind === "payments") result = await deletePayment(ctx, id);
      else if (kind === "quotes" || kind === "invoices")
        result = await documentAction(ctx, kind, id, "delete");
      else if (kind === "customers" || kind === "products" || kind === "taxes")
        result = await deleteEntity(ctx, kind, id);
      else throw new AppError("Acción no válida.");
    } else if (kind === "sales" && !id && request.method === "POST")
      result = await createClinicSale(ctx, input);
    else if (kind === "sessions" && id && request.method === "POST")
      result = await recordSession(ctx, id, input);
    else if (kind === "catalog-import" && !id && request.method === "POST")
      result = await importCatalog(ctx, input);
    else if (kind === "inventory" && id && request.method === "POST")
      result = await adjustStock(ctx, id, input);
    else if (kind === "appointments" && id && request.method === "PUT")
      result = await changeAppointment(ctx, id, input);
    else if (action && (kind === "quotes" || kind === "invoices"))
      result = await documentAction(ctx, kind, id, action);
    else if (kind === "customers") result = await saveCustomer(ctx, input, id);
    else if (kind === "products") result = await saveProduct(ctx, input, id);
    else if (kind === "taxes") result = await saveTax(ctx, input, id);
    else if (kind === "quotes" || kind === "invoices")
      result = await saveDocument(ctx, kind, input, id);
    else if (kind === "payments" && !id)
      result = await createPayment(ctx, input);
    else if (kind === "settings") result = await saveSettings(ctx, input);
    else if (kind === "users")
      result = id
        ? await updateMembership(ctx, id, input)
        : await createUser(ctx, input);
    else throw new AppError("Acción no válida.", 404);
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
export const POST = mutate;
export const PUT = mutate;
export const DELETE = mutate;
