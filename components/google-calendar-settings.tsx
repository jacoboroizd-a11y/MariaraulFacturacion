"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePicker } from "./ui/file-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function GoogleCalendarSettings({ connected }: { connected: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(value: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/calendar/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUrl("");
      toast.success(
        result.connected
          ? "Google Calendar conectado"
          : "Calendario desconectado",
      );
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-6">
      <h2 className="font-semibold flex items-center gap-2">
        <CalendarDays size={18} />
        Google Calendar
      </h2>
      <p className="text-sm text-slate-500 mt-3">
        {connected
          ? "Conectado. Sus citas aparecen en la agenda de la clínica."
          : "Muestra las citas de Google junto a las citas de la clínica."}
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/api/calendar/google/connect" prefetch={false}>
          Enlazar cuenta Google · Sincronizar citas
        </Link>
      </Button>
      <p className="text-xs text-slate-500 mt-2">
        Los enlaces y archivos ICS son de solo lectura. Para crear y mover citas
        en Google, enlaza la cuenta. Los enlaces se actualizan al abrir o
        recargar Citas.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const response = await fetch("/api/calendar/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                calendarId: new FormData(e.currentTarget).get("calendarId"),
              }),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error);
            toast.success("Calendario de escritura guardado");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          ID del calendario para sincronizar (después de enlazar Google)
          <Input
            name="calendarId"
            defaultValue="primary"
            required
            maxLength={500}
          />
        </label>
        <Button disabled={busy} variant="outline">
          Usar este calendario
        </Button>
      </form>
      <details className="mt-4">
        <summary className="text-sm text-emerald-700 cursor-pointer">
          Conectar un ICS público o compartido
        </summary>
        <ol className="list-decimal pl-5 space-y-2 mt-3 text-sm text-slate-500">
          <li>Abre Google Calendar en una computadora.</li>
          <li>Ve a Configuración y selecciona el calendario de la clínica.</li>
          <li>
            En Integrar el calendario, copia la Dirección pública o secreta en
            formato iCal.
          </li>
          <li>
            Pega ese enlace aquí. No necesitas hacer público el calendario.
          </li>
        </ol>
        <p className="text-xs text-slate-500 mt-3">
          El enlace da acceso a las citas. Se guarda cifrado y no se muestra
          después. No lo compartas por chat. Si tu organización oculta esa
          opción, su administrador debe habilitar el acceso iCal.
        </p>
      </details>
      <FilePicker
        aria-label="Importar calendario ICS"
        accept=".ics"
        className="mt-4"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            toast.error("Usa un ICS de hasta 2 MB.");
            return;
          }
          setBusy(true);
          try {
            const response = await fetch("/api/calendar/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ics: await file.text() }),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error);
            toast.success("Calendario importado (copia de solo lectura)");
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(url);
        }}
      >
        <label htmlFor="google-calendar-url">
          Enlace de iCal público o privado
        </label>
        <Input
          id="google-calendar-url"
          type="password"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/…"
          required
          disabled={busy}
        />
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy}>
            {busy
              ? "Conectando…"
              : connected
                ? "Actualizar conexión"
                : "Conectar Google Calendar"}
          </Button>
          {connected && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Desconectar el calendario de Google? Tus citas locales se conservan.",
                  )
                )
                  void save("");
              }}
            >
              Desconectar
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
