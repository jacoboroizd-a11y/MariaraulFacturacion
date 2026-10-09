"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCountries, type CountryCode } from "libphonenumber-js";
import { FilePicker } from "./ui/file-picker";
import { Button } from "./ui/button";
const names = new Intl.DisplayNames(["es"], { type: "region" });
type ImportRow = {
  name: string;
  phone: string;
  email: string;
  duplicate: boolean;
};
export function ClientImport() {
  const router = useRouter();
  const [country, setCountry] = useState<CountryCode>("NI"),
    [rows, setRows] = useState<ImportRow[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const key = useRef<string | null>(null);
  return (
    <details className="panel p-5 mb-6">
      <summary className="cursor-pointer font-semibold">
        Importar clientes desde Excel
      </summary>
      <p className="text-sm text-slate-600 my-4">
        Primera hoja, hasta 500 clientes. Se omiten teléfonos o correos ya
        registrados; los datos existentes se conservan.
      </p>
      <a
        href="/plantilla-clientes.xlsx"
        download
        className="text-sm underline text-emerald-800"
      >
        Descargar plantilla de clientes
      </a>
      <div className="flex flex-wrap gap-4 items-end mt-4">
        <label className="text-sm space-y-2">
          <span className="block">País para teléfonos sin prefijo</span>
          <select
            value={country}
            disabled={busy}
            onChange={(e) => {
              setCountry(e.target.value as CountryCode);
              setRows([]);
            }}
          >
            {getCountries()
              .sort((a, b) =>
                (names.of(a) || a).localeCompare(names.of(b) || b),
              )
              .map((c) => (
                <option key={c} value={c}>
                  {names.of(c)}
                </option>
              ))}
          </select>
        </label>
        <FilePicker
          aria-label="Seleccionar Excel"
          accept=".xlsx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setMessage("");
            setRows([]);
            key.current = null;
            try {
              const body = new FormData();
              body.set("file", file);
              body.set("country", country);
              const response = await fetch("/api/clients/import", {
                method: "POST",
                body,
              });
              const data = await response.json();
              if (!response.ok) throw Error(data.error);
              setRows(data.rows);
              setErrors(data.errors);
            } catch (e) {
              setErrors([(e as Error).message]);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      {errors.length > 0 && (
        <p
          role="alert"
          className="text-sm text-red-700 mt-4 whitespace-pre-line"
        >
          {errors.join("\n")}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto max-h-64 mt-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.phone}</td>
                    <td>{r.email}</td>
                    <td>{r.duplicate ? "Ya registrado" : "Crear"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="mt-4"
            disabled={busy || errors.length > 0}
            onClick={async () => {
              setBusy(true);
              key.current ||= crypto.randomUUID();
              try {
                const response = await fetch("/api/clients/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ requestId: key.current, rows }),
                });
                const data = await response.json();
                if (!response.ok) throw Error(data.error);
                setMessage(
                  `${data.added} clientes creados · ${data.skipped} duplicados omitidos`,
                );
                setRows([]);
                router.refresh();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar importación
          </Button>
        </>
      )}
      {message && (
        <p role="status" className="text-sm mt-4">
          {message}
        </p>
      )}
    </details>
  );
}
