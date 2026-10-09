import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = {
  title: "Dra. Mariaraúl · Facturación",
  appleWebApp: { capable: true, title: "Mariaraúl", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  description:
    "Ventas, tratamientos, citas e inventario para clínica y cosméticos.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#506c60",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
