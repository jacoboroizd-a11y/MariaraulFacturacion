"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
      <p className="text-xs text-slate-500 mt-2">
        Solo lectura. Las citas de Google se editan en Google Calendar. Se
        actualizan al abrir o recargar Citas.
      </p>
      <details className="mt-4">
        <summary className="text-sm text-emerald-700 cursor-pointer">
          Cómo encontrar el enlace privado
        </summary>
        <ol className="list-decimal pl-5 space-y-2 mt-3 text-sm text-slate-500">
          <li>Abre Google Calendar en una computadora.</li>
          <li>Ve a Configuración y selecciona el calendario de la clínica.</li>
          <li>
            En Integrar el calendario, copia Dirección secreta en formato iCal.
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
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(url);
        }}
      >
        <label htmlFor="google-calendar-url">Dirección secreta de iCal</label>
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
