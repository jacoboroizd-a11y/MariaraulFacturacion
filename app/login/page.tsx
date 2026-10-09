import Image from "next/image";
import { LoginForm } from "@/components/login-form";
export default function Login() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex bg-[#103c32] text-white p-16 flex-col justify-between">
        <div className="text-xl font-semibold tracking-tight">
          <div className="bg-white/95 rounded-2xl px-5 py-4 w-fit">
            <Image
              src="/brand/mariaraul.png"
              alt="Dra. Mariaraúl · Medicina estética"
              width={2833}
              height={682}
              className="w-80 h-auto"
              priority
            />
          </div>
        </div>
        <div>
          <span className="text-emerald-300 text-sm">
            HECHO PARA TU EMPRESA
          </span>
          <h1 className="text-5xl font-semibold leading-tight mt-5 max-w-lg">
            Tus ventas claras.
            <br />
            Tu negocio en orden.
          </h1>
          <p className="text-emerald-100/70 mt-6 max-w-md leading-relaxed">
            Cotiza, factura y recibe pagos desde un solo lugar. Con el control
            que tu empresa necesita para crecer.
          </p>
          <div className="mt-12 border-t border-white/15 pt-6 text-sm text-emerald-100/70">
            Nicaragua · Córdobas y dólares · Información segura
          </div>
        </div>
        <p className="text-xs text-white/40">
          Facturación para pequeñas y medianas empresas
        </p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-2xl font-bold mb-12 text-emerald-800">
            <Image
              src="/brand/mariaraul.png"
              alt="Dra. Mariaraúl · Medicina estética"
              width={2833}
              height={682}
              className="w-72 h-auto"
              priority
            />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Bienvenido de nuevo
          </h2>
          <p className="text-slate-500 text-sm mt-3 mb-8">
            Ingresa a tu espacio de trabajo.
          </p>
          <LoginForm />
          <p className="text-xs text-slate-400 mt-8">
            Acceso privado. Solicita una cuenta al administrador de tu empresa.
          </p>
        </div>
      </section>
    </div>
  );
}
