"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function MessagingSettings({ connected }: { connected: boolean }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details className="panel p-6">
      <summary className="font-semibold cursor-pointer">
        WhatsApp Business e Instagram ·{" "}
        {connected ? "Conectados" : "Enlazar cuentas"}
      </summary>
      <p className="text-sm text-slate-600 my-4">
        Requiere una aplicación de Meta con WhatsApp Cloud API y Messenger para
        Instagram habilitados. El token se guarda cifrado y solo Administración
        puede cambiarlo.
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const form = new FormData(e.currentTarget);
          try {
            const response = await fetch("/api/messaging/connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(form)),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error);
            setMessage(
              "Conectado. Token de verificación del webhook (cópialo en Meta): " +
                data.verifyToken,
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Token de acceso Meta
          <Input name="token" type="password" autoComplete="off" required />
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ["whatsappPhoneId", "ID del número WhatsApp"],
            ["whatsappBusinessId", "ID de cuenta WhatsApp Business"],
            ["instagramId", "ID profesional de Instagram"],
            ["facebookPageId", "ID de página Facebook"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <Input name={name} inputMode="numeric" />
            </label>
          ))}
        </div>
        <Button disabled={busy}>
          {busy ? "Validando…" : "Guardar conexión"}
        </Button>
        {message && (
          <p role="status" className="text-sm break-all">
            {message}
          </p>
        )}
        <p className="text-xs text-slate-600">
          Webhook: /api/messaging/webhook · Configura META_APP_SECRET en Vercel
          y suscribe messages y messaging de las cuentas.
        </p>
      </form>
    </details>
  );
}
