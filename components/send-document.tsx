"use client";
import { useState, useEffect } from "react";
import { Mail, MessageCircle, Download, Share2 } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/pdf/${kind}/${row.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.ok)
          setFile(
            new File([await response.blob()], `${row.documentNumber}.pdf`, {
              type: "application/pdf",
            }),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [kind, row.id, row.documentNumber]);
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
        <Button
          variant="outline"
          size="sm"
          disabled={!file}
          onClick={async () => {
            if (!file) return;
            if (navigator.canShare?.({ files: [file] })) {
              try {
                await navigator.share({
                  files: [file],
                  title: `Factura ${row.documentNumber}`,
                });
                setMessage("PDF compartido desde el dispositivo.");
              } catch (error) {
                if ((error as Error).name !== "AbortError")
                  setMessage(
                    "No se pudo compartir. Descarga el PDF y adjúntalo en WhatsApp.",
                  );
              }
            } else {
              const url = URL.createObjectURL(file),
                link = document.createElement("a");
              link.href = url;
              link.download = file.name;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 10000);
              setMessage(
                "PDF descargado. Abre WhatsApp y adjunta el archivo al chat.",
              );
            }
          }}
        >
          <Share2 size={15} />
          Compartir PDF
        </Button>
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
      {message && (
        <p role="status" className="text-sm text-emerald-800">
          {message}
        </p>
      )}
      <p className="text-xs text-slate-500">
        En iPad y móvil, Compartir PDF permite elegir WhatsApp y el contacto. En
        otros equipos, descarga el PDF y adjúntalo. Abrir WhatsApp va al chat;
        los enlaces no pueden adjuntar archivos.
      </p>
    </div>
  );
}
