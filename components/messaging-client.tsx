"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function MessagingClient({
  threadId,
  name,
}: {
  threadId: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details className="my-4">
      <summary className="cursor-pointer text-sm text-emerald-800">
        Guardar como cliente
      </summary>
      <form
        className="flex flex-wrap gap-3 mt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const response = await fetch("/api/messaging/client", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                threadId,
                name: new FormData(e.currentTarget).get("name"),
              }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            setMessage("Cliente guardado: " + result.name);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          name="name"
          required
          maxLength={200}
          defaultValue={name}
          aria-label="Nombre del cliente de WhatsApp"
        />
        <Button disabled={busy}>Guardar cliente</Button>
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
