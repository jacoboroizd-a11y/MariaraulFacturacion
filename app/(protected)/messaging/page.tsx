import { MessagingClient } from "@/components/messaging-client";
import { approvedTemplates } from "@/server/messaging";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { MessageReply } from "@/components/message-reply";
import { MessagingSettings } from "@/components/messaging-settings";
import { Button } from "@/components/ui/button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const ctx = await pageContext();
  if (!["ADMIN", "BILLING"].includes(ctx.role)) redirect("/");
  const params = await searchParams;
  const [connection, threads] = await Promise.all([
    db.messagingConnection.findUnique({
      where: { companyId: ctx.companyId },
      select: { id: true },
    }),
    db.messageThread.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const templates = connection ? await approvedTemplates(ctx.companyId) : [];
  const selected = threads.find((t) => t.id === params.thread) || threads[0];
  const messages = selected
    ? await db.clinicMessage.findMany({
        where: { companyId: ctx.companyId, threadId: selected.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];
  return (
    <>
      <h1 className="text-3xl font-semibold mb-3">Mensajería</h1>
      <p className="text-sm text-slate-600 mb-6">
        WhatsApp Business e Instagram · Responde a tus pacientes.
      </p>
      {ctx.role === "ADMIN" && (
        <MessagingSettings connected={Boolean(connection)} />
      )}
      <div className="my-5">
        <Button asChild variant="outline">
          <a
            href="https://business.facebook.com/latest/inbox/all"
            target="_blank"
            rel="noreferrer"
          >
            Abrir Meta Business Suite
          </a>
        </Button>
      </div>
      {!connection ? (
        <div className="panel p-6">
          <p>Las cuentas todavía no están enlazadas a la aplicación.</p>
          <p className="text-sm text-slate-600 mt-3">
            Administración debe conectar Meta. Mientras tanto puedes responder
            desde Business Suite.
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          <nav
            className="panel p-3 max-h-96 overflow-auto"
            aria-label="Conversaciones"
          >
            {threads.map((t) => (
              <Link
                key={t.id}
                href={`/messaging?thread=${t.id}`}
                className={`block rounded-xl p-4 ${t.id === selected?.id ? "bg-emerald-50" : "hover:bg-white"}`}
              >
                <strong className="text-sm">{t.name || t.contactId}</strong>
                <p className="text-xs text-slate-600 mt-1">{t.channel}</p>
              </Link>
            ))}
            {!threads.length && (
              <p className="p-4 text-sm text-slate-600">
                Las conversaciones nuevas aparecerán al recibir mensajes por el
                webhook.
              </p>
            )}
          </nav>
          <section className="panel p-5 min-w-0">
            {selected && (
              <>
                <h2 className="font-semibold mb-4">
                  {selected.name || selected.contactId}
                </h2>
                {selected.channel === "WHATSAPP" && (
                  <MessagingClient
                    threadId={selected.id}
                    name={selected.name}
                  />
                )}
                <div className="space-y-3 max-h-[28rem] overflow-y-auto">
                  {messages.reverse().map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[90%] p-3 rounded-2xl ${m.direction === "OUT" ? "ml-auto bg-emerald-50" : "bg-slate-50"}`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {m.text}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2">
                        {m.createdAt.toLocaleString("es-NI", {
                          timeZone: "America/Managua",
                        })}{" "}
                        · {m.status}
                      </p>
                    </div>
                  ))}
                </div>
                <MessageReply
                  templates={selected.channel === "WHATSAPP" ? templates : []}
                  threadId={selected.id}
                  allowed={Boolean(
                    selected.lastIncomingAt &&
                    new Date().getTime() - selected.lastIncomingAt.getTime() <
                      86400000,
                  )}
                />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
