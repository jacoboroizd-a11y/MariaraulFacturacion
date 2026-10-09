import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, transaction } from "./db";
import { authorize, AppError, type Context } from "./auth";
import { encryptCalendarUrl, decryptCalendarUrl } from "./google-calendar";
const graph =
  "https://graph.facebook.com/" + (process.env.META_GRAPH_VERSION || "v24.0");
export async function connectMessaging(ctx: Context, input: unknown) {
  authorize(ctx, true);
  const data = z
    .object({
      token: z.string().trim().min(20).max(3000),
      whatsappPhoneId: z.string().regex(/^\d*$/).default(""),
      whatsappBusinessId: z.string().regex(/^\d*$/).default(""),
      instagramId: z.string().regex(/^\d*$/).default(""),
      facebookPageId: z.string().regex(/^\d*$/).default(""),
    })
    .parse(input);
  if (!data.whatsappPhoneId && !data.instagramId)
    throw new AppError("Añade la cuenta de WhatsApp o Instagram.");
  if (data.instagramId && !data.facebookPageId)
    throw new AppError("Añade la página de Facebook vinculada a Instagram.");
  for (const id of [data.whatsappPhoneId, data.instagramId].filter(Boolean)) {
    const response = await fetch(`${graph}/${id}?fields=id`, {
      headers: { Authorization: `Bearer ${data.token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new AppError(
        "Meta no permitió acceder a la cuenta. Revisa el token y los permisos.",
      );
  }
  const previous = await db.messagingConnection.findUnique({
      where: { companyId: ctx.companyId },
    }),
    verify = previous
      ? decryptCalendarUrl(previous.encryptedVerifyToken)
      : randomBytes(24).toString("hex");
  const values = {
    encryptedToken: encryptCalendarUrl(data.token),
    whatsappPhoneId: data.whatsappPhoneId || null,
    whatsappBusinessId: data.whatsappBusinessId || null,
    instagramId: data.instagramId || null,
    facebookPageId: data.facebookPageId || null,
    encryptedVerifyToken: encryptCalendarUrl(verify),
  };
  await db.messagingConnection.upsert({
    where: { companyId: ctx.companyId },
    create: { companyId: ctx.companyId, ...values },
    update: values,
  });
  return { connected: true, verifyToken: verify };
}
export type ApprovedTemplate = {
  name: string;
  language: string;
  body: string;
  parameters: number;
};
export async function approvedTemplates(
  companyId: string,
): Promise<ApprovedTemplate[]> {
  const connection = await db.messagingConnection.findUnique({
    where: { companyId },
  });
  if (!connection?.whatsappBusinessId) return [];
  try {
    const response = await fetch(
      `${graph}/${connection.whatsappBusinessId}/message_templates?fields=name,status,language,components&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${decryptCalendarUrl(connection.encryptedToken)}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return [];
    const result = (await response.json()) as {
      data?: {
        name: string;
        status: string;
        language: string;
        components: {
          type: string;
          format?: string;
          text?: string;
          buttons?: unknown[];
        }[];
      }[];
    };
    return (result.data || [])
      .filter(
        (t) =>
          t.status === "APPROVED" &&
          t.components.every(
            (c) =>
              c.type === "BODY" ||
              c.type === "FOOTER" ||
              (c.type === "HEADER" &&
                c.format === "TEXT" &&
                !/\{\{/.test(c.text || "")),
          ),
      )
      .map((t) => {
        const body = t.components.find((c) => c.type === "BODY")?.text || "";
        return {
          name: t.name,
          language: t.language,
          body,
          parameters: new Set(body.match(/\{\{\d+\}\}/g) || []).size,
        };
      });
  } catch {
    return [];
  }
}
export async function replyMessage(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = z
    .object({
      requestId: z.uuid(),
      threadId: z.string().min(1),
      text: z.string().trim().max(1000).default(""),
      template: z
        .object({
          name: z.string(),
          language: z.string(),
          parameters: z.array(z.string().trim().min(1).max(200)).max(20),
        })
        .optional(),
    })
    .parse(input);
  const connection = await db.messagingConnection.findUnique({
    where: { companyId: ctx.companyId },
  });
  if (!connection)
    throw new AppError("Enlaza las cuentas desde Administración.");
  const template = data.template
    ? (await approvedTemplates(ctx.companyId)).find(
        (t) =>
          t.name === data.template!.name &&
          t.language === data.template!.language,
      )
    : null;
  if (
    data.template &&
    (!template || template.parameters !== data.template.parameters.length)
  )
    throw new AppError(
      "Selecciona una plantilla aprobada e introduce sus variables.",
    );
  if (!data.template && !data.text) throw new AppError("Escribe un mensaje.");
  const storedText = data.template
    ? `Plantilla ${data.template.name}: ${data.template.parameters.join(" | ")}`
    : data.text;
  const outgoing = await transaction(async (tx) => {
    const previous = await tx.clinicMessage.findUnique({
      where: { requestId: data.requestId },
    });
    if (previous) {
      if (
        previous.companyId !== ctx.companyId ||
        previous.threadId !== data.threadId ||
        previous.text !== storedText
      )
        throw new AppError("Mensaje ya registrado con otros datos.", 409);
      return previous;
    }
    const thread = await tx.messageThread.findFirst({
      where: { id: data.threadId, companyId: ctx.companyId },
    });
    if (!thread) throw new AppError("Conversación no encontrada.", 404);
    if (data.template && thread.channel !== "WHATSAPP")
      throw new AppError("Esta plantilla solo sirve para WhatsApp.");
    if (
      !data.template &&
      (!thread.lastIncomingAt ||
        Date.now() - thread.lastIncomingAt.getTime() > 24 * 3600000)
    )
      throw new AppError(
        "La ventana de respuesta de 24 horas terminó. Inicia el contacto desde Meta Business Suite o usa una plantilla aprobada de WhatsApp.",
      );
    return tx.clinicMessage.create({
      data: {
        companyId: ctx.companyId,
        threadId: thread.id,
        requestId: data.requestId,
        direction: "OUT",
        text: storedText,
        status: "SENDING",
      },
    });
  });
  if (outgoing.status !== "SENDING") return outgoing;
  // A persisted SENDING retry cannot be sent again: provider APIs don't guarantee idempotency.
  const claim = await db.clinicMessage.updateMany({
    where: { id: outgoing.id, status: "SENDING" },
    data: { status: "SUBMITTING" },
  });
  if (!claim.count) return outgoing;
  const thread = await db.messageThread.findUniqueOrThrow({
    where: { id: data.threadId },
  });
  const whatsapp = thread.channel === "WHATSAPP",
    account = whatsapp ? connection.whatsappPhoneId : connection.facebookPageId;
  const payload = whatsapp
    ? {
        messaging_product: "whatsapp",
        to: thread.contactId,
        ...(data.template
          ? {
              type: "template",
              template: {
                name: data.template.name,
                language: { code: data.template.language },
                components: data.template.parameters.length
                  ? [
                      {
                        type: "body",
                        parameters: data.template.parameters.map((text) => ({
                          type: "text",
                          text,
                        })),
                      },
                    ]
                  : [],
              },
            }
          : { type: "text", text: { body: data.text } }),
        biz_opaque_callback_data: outgoing.id,
      }
    : { recipient: { id: thread.contactId }, message: { text: data.text } };
  try {
    const response = await fetch(`${graph}/${account}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decryptCalendarUrl(connection.encryptedToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await db.clinicMessage.update({
        where: { id: outgoing.id },
        data: { status: "REJECTED" },
      });
      throw new AppError(
        "Meta rechazó el mensaje. Revisa los permisos de la cuenta.",
      );
    }
    const result = await response.json();
    return db.clinicMessage.update({
      where: { id: outgoing.id },
      data: {
        providerId: result.messages?.[0]?.id || result.message_id || null,
        status: "ACCEPTED",
      },
    });
  } catch (e) {
    await db.clinicMessage.updateMany({
      where: { id: outgoing.id, status: "SUBMITTING" },
      data: { status: "UNCERTAIN" },
    });
    if (e instanceof AppError) throw e;
    throw new AppError(
      "No se confirmó el envío. Verifica la conversación en Meta antes de intentar otro mensaje.",
      503,
    );
  }
}
export function validMetaSignature(
  body: string,
  signature: string,
  secret: string,
) {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return (
    Buffer.byteLength(signature) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
const webhook = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z
        .array(
          z.object({
            value: z.object({
              metadata: z.object({ phone_number_id: z.string() }).optional(),
              contacts: z
                .array(
                  z.object({
                    wa_id: z.string(),
                    profile: z.object({ name: z.string() }).optional(),
                  }),
                )
                .optional(),
              messages: z
                .array(
                  z.object({
                    id: z.string(),
                    from: z.string(),
                    timestamp: z.string(),
                    type: z.string(),
                    text: z.object({ body: z.string() }).optional(),
                  }),
                )
                .optional(),
              statuses: z
                .array(
                  z.object({
                    id: z.string(),
                    status: z.string(),
                    biz_opaque_callback_data: z.string().optional(),
                  }),
                )
                .optional(),
            }),
          }),
        )
        .optional(),
      messaging: z
        .array(
          z.object({
            sender: z.object({ id: z.string() }),
            recipient: z.object({ id: z.string() }),
            timestamp: z.number(),
            message: z
              .object({
                mid: z.string(),
                text: z.string().optional(),
                is_echo: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export async function receiveMessages(input: unknown) {
  const data = webhook.parse(input);
  for (const entry of data.entry) {
    if (data.object === "whatsapp_business_account")
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value.metadata) continue;
        const connection = await db.messagingConnection.findUnique({
          where: { whatsappPhoneId: value.metadata.phone_number_id },
        });
        if (!connection) continue;
        for (const status of value.statuses || []) {
          await db.clinicMessage.updateMany({
            where: {
              companyId: connection.companyId,
              OR: [
                { providerId: status.id },
                ...(status.biz_opaque_callback_data
                  ? [{ id: status.biz_opaque_callback_data }]
                  : []),
              ],
            },
            data: {
              providerId: status.id,
              status: status.status.toUpperCase(),
            },
          });
        }
        for (const message of value.messages || []) {
          const name =
            value.contacts?.find((c) => c.wa_id === message.from)?.profile
              ?.name || message.from;
          await incoming(
            connection.companyId,
            "WHATSAPP",
            message.from,
            message.id,
            name,
            message.text?.body ||
              `[${message.type}: abre Meta para ver el archivo]`,
            new Date(Number(message.timestamp) * 1000),
          );
        }
      }
    if (data.object === "instagram" || data.object === "page") {
      const connection = await db.messagingConnection.findFirst({
        where: {
          OR: [{ instagramId: entry.id }, { facebookPageId: entry.id }],
        },
      });
      if (!connection) continue;
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        await incoming(
          connection.companyId,
          "INSTAGRAM",
          event.sender.id,
          event.message.mid,
          "Instagram · " + event.sender.id,
          event.message.text || "[Contenido multimedia: abre Meta para verlo]",
          new Date(event.timestamp),
        );
      }
    }
  }
}
async function incoming(
  companyId: string,
  channel: string,
  contactId: string,
  providerId: string,
  name: string,
  text: string,
  date: Date,
) {
  await transaction(async (tx) => {
    if (await tx.clinicMessage.findUnique({ where: { providerId } })) return;
    const thread = await tx.messageThread.upsert({
      where: { companyId_channel_contactId: { companyId, channel, contactId } },
      create: { companyId, channel, contactId, name, lastIncomingAt: date },
      update: { name },
    });
    if (!thread.lastIncomingAt || thread.lastIncomingAt < date)
      await tx.messageThread.update({
        where: { id: thread.id },
        data: { lastIncomingAt: date },
      });
    await tx.clinicMessage.create({
      data: {
        companyId,
        threadId: thread.id,
        providerId,
        direction: "IN",
        text: text.slice(0, 4000),
        createdAt: date,
      },
    });
  });
}
export async function saveMessagingClient(ctx: Context, input: unknown) {
  authorize(ctx);
  const data = z
    .object({
      threadId: z.string().min(1),
      name: z.string().trim().min(1).max(200),
    })
    .parse(input);
  const { normalizePhone } = await import("@/lib/phone");
  return transaction(async (tx) => {
    const thread = await tx.messageThread.findFirst({
      where: {
        id: data.threadId,
        companyId: ctx.companyId,
        channel: "WHATSAPP",
      },
    });
    if (!thread) throw new AppError("Selecciona una conversación de WhatsApp.");
    const phone = normalizePhone("+" + thread.contactId);
    const existing = await tx.customer.findFirst({
      where: { companyId: ctx.companyId, phone },
    });
    return (
      existing ||
      tx.customer.create({
        data: { companyId: ctx.companyId, name: data.name, phone },
      })
    );
  });
}
