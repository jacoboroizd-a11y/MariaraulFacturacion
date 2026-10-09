import ExcelJS from "exceljs";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { db } from "./db";
import { AppError, authorizeReports, type Context } from "./auth";
import { monthRange } from "./clinic-overview";
import { decimal, amount, formatMoney } from "@/lib/money";
import { clinicClock } from "@/lib/clinic-time";
import { labels } from "@/lib/utils";
export const brands: Record<string, string> = {
  SKINCARE: "Treat Yourself · Cuidado personal",
  LASER: "Dra. Mariaraúl · Láser",
  ESTHETIC: "Dra. Mariaraúl · Estética",
};
export function reportRange(kind: string, period: string) {
  if (kind === "MONTHLY") {
    const range = monthRange(period);
    return { from: range.invoiceFrom, to: range.invoiceTo };
  }
  if (
    kind !== "DAILY" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(period) ||
    isNaN(Date.parse(period)) ||
    new Date(period).toISOString().slice(0, 10) !== period
  )
    throw new AppError("Selecciona una fecha válida.");
  const from = new Date(period);
  return { from, to: new Date(from.getTime() + 86400000) };
}
export async function financialData(
  companyId: string,
  kind: string,
  period: string,
) {
  const range = reportRange(kind, period);
  const [company, invoices, payments, advances, cashDays, jobs, movements] =
    await Promise.all([
      db.company.findUniqueOrThrow({ where: { id: companyId } }),
      db.invoice.findMany({
        where: {
          companyId,
          date: { gte: range.from, lt: range.to },
          status: { notIn: ["DRAFT", "VOID"] },
        },
        include: { items: { orderBy: { position: "asc" } }, customer: true },
        orderBy: { createdAt: "asc" },
      }),
      db.payment.findMany({
        where: {
          companyId,
          deletedAt: null,
          advanceId: null,
          paymentDate: { gte: range.from, lt: range.to },
          invoice: { status: { notIn: ["DRAFT", "VOID"] } },
        },
        include: { invoice: { include: { customer: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.customerAdvance.findMany({
        where: { companyId, paymentDate: { gte: range.from, lt: range.to } },
        include: { customer: true },
        orderBy: { createdAt: "asc" },
      }),
      db.cashDay.findMany({
        where: { companyId, day: { gte: range.from, lt: range.to } },
        orderBy: { day: "asc" },
      }),
      db.reportDelivery.findMany({
        where: { companyId, kind, period },
        select: { status: true, lastError: true, sentAt: true },
      }),
      db.cashMovement.findMany({
        where: {
          companyId,
          cashDay: { day: { gte: range.from, lt: range.to } },
        },
        include: { cashDay: { select: { day: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  const sales: Record<string, string> = {},
    received: Record<string, string> = {};
  for (const invoice of invoices) {
    const key = invoice.currency;
    sales[key] = amount(
      decimal(sales[key] || "0").plus(invoice.total.toString()),
    );
  }
  const add = (currency: string, method: string, value: string) => {
    const key = currency + ":" + method;
    received[key] = amount(decimal(received[key] || "0").plus(value));
  };
  for (const payment of payments)
    add(payment.currency, payment.method, payment.amount.toString());
  for (const advance of advances)
    add(advance.currency, advance.method, advance.amount.toString());
  const grouping: Record<string, string> = {};
  const lines = invoices.flatMap((invoice) =>
    invoice.items.map((item) => {
      const total = item.total.toFixed(2);
      const group = brands[item.reportGroup] ? item.reportGroup : "ESTHETIC",
        key = invoice.currency + ":" + group;
      grouping[key] = amount(decimal(grouping[key] || "0").plus(total));
      return {
        day: invoice.date.toISOString().slice(0, 10),
        time: new Date(invoice.createdAt.getTime() - 21600000)
          .toISOString()
          .slice(11, 19),
        invoice: invoice.documentNumber,
        patient:
          (invoice.customerSnapshot as Record<string, string>).name ||
          invoice.customer.name,
        brand: brands[group],
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        total,
        currency: invoice.currency,
        status: invoice.status,
        paid: invoice.amountPaid.toString(),
        balance: invoice.balanceDue.toString(),
      };
    }),
  );
  return {
    company,
    kind,
    period,
    sales,
    received,
    grouping,
    lines,
    invoices,
    payments,
    advances,
    cashDays,
    jobs,
    movements,
    generatedAt: new Date(),
    localDay: clinicClock().day,
  };
}
export async function financialReport(
  ctx: Context,
  kind: string,
  period: string,
) {
  authorizeReports(ctx);
  return financialData(ctx.companyId, kind, period);
}
export type FinancialData = Awaited<ReturnType<typeof financialData>>;
const safe = (value: unknown) =>
  typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
export async function financialExcel(data: FinancialData) {
  const book = new ExcelJS.Workbook();
  book.creator = "Dra. Mariaraúl";
  const summary = book.addWorksheet("Resumen");
  summary.addRow([
    "Periodo",
    data.period,
    data.kind === "DAILY" ? "Diario" : "Mensual",
  ]);
  summary.addRow([
    "Las ventas y los cobros son cifras diferentes. Los adelantos se cuentan al recibirse, no al aplicarse.",
  ]);
  summary.addRow(["Concepto", "Moneda", "Importe"]);
  for (const [currency, value] of Object.entries(data.sales))
    summary.addRow(["Ventas facturadas", currency, Number(value)]);
  for (const [key, value] of Object.entries(data.grouping)) {
    const [currency, group] = key.split(":");
    summary.addRow([brands[group], currency, Number(value)]);
  }
  for (const [key, value] of Object.entries(data.received)) {
    const [currency, method] = key.split(":");
    summary.addRow(["Recibido · " + labels[method], currency, Number(value)]);
  }
  const sales = book.addWorksheet("Ventas detalladas");
  sales.addRow([
    "Fecha",
    "Hora Nicaragua",
    "Factura",
    "Paciente",
    "Marca / área",
    "Tratamiento o producto",
    "Cantidad",
    "Precio unitario",
    "Total línea",
    "Moneda",
    "Estado",
    "Pagado factura",
    "Saldo factura",
  ]);
  for (const l of data.lines)
    sales.addRow(
      [
        l.day,
        l.time,
        l.invoice,
        l.patient,
        l.brand,
        l.description,
        Number(l.quantity),
        Number(l.unitPrice),
        Number(l.total),
        l.currency,
        l.status,
        Number(l.paid),
        Number(l.balance),
      ].map(safe),
    );
  const income = book.addWorksheet("Cobros y adelantos");
  income.addRow([
    "Fecha",
    "Factura",
    "Paciente",
    "Tipo",
    "Método",
    "Importe",
    "Moneda",
    "Referencia",
  ]);
  for (const p of data.payments)
    income.addRow(
      [
        p.paymentDate.toISOString().slice(0, 10),
        p.invoice.documentNumber,
        (p.invoice.customerSnapshot as Record<string, string>).name ||
          p.invoice.customer.name,
        "Cobro",
        labels[p.method],
        Number(p.amount),
        p.currency,
        p.reference,
      ].map(safe),
    );
  for (const a of data.advances)
    income.addRow(
      [
        a.paymentDate.toISOString().slice(0, 10),
        "",
        a.customer.name,
        "Adelanto",
        labels[a.method],
        Number(a.amount),
        a.currency,
        a.notes,
      ].map(safe),
    );
  const closes = book.addWorksheet("Cierres y efectivo");
  closes.addRow([
    "Día",
    "Estado",
    "Tipo de cierre",
    "Moneda",
    "Apertura",
    "Cobrado efectivo",
    "Salidas",
    "Esperado",
    "Contado",
    "Diferencia",
    "Queda para mañana",
    "Retirado al cierre",
    "Revisión",
    "Notas",
  ]);
  for (const day of data.cashDays) {
    const meta = day.closeData as Record<string, unknown> | null;
    for (const currency of ["NIO", "USD"]) {
      const cash = meta?.[currency] as
        Record<string, string | null> | undefined;
      const num = (key: string) =>
        cash?.[key] == null ? "Pendiente" : Number(cash[key]);
      closes.addRow(
        [
          day.day.toISOString().slice(0, 10),
          day.status,
          day.automatic ? "Automático · No se hizo cierre" : "Manual",
          currency,
          currency === "NIO" ? Number(day.openingNIO) : Number(day.openingUSD),
          num("received"),
          num("out"),
          num("expected"),
          num("counted"),
          num("difference"),
          num("remaining"),
          cash?.counted != null && cash?.remaining != null
            ? Number(decimal(cash.counted).minus(cash.remaining))
            : "Pendiente",
          day.reviewStatus,
          String(meta?.notes || ""),
        ].map(safe),
      );
    }
  }
  const outs = book.addWorksheet("Salidas de efectivo");
  outs.addRow([
    "Fecha",
    "Hora Nicaragua",
    "Monto",
    "Moneda",
    "Motivo",
    "Destino / propósito",
    "Entregado a",
  ]);
  for (const movement of data.movements)
    outs.addRow(
      [
        movement.cashDay.day.toISOString().slice(0, 10),
        new Date(movement.createdAt.getTime() - 21600000)
          .toISOString()
          .slice(11, 19),
        Number(movement.amount),
        movement.currency,
        movement.reason,
        movement.purpose,
        movement.recipient,
      ].map(safe),
    );
  for (const sheet of book.worksheets) {
    sheet.getRow(sheet === summary ? 3 : 1).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    sheet.getRow(sheet === summary ? 3 : 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF315D50" },
    };
    sheet.columns.forEach((c) => {
      c.width = 24;
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: sheet.rowCount, column: sheet.columnCount },
    };
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: "#243c35" },
  heading: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  section: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dde6e1",
    paddingVertical: 5,
  },
  small: { fontSize: 8, color: "#566e65", marginBottom: 6 },
  cell: { width: "25%", paddingRight: 6 },
});
export async function financialPDF(data: FinancialData) {
  return renderToBuffer(
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.heading}>Dra. Mariaraúl</Text>
        <Text>
          {data.kind === "DAILY" ? "Reporte diario" : "Reporte mensual"} ·{" "}
          {data.period}
        </Text>
        <Text style={styles.small}>
          Hora de Nicaragua · Ventas, cobros y efectivo se muestran por
          separado. Monedas sin mezclar.
        </Text>
        <Text style={styles.section}>Ventas facturadas</Text>
        {Object.entries(data.sales).map(([c, v]) => (
          <Text key={c}>{formatMoney(v, c)}</Text>
        ))}
        {Object.entries(data.grouping).map(([key, v]) => (
          <Text key={key}>
            {brands[key.split(":")[1]]}: {formatMoney(v, key.split(":")[0])}
          </Text>
        ))}
        <Text style={styles.section}>
          Dinero recibido (incluye adelantos nuevos)
        </Text>
        {Object.entries(data.received).map(([key, v]) => (
          <Text key={key}>
            {labels[key.split(":")[1]]}: {formatMoney(v, key.split(":")[0])}
          </Text>
        ))}
        <Text style={styles.section}>Cierres y movimientos de efectivo</Text>
        {data.cashDays.map((day) => {
          const meta = day.closeData as Record<string, unknown> | null;
          return (
            <View key={day.id} wrap={false} style={{ marginBottom: 12 }}>
              <Text>
                {day.day.toISOString().slice(0, 10)} ·{" "}
                {day.status === "OPEN"
                  ? "Caja abierta"
                  : day.automatic
                    ? "No se hizo cierre manual"
                    : "Cierre manual"}
              </Text>
              {["NIO", "USD"].map((c) => {
                const cash = meta?.[c] as
                  Record<string, string | null> | undefined;
                const val = (k: string) =>
                  cash?.[k] == null ? "Pendiente" : formatMoney(cash[k], c);
                return (
                  <Text key={c} style={styles.small}>
                    {c} · Apertura{" "}
                    {formatMoney(
                      c === "NIO"
                        ? day.openingNIO.toString()
                        : day.openingUSD.toString(),
                      c,
                    )}{" "}
                    · Cobros {val("received")} · Salidas {val("out")} · Contado{" "}
                    {val("counted")} · Diferencia {val("difference")} · Para
                    mañana {val("remaining")}
                  </Text>
                );
              })}
              <Text style={styles.small}>
                Revisión: {day.reviewStatus} · {String(meta?.notes || "")}
              </Text>
            </View>
          );
        })}
        <Text style={styles.section}>Salidas de efectivo</Text>
        {data.movements.map((m) => (
          <Text key={m.id}>
            {m.cashDay.day.toISOString().slice(0, 10)} ·{" "}
            {formatMoney(m.amount.toString(), m.currency)} · {m.reason} ·{" "}
            {m.purpose} · {m.recipient}
          </Text>
        ))}
        <Text style={styles.section}>Detalle de ventas</Text>
        {data.lines.map((l, i) => (
          <View key={i} wrap={false} style={styles.row}>
            <View style={styles.cell}>
              <Text>{l.invoice}</Text>
              <Text style={styles.small}>
                {l.day} {l.time}
              </Text>
            </View>
            <View style={styles.cell}>
              <Text>{l.patient}</Text>
            </View>
            <View style={{ width: "35%", paddingRight: 6 }}>
              <Text>{l.description}</Text>
              <Text style={styles.small}>
                {l.brand} · {l.quantity} unidades
              </Text>
            </View>
            <Text style={{ width: "15%" }}>
              {formatMoney(l.total, l.currency)}
            </Text>
          </View>
        ))}
        <Text style={styles.section}>Detalle de cobros</Text>
        {data.payments.map((p) => (
          <Text key={p.id}>
            {p.invoice.documentNumber} · {p.invoice.customer.name} ·{" "}
            {labels[p.method]} · {formatMoney(p.amount.toString(), p.currency)}{" "}
            · {p.paymentDate.toISOString().slice(0, 10)}
          </Text>
        ))}
        {data.advances.map((a) => (
          <Text key={a.id}>
            Adelanto · {a.customer.name} · {labels[a.method]} ·{" "}
            {formatMoney(a.amount.toString(), a.currency)} ·{" "}
            {a.paymentDate.toISOString().slice(0, 10)}
          </Text>
        ))}
        <Text
          fixed
          style={{ position: "absolute", bottom: 18, left: 32, fontSize: 8 }}
          render={({ pageNumber, totalPages }) =>
            `Reporte confidencial · ${data.period} · ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>,
  );
}
