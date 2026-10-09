import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, ArrowRight, Sparkles, ShoppingBag, Layers } from "lucide-react";
import { pageContext } from "@/server/auth";
import { list, options, analytics, serialize } from "@/server/queries";
import { DataTable } from "@/components/table";
import { SettingsForm, EntityForm, MemberControls } from "@/components/forms";
import { Reports } from "@/components/reports";
import { Button } from "@/components/ui/button";
import { CatalogImport } from "@/components/catalog-import";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types/view";
const names: Record<
  string,
  { title: string; description: string; new?: string }
> = {
  customers: {
    title: "Clientes",
    description: "Tus clientes y su historial de tratamientos y compras.",
    new: "Nuevo cliente",
  },
  products: {
    title: "Tratamientos y cosméticos",
    description: "Precios, tratamientos individuales y paquetes de sesiones.",
    new: "Agregar al catálogo",
  },
  quotes: {
    title: "Cotizaciones",
    description: "Convierte oportunidades en ventas.",
    new: "Nueva cotización",
  },
  invoices: {
    title: "Facturas",
    description: "Controla tus ventas y el saldo de cada factura.",
    new: "Nueva venta",
  },
  payments: {
    title: "Pagos",
    description: "Cada ingreso registrado y vinculado a su factura.",
    new: "Registrar pago",
  },
  receipts: {
    title: "Recibos",
    description: "Comprobantes de tus pagos recibidos.",
  },
  reports: {
    title: "Reportes",
    description: "Información clara para tomar mejores decisiones.",
  },
  settings: {
    title: "Configuración",
    description: "Personaliza los datos y las reglas de tu empresa.",
  },
  audit: {
    title: "Historial de auditoría",
    description: "Actividad registrada de tu empresa.",
  },
};
export default async function Module({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { module } = await params;
  const ctx = await pageContext();
  const config = names[module];
  if (!config) notFound();
  if ((module === "settings" || module === "audit") && ctx.role !== "ADMIN")
    redirect("/dashboard");
  if (module === "reports") {
    const filters = await searchParams;
    return (
      <>
        <Heading config={config} />
        <Reports data={await analytics(ctx, filters.start, filters.end)} />
      </>
    );
  }
  if (module === "settings") {
    const opts = await options(ctx);
    const users: Row[] = serialize(await list(ctx, "users"));
    const taxes: Row[] = serialize(await list(ctx, "taxes"));
    return (
      <>
        <Heading config={config} />
        <div className="grid xl:grid-cols-[3fr_2fr] gap-6">
          <SettingsForm company={opts.company} />
          <div className="space-y-6">
            <div className="panel p-6">
              <h2 className="font-semibold mb-5">Impuestos</h2>
              {taxes.map((t) => (
                <div
                  className="flex justify-between items-center py-3 border-b border-slate-100 text-sm"
                  key={t.id}
                >
                  <div>
                    {t.name} · {t.rate}%
                    <span className="text-xs text-slate-400 ml-2">
                      {t.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <Link
                    className="text-xs text-emerald-700"
                    href={"/taxes/" + t.id}
                  >
                    Editar
                  </Link>
                </div>
              ))}
              <details className="mt-5">
                <summary className="cursor-pointer text-sm text-emerald-700">
                  Agregar impuesto
                </summary>
                <div className="mt-4">
                  <EntityForm kind="taxes" options={opts} />
                </div>
              </details>
            </div>
            <div className="panel p-6">
              <h2 className="font-semibold mb-4">Usuarios y acceso</h2>
              {users.map((u) => (
                <div key={u.id} className="py-4 border-b border-slate-100">
                  <p className="text-sm font-medium mb-1">{u.user?.name}</p>
                  <p className="text-xs text-slate-400 mb-3">{u.user?.email}</p>
                  {u.user?.id !== ctx.userId ? (
                    <MemberControls row={u} />
                  ) : (
                    <p className="text-xs text-emerald-700">
                      Administrador · Tu cuenta
                    </p>
                  )}
                </div>
              ))}
              <details className="mt-5">
                <summary className="cursor-pointer text-sm text-emerald-700">
                  Crear usuario
                </summary>
                <div className="mt-4">
                  <EntityForm kind="users" options={opts} />
                </div>
              </details>
            </div>
            <Link
              href="/audit"
              className="panel p-5 flex justify-between items-center text-sm text-emerald-800"
            >
              Ver historial de auditoría
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </>
    );
  }
  if (module === "products") {
    const products: Row[] = serialize(await list(ctx, "products"));
    return (
      <>
        <Heading
          config={config}
          module={module}
          canWrite={ctx.role !== "VIEWER"}
        />
        {ctx.role !== "VIEWER" && <CatalogImport products={products} />}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {products.map((p) => {
            const Icon =
              p.type === "PRODUCT"
                ? ShoppingBag
                : (p.sessions || 1) > 1
                  ? Layers
                  : Sparkles;
            return (
              <Link
                href={`/products/${p.id}`}
                key={p.id}
                className="panel p-6 hover:border-emerald-500 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span
                    className={`p-4 rounded-2xl ${p.type === "PRODUCT" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}
                  >
                    <Icon size={28} />
                  </span>
                  <span className="text-xs text-slate-400">
                    {!p.active
                      ? "Inactivo"
                      : p.type === "PRODUCT"
                        ? "Cosmético"
                        : "Tratamiento"}
                  </span>
                </div>
                <h2 className="font-semibold text-lg mt-5">{p.name}</h2>
                <p className="text-emerald-800 text-xl font-semibold mt-3">
                  {formatMoney(p.price || "0", p.currency)}
                  {p.pricingMode === "PER_UNIT" && (
                    <span className="text-xs font-normal"> / {p.unit}</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-3">
                  {p.type === "PRODUCT"
                    ? `${p.stock || 0} unidades disponibles`
                    : p.pricingMode === "PER_UNIT"
                      ? "Total automático según unidades aplicadas"
                      : `${p.sessions || 1} sesiones incluidas`}
                </p>
              </Link>
            );
          })}
        </div>
        {!products.length && (
          <div className="panel p-10 text-center text-slate-500 text-sm">
            Agrega un tratamiento o importa tu lista para comenzar.
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <Heading
        config={config}
        module={module}
        canWrite={ctx.role !== "VIEWER"}
      />
      <DataTable kind={module} rows={serialize(await list(ctx, module))} />
    </>
  );
}
function Heading({
  config,
  module,
  canWrite,
}: {
  config: { title: string; description: string; new?: string };
  module?: string;
  canWrite?: boolean;
}) {
  return (
    <div className="mb-7 flex flex-wrap justify-between items-center gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {config.title}
        </h1>
        <p className="text-sm text-slate-500 mt-2">{config.description}</p>
      </div>
      {config.new && canWrite && (
        <Button asChild>
          <Link href={module === "invoices" ? "/sales" : "/" + module + "/new"}>
            <Plus size={15} />
            {config.new}
          </Link>
        </Button>
      )}
    </div>
  );
}
