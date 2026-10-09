"use client";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function CashOpening({
  NIO = "0",
  USD = "0",
  canOpen,
  missed,
  warning,
}: {
  NIO?: string;
  USD?: string;
  canOpen: boolean;
  missed: number;
  warning: boolean;
}) {
  const router = useRouter();
  const [nio, setNio] = useState(NIO),
    [usd, setUsd] = useState(USD),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <form
      className="panel p-6 space-y-5 max-w-xl"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/cash/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ NIO: nio, USD: usd }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-semibold">Apertura de caja</h2>
      <p className="text-sm text-slate-600">
        Cuenta el efectivo antes de empezar. La apertura se habilita a las 08:00
        AM, en días laborales.
      </p>
      {warning && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
          No se hizo cierre manual en la última jornada. Incidencias acumuladas:{" "}
          {missed}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <label>
          Fondo inicial C$
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={nio}
            onChange={(e) => setNio(e.target.value)}
          />
        </label>
        <label>
          Fondo inicial US$
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={usd}
            onChange={(e) => setUsd(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        El monto sugerido es el efectivo que se dejó para hoy; confírmalo
        contando la caja.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={busy || !canOpen}>
        {busy
          ? "Abriendo…"
          : canOpen
            ? "Abrir caja y comenzar"
            : "Apertura no disponible ahora"}
      </Button>
    </form>
  );
}
