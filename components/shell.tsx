"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ReceiptText,
  CreditCard,
  Users,
  Package,
  BarChart3,
  Settings,
  Search,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import type { Context } from "@/server/auth";
const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quotes", label: "Cotizaciones", icon: FileText },
  { href: "/invoices", label: "Facturas", icon: ReceiptText },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/receipts", label: "Recibos", icon: ReceiptText },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos y servicios", icon: Package },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];
export function Shell({
  ctx,
  children,
}: {
  ctx: Context;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { label: string; href: string; kind: string }[]
  >([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      fetch("/api/data/search?q=" + encodeURIComponent(q), {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((d) => setResults(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 w-60 bg-white border-r border-slate-200 z-40 flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="h-20 flex items-center px-7 text-2xl font-bold tracking-tight text-[#163d33]">
          mariaraul<span className="text-emerald-600">.</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="ml-auto lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mx-4 mb-5 rounded-lg border border-slate-200 p-3 flex items-center gap-3">
          <div className="h-8 w-8 bg-emerald-50 text-emerald-800 rounded-md flex items-center justify-center font-semibold">
            {ctx.companyName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{ctx.companyName}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              Espacio de trabajo
            </p>
          </div>
          <ChevronDown size={13} className="ml-auto text-slate-400" />
        </div>
        <nav className="px-3 space-y-1">
          {nav.map((n, i) => (
            <div key={n.href}>
              {i === 1 && (
                <p className="text-[10px] tracking-wider text-slate-400 px-3 pt-5 pb-2">
                  VENTAS
                </p>
              )}
              {i === 5 && <div className="my-4 border-t border-slate-100" />}
              {(n.href != "/settings" || ctx.role === "ADMIN") && (
                <Link
                  onClick={() => setOpen(false)}
                  href={n.href}
                  className={cn(
                    "flex gap-3 items-center px-3 py-2.5 rounded-lg text-[13px]",
                    pathname.startsWith(n.href)
                      ? "bg-emerald-50 text-emerald-800 font-semibold"
                      : "text-slate-500 hover:bg-slate-50",
                  )}
                >
                  <n.icon size={17} />
                  {n.label}
                </Link>
              )}
            </div>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex gap-2 items-center">
            <ShieldCheck size={16} className="text-emerald-600" />
            Sesión segura · {ctx.role}
          </div>
          <button
            className="mt-4 flex gap-3 text-xs text-slate-500 items-center"
            onClick={async () => {
              await fetch("/api/auth/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              });
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}
      <div className="lg:ml-60">
        <header className="h-18 bg-white border-b border-slate-200 flex items-center justify-between gap-4 px-6 lg:px-9">
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="relative max-w-md w-full">
            <div className="flex items-center gap-2 text-slate-400">
              <Search size={17} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar clientes, documentos, productos…"
                aria-label="Buscar en toda la empresa"
                className="outline-none w-full text-xs bg-transparent py-3"
              />
            </div>
            {q.length >= 2 && (
              <div className="absolute top-12 left-0 w-full bg-white border border-slate-200 shadow-lg rounded-lg z-50 p-2">
                {results.length ? (
                  results.map((r) => (
                    <Link
                      className="block p-3 hover:bg-slate-50 rounded text-sm"
                      key={r.href}
                      href={r.href}
                      onClick={() => setQ("")}
                    >
                      {r.label}
                      <span className="float-right text-slate-400 text-xs">
                        {r.kind}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="p-3 text-xs text-slate-500">Sin resultados</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {ctx.role !== "VIEWER" && (
              <Button size="sm" asChild>
                <Link href="/invoices/new">
                  <Plus size={14} />
                  <span className="hidden sm:inline">Nueva factura</span>
                </Link>
              </Button>
            )}
            <div
              className="w-8 h-8 rounded-full bg-[#e9eee9] text-emerald-900 text-xs font-bold flex items-center justify-center"
              title={ctx.name}
            >
              {ctx.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </div>
          </div>
        </header>
        <main className="p-5 lg:p-9 max-w-[1600px] mx-auto">{children}</main>
      </div>
    </div>
  );
}
