"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CalendarDays } from "lucide-react";
import { api } from "./forms";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { appointmentInput } from "@/lib/utils";
import type { Row } from "@/types/view";
export function SessionButton({
  item,
}: {
  item: NonNullable<Row["items"]>[number];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pending = useRef<string | null>(null);
  const lock = useRef(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || (item.sessionsUsed || 0) >= (item.sessionsTotal || 0)}
      onClick={async () => {
        if (lock.current) return;
        if (
          !pending.current &&
          !confirm(`¿Registrar una sesión realizada de ${item.description}?`)
        )
          return;
        lock.current = true;
        setBusy(true);
        try {
          pending.current ||= crypto.randomUUID();
          await api(`sessions/${item.id}`, { requestId: pending.current });
          pending.current = null;
          toast.success("Sesión registrada");
          router.refresh();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <Check size={14} />
      {busy ? "Guardando…" : "Registrar sesión"}
    </Button>
  );
}
export function AppointmentForm({ invoice }: { invoice: Row }) {
  const router = useRouter();
  const [value, setValue] = useState(appointmentInput(invoice.nextAppointment));
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap gap-3 items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(
            `appointments/${invoice.id}`,
            { nextAppointment: value },
            "PUT",
          );
          toast.success("Cita actualizada");
          router.refresh();
        } catch (error) {
          toast.error((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex-1">
        <label htmlFor={`appointment-${invoice.id}`}>
          Próxima cita · Hora de Nicaragua
        </label>
        <Input
          id={`appointment-${invoice.id}`}
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button variant="outline" disabled={busy}>
        <CalendarDays size={14} />
        {busy ? "Guardando…" : "Guardar cita"}
      </Button>
    </form>
  );
}
