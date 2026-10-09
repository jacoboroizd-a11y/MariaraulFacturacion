import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const labels: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
  CONVERTED: "Convertida",
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  VOID: "Anulada",
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  CHECK: "Cheque",
  OTHER: "Otro",
  PRODUCT: "Producto",
  SERVICE: "Servicio",
  ADMIN: "Administrador",
  BILLING: "Facturación",
  VIEWER: "Consulta",
};
export function dateLabel(value: string | Date, format = "dd/MM/yyyy") {
  const d = new Date(value);
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const year = d.getUTCFullYear();
  return format === "yyyy-MM-dd"
    ? `${year}-${month}-${day}`
    : format === "MM/dd/yyyy"
      ? `${month}/${day}/${year}`
      : `${day}/${month}/${year}`;
}
export function todayString() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Managua",
  });
}
