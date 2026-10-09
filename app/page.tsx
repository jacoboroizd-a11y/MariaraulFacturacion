import { Shell } from "@/components/shell";
import Link from "next/link";
import { pageContext } from "@/server/auth";
import { cashState } from "@/server/cash-register";
import {
  CreditCard,
  FileText,
  MessagesSquare,
  CalendarDays,
  Package,
  BarChart3,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
export default async function Home() {
  const ctx = await pageContext();
  const links =
    ctx.role === "ACCOUNTANT"
      ? [
          {
            href: "/accounting?kind=day",
            label: "Reporte diario",
            icon: FileText,
            description: "Consulta y descarga el cierre del día",
          },
          {
            href: "/accounting?kind=month",
            label: "Reporte mensual",
            icon: BarChart3,
            description: "Consulta y descarga las ventas del mes",
          },
        ]
      : ctx.role === "ADMIN"
        ? [
            {
              href: "/daily-close",
              label: "Apertura y cierre de caja",
              icon: CreditCard,
              description: "Contar efectivo y cerrar la jornada",
            },
            {
              href: "/accounting?kind=day",
              label: "Reportes diarios",
              icon: FileText,
              description: "Pagos, efectivo y cierres",
            },
            {
              href: "/accounting?kind=month",
              label: "Reportes mensuales",
              icon: BarChart3,
              description: "Treat Yourself, láser y estética",
            },
            {
              href: "/products",
              label: "Inventario y tratamientos",
              icon: Package,
              description: "Catálogo, precios y existencias",
            },
            {
              href: "/dashboard",
              label: "Dashboard",
              icon: LayoutDashboard,
              description: "Resumen de la clínica",
            },
          ]
        : [
            {
              href: "/sales",
              label: "Crear factura",
              icon: FileText,
              description: "Tratamientos, productos y cobros",
            },
            {
              href: "/messaging",
              label: "Mensajería",
              icon: MessagesSquare,
              description: "Responder a tus pacientes",
            },
            {
              href: "/appointments",
              label: "Citas",
              icon: CalendarDays,
              description: "Crear y mover citas",
            },
            {
              href: "/daily-close",
              label: "Apertura y cierre",
              icon: CreditCard,
              description: "Abrir caja antes de facturar",
            },
          ];
  const cash = ["ADMIN", "BILLING"].includes(ctx.role)
    ? await cashState(ctx)
    : null;
  return (
    <Shell ctx={ctx}>
      <div className="max-w-4xl mx-auto py-4 sm:py-10">
        <p className="text-sm font-medium text-emerald-700 mb-3">
          DRA. MARIARAÚL · MEDICINA ESTÉTICA
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold">
          Hola, {ctx.name}.
        </h1>
        <p className="text-base text-slate-600 mt-4 mb-8">
          ¿Qué necesitas hacer hoy?
        </p>
        {cash && (
          <p className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 mb-6 text-sm text-emerald-900">
            {cash.canBill
              ? "Caja abierta · Puedes comenzar a facturar."
              : cash.day?.status === "CLOSED"
                ? "Caja cerrada · La próxima apertura será en la siguiente jornada."
                : "Primero realiza la apertura de caja para habilitar la facturación."}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="panel p-6 sm:p-8 hover:border-emerald-600 transition-colors"
            >
              <link.icon className="text-emerald-700 mb-5" size={28} />
              <h2 className="text-xl font-semibold flex justify-between gap-3">
                {link.label}
                <ArrowRight size={20} />
              </h2>
              <p className="text-sm text-slate-600 mt-3">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}
