"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { decimal, amount, formatMoney } from "@/lib/money";
import type { CloseData } from "@/server/cash-close";
export function CashCloseForm({
  day,
  received,
}: {
  day: string;
  received: { NIO: string; USD: string };
}) {
  const router = useRouter();
  const [NIO, setNIO] = useState({ opening: "0", out: "0", counted: "" });
  const [USD, setUSD] = useState({ opening: "0", out: "0", counted: "0" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<CloseData | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<unknown>(null);
  const lock = useRef(false);
  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        request.current ||= {
          requestId: crypto.randomUUID(),
          day,
          NIO,
          USD,
          notes,
        };
        try {
          const response = await fetch("/api/cash-close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.current),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status < 500) request.current = null;
            throw new Error(result.error);
          }
          setSaved(result.metadata);
          setPending(false);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
          setPending(Boolean(request.current));
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">Contar efectivo y entregar cierre</h3>
      <p className="text-sm text-slate-500">
        Cuenta los billetes y monedas. Administración revisará el cierre; no
        modifica facturas ni pagos.
      </p>
      <fieldset
        disabled={busy || pending || Boolean(saved)}
        className="space-y-5"
      >
        <div className="grid md:grid-cols-2 gap-4">
          {(["NIO", "USD"] as const).map((currency) => {
            const values = currency === "NIO" ? NIO : USD;
            const setter = currency === "NIO" ? setNIO : setUSD;
            let expected = "0",
              difference = "0";
            try {
              expected = amount(
                decimal(values.opening || "0")
                  .plus(received[currency])
                  .minus(values.out || "0"),
              );
              difference = amount(
                decimal(values.counted || "0").minus(expected),
              );
            } catch {}
            return (
              <section
                key={currency}
                className="rounded-2xl border border-slate-200 bg-white/60 p-5 space-y-4"
              >
                <h4 className="font-semibold">
                  {currency === "NIO" ? "Caja en córdobas" : "Caja en dólares"}
                </h4>
                {(
                  [
                    { key: "opening", label: "Fondo inicial" },
                    { key: "out", label: "Salidas de efectivo" },
                    { key: "counted", label: "Efectivo contado" },
                  ] as const
                ).map((field) => (
                  <label
                    key={field.key}
                    className="block text-xs font-medium text-slate-600"
                  >
                    <span className="block mb-2">{field.label}</span>
                    <Input
                      aria-label={`${field.label} ${currency}`}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={values[field.key]}
                      onChange={(e) =>
                        setter({ ...values, [field.key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <p className="text-sm text-slate-600">
                  Esperado: <strong>{formatMoney(expected, currency)}</strong>
                </p>
                <p
                  className={`text-sm font-semibold ${decimal(difference).isZero() ? "text-emerald-700" : "text-amber-800"}`}
                >
                  Diferencia: {formatMoney(difference, currency)}
                  {values.counted !== "" && decimal(difference).isZero()
                    ? " · Coincide"
                    : ""}
                </p>
              </section>
            );
          })}
        </div>
        <label className="block text-xs font-medium text-slate-600">
          <span className="block mb-2">Observaciones del cierre</span>
          <textarea
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explica salidas, faltantes o sobrantes…"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {saved ? (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          Cierre entregado para revisión. Diferencia NIO:{" "}
          {formatMoney(saved.NIO.difference, "NIO")} · USD:{" "}
          {formatMoney(saved.USD.difference, "USD")}. Los pagos posteriores no
          se incluyen en este cierre.
        </div>
      ) : (
        <Button disabled={busy} className="w-full sm:w-auto">
          {busy
            ? "Guardando…"
            : pending
              ? "Reintentar entrega"
              : "Entregar cierre para revisión"}
        </Button>
      )}
    </form>
  );
}
export function CashCloseReview({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function review(status: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cash-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: id, status, notes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <Input
        aria-label="Nota de revisión"
        placeholder="Nota de revisión (opcional)"
        maxLength={1000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => review("APPROVED")}>
          Aprobar cierre
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => review("REJECTED")}
        >
          Solicitar corrección
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
