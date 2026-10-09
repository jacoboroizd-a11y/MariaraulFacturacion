import { Mail, MessageCircle, Download } from "lucide-react";
import { Button } from "./ui/button";
import { formatMoney } from "@/lib/money";
import type { Row } from "@/types/view";
export function SendDocument({
  row,
  kind,
}: {
  row: Row;
  kind: "invoices" | "receipts";
}) {
  const doc = kind === "receipts" ? row.invoice! : row;
  const customer = doc.customerSnapshot || {},
    company = doc.companySnapshot || {};
  const total = formatMoney(
    kind === "receipts" ? row.payment!.amount || "0" : doc.total || "0",
    doc.currency || "NIO",
  );
  const text = `Hola${customer.name ? ", " + customer.name : ""}. Te comparto el comprobante ${row.documentNumber} por ${total}.\n\nGracias por tu visita.\n${company.tradeName || company.name || ""}`;
  let phone = (customer.phone || "").replace(/[^0-9]/g, "");
  if (/^[258]\d{7}$/.test(phone)) phone = "505" + phone;
  const whatsapp = new URL("https://api.whatsapp.com/send");
  whatsapp.searchParams.set("text", text);
  if (/^[1-9]\d{7,14}$/.test(phone)) whatsapp.searchParams.set("phone", phone);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "")
    ? customer.email!
    : "";
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${company.tradeName || company.name || "Clínica"} · ${row.documentNumber}`)}&body=${encodeURIComponent(text)}`;
  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/pdf/${kind}/${row.id}`}
            download={`${row.documentNumber}.pdf`}
          >
            <Download size={15} />
            Descargar PDF
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={whatsapp.toString()} target="_blank" rel="noreferrer">
            <MessageCircle size={15} />
            Abrir WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={mailto}>
            <Mail size={15} />
            Abrir correo
          </a>
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Descarga el PDF Carta y adjúntalo al mensaje antes de enviarlo. El
        correo se abre en la aplicación predeterminada del dispositivo.
      </p>
    </div>
  );
}
