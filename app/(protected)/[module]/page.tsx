import { ClientImport } from "@/components/client-import";
import { CashCloseReviews } from "@/components/cash-close-reviews";
import { DailyClose } from "@/components/daily-close";
import { InventorySection } from "@/components/inventory-section";
import { GoogleCalendarSettings } from "@/components/google-calendar-settings";
import { db } from "@/server/db";
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
    title: "Catálogo e inventario",
    description:
      "Tratamientos, cosméticos, precios y existencias en un solo lugar.",
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
    new: "Nueva factura",
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
  searchParams: Promise<{
    start?: string;
    end?: string;
    day?: string;
    view?: string;
  }>;
}) {
  const { module } = await params;
  const ctx = await pageContext();
  if (ctx.role === "ACCOUNTANT") redirect("/accounting");
  if (ctx.role !== "ADMIN" && !["customers", "invoices"].includes(module))
    redirect("/");
  const config = names[module];
  if (!config) notFound();
  if (
    (module === "settings" || module === "audit" || module === "reports") &&
    ctx.role !== "ADMIN"
  )
    redirect("/dashboard");
  if (module === "reports") {
    const filters = await searchParams;
    return (
      <>
        <Heading config={config} />
        <DailyClose ctx={ctx} day={filters.day} />
        <Reports data={await analytics(ctx, filters.start, filters.end)} />
      </>
    );
  }
  if (module === "settings") {
    const calendarConnected = Boolean(
      await db.calendarConnection.findUnique({
        where: { companyId: ctx.companyId },
        select: { companyId: true },
      }),
    );
    const opts = await options(ctx);
    const users: Row[] = serialize(await list(ctx, "users"));
    const taxes: Row[] = serialize(await list(ctx, "taxes"));
    return (
      <>
        <Heading config={config} />
        <div className="grid xl:grid-cols-[3fr_2fr] gap-6">
          <SettingsForm company={opts.company} />
          <div className="space-y-6">
            <GoogleCalendarSettings connected={calendarConnected} />
            <div className="panel p-6">
              <h2 className="font-semibold mb-2">Impuestos</h2>
              <p className="text-sm text-slate-500 mb-5">
                Añade los impuestos que utilices y asígnalos a cada tratamiento
                o cosmético desde el catálogo. Puedes vender sin impuesto.
              </p>
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
              <details className="mt-5" open={taxes.length === 0}>
                <summary className="cursor-pointer rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
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
                  <p className="text-xs text-slate-400 mb-3">
                    {u.user?.username || u.user?.email}
                  </p>
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
        <CashCloseReviews ctx={ctx} />
      </>
    );
  }
  if (module === "products") {
    const products: Row[] = serialize(await list(ctx, "products"));
    const inventoryView = ["inventory", "cosmetics"].includes(
      (await searchParams).view || "",
    );
    const treatments = products.filter((p) => p.type !== "PRODUCT");
    return (
      <>
        <Heading
          config={config}
          module={module}
          canWrite={ctx.role !== "VIEWER"}
        />
        {ctx.role !== "VIEWER" && (
          <CatalogImport
            products={products}
            initialMode={inventoryView ? "PRODUCT" : "SERVICE"}
          />
        )}
        <nav
          aria-label="Vistas del catálogo"
          className="flex flex-wrap gap-2 mb-6"
        >
          {[
            {
              href: "/products",
              label: "Tratamientos",
              active: !inventoryView,
            },
            {
              href: "/products?view=cosmetics",
              label: "Cuidado personal y cosméticos",
              active: inventoryView,
            },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`rounded-xl px-4 py-3 text-sm ${tab.active ? "bg-emerald-100 text-emerald-900 font-semibold" : "text-slate-600 hover:bg-white"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {inventoryView ? (
          <InventorySection />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {treatments.map((p) => {
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
                        className={`p-4 rounded-2xl ${p.type === "PRODUCT" ? "bg-emerald-50 text-emerald-700" : "bg-emerald-50 text-emerald-700"}`}
                      >
                        <Icon size={28} />
                      </span>
                      <span className="text-xs text-slate-400">
                        {!p.active
                          ? "Inactivo"
                          : p.type === "PRODUCT"
                            ? "Producto"
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
            {!treatments.length && (
              <div className="panel p-10 text-center text-slate-500 text-sm">
                Agrega un tratamiento o importa tu lista para comenzar.
              </div>
            )}
          </>
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
      {module === "customers" && ctx.role === "ADMIN" && <ClientImport />}
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
