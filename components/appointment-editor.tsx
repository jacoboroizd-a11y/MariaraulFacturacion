"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { appointmentInput } from "@/lib/utils";
import type { Row } from "@/types/view";
export type AppointmentView = {
  id: string;
  title: string;
  start: string;
  end: string;
  customerId?: string | null;
  version: number;
  syncStatus: string;
};
export function AppointmentEditor({
  customers,
  initial,
}: {
  customers: Row[];
  initial?: AppointmentView;
}) {
  const router = useRouter(),
    key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const data = new FormData(e.currentTarget);
        key.current ||= crypto.randomUUID();
        setBusy(true);
        try {
          const response = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: key.current,
              id: initial?.id,
              version: initial?.version,
              title: data.get("title"),
              customerId: data.get("customerId") || undefined,
              start: data.get("start"),
              end: data.get("end"),
              cancelled: data.get("cancelled") === "on",
            }),
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error);
          setMessage(
            "Cita guardada. Si Google está enlazado, se sincroniza con el mismo evento.",
          );
          router.refresh();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="grid sm:grid-cols-2 gap-4" disabled={busy}>
        <label>
          Título
          <Input
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title}
            placeholder="Paciente · Tratamiento"
          />
        </label>
        <label>
          Cliente (opcional)
          <select name="customerId" defaultValue={initial?.customerId || ""}>
            <option value="">Sin cliente registrado</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inicio · Hora de Nicaragua
          <Input
            name="start"
            type="datetime-local"
            required
            defaultValue={appointmentInput(initial?.start)}
          />
        </label>
        <label>
          Final
          <Input
            name="end"
            type="datetime-local"
            required
            defaultValue={appointmentInput(initial?.end)}
          />
        </label>
        {initial && (
          <label className="flex items-center gap-2">
            <input name="cancelled" type="checkbox" />
            Cancelar cita
          </label>
        )}
      </fieldset>
      <Button disabled={busy}>
        {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear cita"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-emerald-800">
          {message}
        </p>
      )}
    </form>
  );
}
