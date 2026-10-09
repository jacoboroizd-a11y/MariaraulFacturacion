"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ApprovedTemplate } from "@/server/messaging";
import { Button } from "./ui/button";
const replies = [
  "Hola, gracias por escribir a Dra. Mariaraúl. ¿En qué podemos ayudarte?",
  "¿Qué día y hora prefieres para tu cita?",
  "Gracias por tu visita. Estamos a tu disposición.",
];
export function MessageReply({
  threadId,
  allowed,
  templates = [],
}: {
  threadId: string;
  allowed: boolean;
  templates?: ApprovedTemplate[];
}) {
  const router = useRouter(),
    request = useRef<object | null>(null);
  const [templateName, setTemplateName] = useState(""),
    [parameters, setParameters] = useState<string[]>([]),
    [pending, setPending] = useState(false);
  const selected = templates.find(
    (t) => t.name + ":" + t.language === templateName,
  );
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        request.current ||= {
          requestId: crypto.randomUUID(),
          threadId,
          text,
          ...(selected
            ? {
                template: {
                  name: selected.name,
                  language: selected.language,
                  parameters,
                },
              }
            : {}),
        };
        setBusy(true);
        try {
          const response = await fetch("/api/messaging/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.current),
          });
          const data = await response.json();
          if (!response.ok) throw Error(data.error);
          setMessage("Estado: " + data.status);
          setText("");
          request.current = null;
          setPending(false);
          router.refresh();
        } catch (e) {
          setMessage((e as Error).message);
          setPending(Boolean(request.current));
        } finally {
          setBusy(false);
        }
      }}
    >
      {templates.length > 0 && (
        <>
          <select
            aria-label="Plantilla aprobada de WhatsApp"
            value={templateName}
            disabled={busy || pending}
            onChange={(e) => {
              setTemplateName(e.target.value);
              setParameters([]);
            }}
          >
            <option value="">Mensaje libre (últimas 24 horas)</option>
            {templates.map((t) => (
              <option
                key={t.name + ":" + t.language}
                value={t.name + ":" + t.language}
              >
                {t.name} · {t.language}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <p className="text-sm text-slate-600">{selected.body}</p>
              {Array.from({ length: selected.parameters }, (_, i) => (
                <label key={i} className="block text-sm">
                  Variable {i + 1}
                  <input
                    required
                    maxLength={200}
                    value={parameters[i] || ""}
                    onChange={(e) =>
                      setParameters((prev) => {
                        const values = [...prev];
                        values[i] = e.target.value;
                        return values;
                      })
                    }
                  />
                </label>
              ))}
            </>
          )}
        </>
      )}
      <select
        aria-label="Respuestas rápidas"
        disabled={!allowed || busy}
        onChange={(e) => setText(e.target.value)}
        value=""
      >
        <option value="">Usar respuesta rápida…</option>
        {replies.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <textarea
        aria-label="Mensaje"
        maxLength={1000}
        required={!selected}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={(!allowed && !selected) || busy || pending}
        placeholder={
          allowed
            ? "Escribe tu respuesta…"
            : "La ventana de respuesta de 24 horas terminó."
        }
      />
      <Button
        disabled={(!allowed && !selected) || busy || (!text && !selected)}
      >
        {busy ? "Enviando…" : "Enviar respuesta"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <p className="text-xs text-slate-600">
        Las respuestas rápidas son textos preparados; las plantillas de WhatsApp
        fuera de 24 horas requieren aprobación de Meta.
      </p>
    </form>
  );
}
