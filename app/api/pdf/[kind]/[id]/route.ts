import { context, AppError } from "@/server/auth";
import { detail, serialize } from "@/server/queries";
import { pdfDocument } from "@/server/pdf";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const ctx = await context();
    const { kind, id } = await params;
    if (!["quotes", "invoices", "receipts"].includes(kind))
      throw new AppError("No encontrado.", 404);
    const row = serialize(await detail(ctx, kind, id));
    const buffer = await pdfDocument(row, kind);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${row.documentNumber.replace(/[^A-Za-z0-9-]/g, "")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : "PDF error");
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "No se pudo generar el documento.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
