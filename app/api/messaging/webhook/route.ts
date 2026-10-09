import { db } from "@/server/db";
import { decryptCalendarUrl } from "@/server/google-calendar";
import { validMetaSignature, receiveMessages } from "@/server/messaging";
import { timingSafeEqual } from "node:crypto";
export async function GET(request: Request) {
  const url = new URL(request.url),
    provided = url.searchParams.get("hub.verify_token") || "";
  if (url.searchParams.get("hub.mode") !== "subscribe")
    return new Response("No autorizado", { status: 403 });
  const connections = await db.messagingConnection.findMany({
    select: { encryptedVerifyToken: true },
  });
  for (const connection of connections) {
    const expected = decryptCalendarUrl(connection.encryptedVerifyToken);
    if (
      Buffer.byteLength(provided) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      return new Response(url.searchParams.get("hub.challenge"));
  }
  return new Response("No autorizado", { status: 403 });
}
export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("Integración pendiente", { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 1024 * 1024)
    return new Response("Payload muy grande", { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 1024 * 1024)
    return new Response("Payload muy grande", { status: 413 });
  if (
    !validMetaSignature(
      body,
      request.headers.get("x-hub-signature-256") || "",
      secret,
    )
  )
    return new Response("No autorizado", { status: 401 });
  try {
    await receiveMessages(JSON.parse(body));
    return new Response("OK");
  } catch {
    return new Response("No se pudo procesar", { status: 500 });
  }
}
