"use client";
import { useHydrated } from "@/hooks/use-hydrated";
import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Row, Options, CompanyView } from "@/types/view";
export async function api(path: string, body: unknown = {}, method = "POST") {
  const res = await fetch("/api/data/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Error al guardar.");
  return data;
}
type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  full?: boolean;
};
function Fields({
  fields,
  register,
}: {
  fields: Field[];
  register: ReturnType<
    typeof useForm<Record<string, string | boolean | number>>
  >["register"];
}) {
  const prefix = useId();
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className={f.full ? "md:col-span-2" : ""}>
          <label htmlFor={prefix + f.key}>
            {f.label}
            {f.required ? " *" : ""}
          </label>
          {f.options ? (
            <select id={prefix + f.key} {...register(f.key)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea id={prefix + f.key} rows={3} {...register(f.key)} />
          ) : f.type === "checkbox" ? (
            <input
              id={prefix + f.key}
              type="checkbox"
              className="h-5 w-5 accent-emerald-700"
              {...register(f.key)}
            />
          ) : (
            <Input
              id={prefix + f.key}
              type={f.type || "text"}
              required={f.required}
              step={f.type === "number" ? "0.01" : undefined}
              {...register(f.key)}
            />
          )}
        </div>
      ))}
    </>
  );
}
export function EntityForm({
  kind,
  initial,
  options,
}: {
  kind: "customers" | "products" | "taxes" | "users";
  initial?: Row;
  options: Options;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const defaults: Record<string, string | boolean | number> = {
    active: true,
    type: "PRODUCT",
    currency: "NIO",
    unit: "unidad",
    price: "0",
    taxId: "",
    role: "BILLING",
    rate: "15",
  };
  if (initial)
    for (const [k, v] of Object.entries(initial))
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      )
        defaults[k] = v;
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Record<string, string | boolean | number>>({
    defaultValues: defaults,
  });
  const customerFields: Field[] = [
    { key: "name", label: "Nombre del cliente", required: true },
    { key: "ruc", label: "RUC / Cédula" },
    { key: "legalName", label: "Razón social" },
    { key: "tradeName", label: "Nombre comercial" },
    { key: "email", label: "Correo electrónico", type: "email" },
    { key: "phone", label: "Teléfono" },
    { key: "address", label: "Dirección" },
    { key: "city", label: "Ciudad" },
    { key: "notes", label: "Notas", type: "textarea", full: true },
    { key: "active", label: "Cliente activo", type: "checkbox" },
  ];
  const productFields: Field[] = [
    { key: "name", label: "Nombre", required: true },
    { key: "sku", label: "Código / SKU", required: true },
    {
      key: "type",
      label: "Tipo",
      options: [
        { value: "PRODUCT", label: "Producto" },
        { value: "SERVICE", label: "Servicio" },
      ],
    },
    { key: "category", label: "Categoría" },
    { key: "price", label: "Precio", type: "number", required: true },
    {
      key: "currency",
      label: "Moneda",
      options: [
        { value: "NIO", label: "Córdobas (NIO)" },
        { value: "USD", label: "Dólares (USD)" },
      ],
    },
    { key: "unit", label: "Unidad", required: true },
    {
      key: "taxId",
      label: "Impuesto",
      options: [
        { value: "", label: "Sin impuesto" },
        ...options.taxes.map((t) => ({
          value: t.id,
          label: `${t.name} (${t.rate}%)`,
        })),
      ],
    },
    { key: "description", label: "Descripción", type: "textarea", full: true },
    { key: "active", label: "Producto activo", type: "checkbox" },
  ];
  const fields =
    kind === "customers"
      ? customerFields
      : kind === "products"
        ? productFields
        : kind === "taxes"
          ? ([
              { key: "name", label: "Nombre", required: true },
              {
                key: "rate",
                label: "Tasa (%)",
                type: "number",
                required: true,
              },
              { key: "active", label: "Activo", type: "checkbox" },
            ] as Field[])
          : ([
              { key: "name", label: "Nombre", required: true },
              { key: "email", label: "Correo", type: "email", required: true },
              {
                key: "password",
                label: "Contraseña (mínimo 12 caracteres)",
                type: "password",
                required: true,
              },
              {
                key: "role",
                label: "Rol",
                options: [
                  { value: "ADMIN", label: "Administrador" },
                  { value: "BILLING", label: "Facturación" },
                  { value: "VIEWER", label: "Solo lectura" },
                ],
              },
            ] as Field[]);
  return (
    <form
      method="post"
      className="panel p-6 max-w-4xl"
      onSubmit={handleSubmit(async (values) => {
        try {
          const result = await api(
            kind + (initial ? "/" + initial.id : ""),
            values,
            initial ? "PUT" : "POST",
          );
          toast.success("Guardado correctamente");
          router.push(
            kind === "taxes" || kind === "users"
              ? "/settings"
              : `/${kind}/${result.id}`,
          );
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      })}
    >
      <div className="grid md:grid-cols-2 gap-5">
        <Fields fields={fields} register={register} />
      </div>
      <div className="flex justify-end gap-3 mt-7 pt-5 border-t border-slate-100">
        <Button variant="outline" type="button" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button disabled={isSubmitting || !hydrated}>
          {isSubmitting ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
export function SettingsForm({ company }: { company: CompanyView }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const { settings, ...base } = company;
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isSubmitting },
  } = useForm<Record<string, string | boolean | number>>({
    defaultValues: { ...base, ...settings },
  });
  const logo = useWatch({ control, name: "logo" });
  const [fileError, setFileError] = useState("");
  const fields: Field[] = [
    { key: "name", label: "Razón social", required: true },
    { key: "tradeName", label: "Nombre comercial" },
    { key: "ruc", label: "RUC" },
    { key: "email", label: "Correo", type: "email" },
    { key: "phone", label: "Teléfono" },
    { key: "address", label: "Dirección" },
    {
      key: "primaryCurrency",
      label: "Moneda principal",
      options: [
        { value: "NIO", label: "NIO" },
        { value: "USD", label: "USD" },
      ],
    },
    {
      key: "secondaryCurrency",
      label: "Moneda secundaria",
      options: [
        { value: "NIO", label: "NIO" },
        { value: "USD", label: "USD" },
      ],
    },
    { key: "exchangeRate", label: "Tipo de cambio (NIO por USD)" },
    {
      key: "dateFormat",
      label: "Formato de fecha",
      options: ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"].map((v) => ({
        value: v,
        label: v,
      })),
    },
    { key: "invoicePrefix", label: "Prefijo factura" },
    { key: "nextInvoice", label: "Siguiente factura", type: "number" },
    { key: "quotePrefix", label: "Prefijo cotización" },
    { key: "nextQuote", label: "Siguiente cotización", type: "number" },
    { key: "receiptPrefix", label: "Prefijo recibo" },
    { key: "nextReceipt", label: "Siguiente recibo", type: "number" },
    {
      key: "bankInfo",
      label: "Información bancaria",
      type: "textarea",
      full: true,
    },
    { key: "terms", label: "Términos estándar", type: "textarea", full: true },
    { key: "notes", label: "Notas estándar", type: "textarea", full: true },
  ];
  return (
    <form
      method="post"
      className="panel p-6"
      onSubmit={handleSubmit(async (values) => {
        try {
          await api("settings", values);
          toast.success("Configuración actualizada");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      })}
    >
      <h2 className="font-semibold mb-6">Información de la empresa</h2>
      <div className="grid md:grid-cols-2 gap-5">
        <Fields fields={fields} register={register} />
        <div className="md:col-span-2">
          <label htmlFor="logoFile">Logo (PNG o JPG, máximo 250 KB)</label>
          <Input
            id="logoFile"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                file.size > 250000 ||
                !["image/png", "image/jpeg"].includes(file.type)
              ) {
                setFileError("Selecciona un PNG o JPG de máximo 250 KB.");
                return;
              }
              setFileError("");
              const reader = new FileReader();
              reader.onload = () => setValue("logo", String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
          {logo && (
            <p className="mt-2 text-xs text-emerald-700">
              Logo configurado{" "}
              <button
                type="button"
                className="underline ml-2"
                onClick={() => setValue("logo", "")}
              >
                Quitar
              </button>
            </p>
          )}
          {fileError && (
            <p className="text-red-600 text-xs mt-2">{fileError}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-5 mt-6">
        <Button disabled={isSubmitting || !hydrated}>
          {isSubmitting ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
export function ActionButton({
  path,
  action,
  label,
  destructive = false,
  redirectTo,
}: {
  path: string;
  action?: string;
  label: string;
  destructive?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      variant={destructive ? "outline" : "default"}
      size="sm"
      onClick={async () => {
        if (
          destructive &&
          !confirm(
            `${label}: ¿estás seguro? Esta operación quedará en el historial.`,
          )
        )
          return;
        setBusy(true);
        try {
          const result = await api(
            path + (action ? "/" + action : ""),
            {},
            action ? "POST" : "DELETE",
          );
          toast.success("Operación completada");
          if (redirectTo) router.push(redirectTo);
          else if (action === "convert") router.push("/invoices/" + result.id);
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Procesando…" : label}
    </Button>
  );
}
export function MemberControls({ row }: { row: Row }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <select
        aria-label={"Rol de " + row.user?.name}
        className="w-40"
        defaultValue={row.role}
        onChange={async (e) => {
          try {
            await api(
              "users/" + row.user?.id,
              { role: e.target.value, active: true },
              "PUT",
            );
            toast.success("Rol actualizado");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <option value="ADMIN">Administrador</option>
        <option value="BILLING">Facturación</option>
        <option value="VIEWER">Consulta</option>
      </select>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          if (!confirm("¿Revocar acceso a esta empresa?")) return;
          try {
            await api(
              "users/" + row.user?.id,
              { role: row.role, active: false },
              "PUT",
            );
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Revocar acceso
      </Button>
    </div>
  );
}
