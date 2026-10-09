"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { formatMoney } from "@/lib/money";
import type { CatalogRow } from "@/server/catalog-import";
import type { Row } from "@/types/view";
export function CatalogImport({ products }: { products: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<CatalogRow[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false);
  const key = useRef<string | null>(null),
    lock = useRef(false);
  return (
    <details className="panel p-5 mb-6">
      <summary className="cursor-pointer font-medium text-sm flex items-center gap-2">
        <Upload size={17} />
        Importar tratamientos y cosméticos desde Excel / CSV
      </summary>
      <div className="mt-5 space-y-4">
        <p className="text-sm text-slate-500">
          Primera hoja, hasta 200 artículos. Columnas obligatorias:{" "}
          <strong>nombre</strong> y <strong>precio</strong>. El precio es fijo o
          por unidad según la columna <strong>cobro</strong>.
        </p>
        <p className="text-xs text-slate-500">
          tipo: tratamiento, paquete o cosmético · cobro: fijo o unidad ·
          moneda: NIO o USD · sesiones: cantidad del paquete · existencias:
          unidades de cosméticos. Un código ya existente actualiza ese artículo;
          omitir existencias conserva su stock. Las existencias indicadas
          reemplazan el conteo actual. Los precios usan los impuestos que ya
          tenga configurados el artículo.
        </p>
        <a
          href="/plantilla-catalogo.csv"
          download
          className="text-sm text-emerald-700 underline"
        >
          Descargar plantilla CSV
        </a>
        <label className="block">
          Archivo .xlsx o .csv
          <input
            aria-label="Archivo del catálogo"
            type="file"
            accept=".xlsx,.csv"
            disabled={busy || pending}
            className="block mt-2 text-sm font-normal"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setRows([]);
              setErrors([]);
              key.current = null;
              try {
                const form = new FormData();
                form.append("file", file);
                const response = await fetch("/api/catalog/preview", {
                  method: "POST",
                  body: form,
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                setRows(result.rows);
                setErrors(result.errors);
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {errors.length > 0 && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 p-4 text-xs text-red-700 space-y-2"
          >
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
            <p>
              Corrige el archivo y vuelve a seleccionarlo. No se ha guardado
              ningún artículo.
            </p>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto border rounded-lg">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Precio</th>
                    <th>Sesiones</th>
                    <th>Stock</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.sku}>
                      <td>
                        {r.name}
                        <p className="text-xs text-slate-400">
                          {r.sku} ·{" "}
                          {r.type === "SERVICE" ? "Tratamiento" : "Cosmético"}
                        </p>
                      </td>
                      <td>
                        {formatMoney(r.price, r.currency)}
                        {r.pricingMode === "PER_UNIT" ? ` / ${r.unit}` : ""}
                      </td>
                      <td>{r.type === "SERVICE" ? r.sessions : "—"}</td>
                      <td>
                        {r.type === "PRODUCT"
                          ? (r.stock ?? "Conservar / 0 si es nuevo")
                          : "—"}
                      </td>
                      <td>
                        {products.some((p) => p.sku === r.sku)
                          ? "Actualizar"
                          : "Crear"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              disabled={busy || errors.length > 0}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                try {
                  key.current ||= crypto.randomUUID();
                  const response = await fetch("/api/data/catalog-import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ requestId: key.current, rows }),
                  });
                  const result = await response.json();
                  if (!response.ok) {
                    if (response.status < 500) key.current = null;
                    throw new Error(result.error);
                  }
                  toast.success(`${result.count} artículos importados`);
                  setRows([]);
                  setPending(false);
                  key.current = null;
                  router.refresh();
                } catch (error) {
                  setPending(Boolean(key.current));
                  toast.error((error as Error).message);
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <FileSpreadsheet size={16} />
              {busy
                ? "Procesando…"
                : pending
                  ? "Reintentar importación"
                  : `Guardar ${rows.length} artículos`}
            </Button>
          </>
        )}
        {busy && !rows.length && (
          <p className="text-xs text-slate-500">Leyendo archivo…</p>
        )}
      </div>
    </details>
  );
}
