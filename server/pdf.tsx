import {
  Document,
  Page,
  View,
  Text,
  Image as PdfImage,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney, convertCurrency } from "@/lib/money";
import { dateLabel, labels, appointmentLabel } from "@/lib/utils";
import type { Row } from "@/types/view";
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 9, color: "#243c35" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d9e2de",
    paddingBottom: 22,
    marginBottom: 22,
  },
  muted: { color: "#6b7c75", fontSize: 8, lineHeight: 1.5 },
  title: { fontSize: 23, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  company: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  table: { marginTop: 20 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#edf4f0",
    padding: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1ef",
  },
  description: { width: "33%", paddingRight: 6 },
  cell: { width: "13.4%", textAlign: "right" },
  summary: { width: "48%", marginLeft: "52%", marginTop: 20 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  total: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    borderTopWidth: 1,
    borderTopColor: "#d9e2de",
    paddingTop: 10,
    marginTop: 5,
  },
  section: { marginTop: 22 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    color: "#8a9a92",
    fontSize: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  logo: {
    maxWidth: 100,
    maxHeight: 45,
    objectFit: "contain",
    marginBottom: 10,
  },
});
export async function pdfDocument(row: Row, kind: string) {
  const receipt = kind === "receipts";
  const doc = receipt ? row.invoice! : row;
  const company = doc.companySnapshot || {};
  const customer = doc.customerSnapshot || {};
  const currency = doc.currency || "NIO";
  const fmt = company.dateFormat || "dd/MM/yyyy";
  return renderToBuffer(
    <Document title={row.documentNumber} author={company.name}>
      <Page size="A4" style={styles.page}>
        <View style={[styles.row, styles.header]}>
          <View style={{ maxWidth: "60%" }}>
            {company.logo && (
              <PdfImage src={company.logo} style={styles.logo} />
            )}
            <Text style={styles.company}>
              {company.tradeName || company.name}
            </Text>
            <Text style={styles.muted}>
              {company.name}
              {"\n"}RUC: {company.ruc}
              {"\n"}
              {company.address}
              {"\n"}
              {company.email} · {company.phone}
            </Text>
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={styles.title}>
              {receipt
                ? "RECIBO"
                : kind === "quotes"
                  ? "COTIZACIÓN"
                  : "FACTURA"}
            </Text>
            <Text>{row.documentNumber}</Text>
            <Text style={[styles.muted, { marginTop: 8 }]}>
              {labels[row.status || ""] ||
                (receipt ? (row.voidedAt ? "ANULADO" : "Vigente") : "")}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={{ width: "60%" }}>
            <Text style={styles.muted}>CLIENTE</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", marginVertical: 6 }}>
              {customer.legalName || customer.name}
            </Text>
            <Text style={styles.muted}>
              RUC / Cédula: {customer.ruc}
              {"\n"}
              {customer.address}
              {"\n"}
              {customer.email} · {customer.phone}
            </Text>
          </View>
          <View style={{ textAlign: "right" }}>
            <Text>
              Fecha:{" "}
              {dateLabel(receipt ? row.payment!.paymentDate! : doc.date!, fmt)}
            </Text>
            <Text style={{ marginTop: 7 }}>
              {receipt
                ? `Factura: ${doc.documentNumber}`
                : `Vencimiento: ${dateLabel(doc.dueDate!, fmt)}`}
            </Text>
            <Text style={{ marginTop: 7 }}>
              Moneda: {currency} · TC: {doc.exchangeRate}
            </Text>
          </View>
        </View>
        {receipt ? (
          <View
            style={[
              styles.section,
              { padding: 20, backgroundColor: "#edf4f0" },
            ]}
          >
            <Text>Monto recibido</Text>
            <Text style={[styles.title, { marginTop: 12 }]}>
              {formatMoney(row.payment!.amount!, currency)}
            </Text>
            <Text style={styles.muted}>
              Método: {labels[row.payment!.method!]}
              {"\n"}Referencia: {row.payment!.reference || "—"}
              {"\n"}Cuenta: {row.payment!.account || "—"}
              {"\n"}Saldo posterior al pago:{" "}
              {formatMoney(row.balanceRemaining!, currency)}
              {"\n"}
              {row.payment!.notes}
            </Text>
            {row.voidedAt && (
              <Text style={{ marginTop: 10, color: "#b91c1c" }}>
                RECIBO ANULADO. El pago ya no se aplica a la factura.
              </Text>
            )}
          </View>
        ) : (
          <>
            <View style={styles.table}>
              <View style={styles.tableHeader} fixed>
                <Text style={styles.description}>Descripción</Text>
                {["Cantidad", "Precio", "Descuento", "Impuesto", "Total"].map(
                  (x) => (
                    <Text key={x} style={styles.cell}>
                      {x}
                    </Text>
                  ),
                )}
              </View>
              {doc.items?.map((item) => (
                <View style={styles.tableRow} key={item.id} wrap={false}>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.cell}>{item.quantity}</Text>
                  <Text style={styles.cell}>
                    {formatMoney(item.unitPrice, currency)}
                  </Text>
                  <Text style={styles.cell}>
                    {formatMoney(item.discount, currency)}
                  </Text>
                  <Text style={styles.cell}>
                    {formatMoney(item.tax, currency)}
                    {"\n"}({item.taxRate}%)
                  </Text>
                  <Text style={styles.cell}>
                    {formatMoney(item.total, currency)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.summary} wrap={false}>
              {[
                { label: "Subtotal", value: doc.subtotal },
                { label: "Descuentos", value: doc.discountTotal },
                { label: "Impuestos", value: doc.taxTotal },
              ].map((x) => (
                <View key={x.label} style={styles.summaryRow}>
                  <Text>{x.label}</Text>
                  <Text>{formatMoney(x.value || 0, currency)}</Text>
                </View>
              ))}
              <View style={[styles.summaryRow, styles.total]}>
                <Text>Total</Text>
                <Text>{formatMoney(doc.total || 0, currency)}</Text>
              </View>
              <Text
                style={[styles.muted, { textAlign: "right", marginTop: 6 }]}
              >
                {formatMoney(
                  convertCurrency(
                    doc.total || 0,
                    currency,
                    currency === "USD" ? "NIO" : "USD",
                    doc.exchangeRate || "1",
                  ),
                  currency === "USD" ? "NIO" : "USD",
                )}{" "}
                equivalente
              </Text>
              {kind === "invoices" && (
                <>
                  <View style={styles.summaryRow}>
                    <Text>Pagado</Text>
                    <Text>{formatMoney(doc.amountPaid || 0, currency)}</Text>
                  </View>
                  <View
                    style={[
                      styles.summaryRow,
                      { fontFamily: "Helvetica-Bold" },
                    ]}
                  >
                    <Text>Saldo pendiente</Text>
                    <Text>{formatMoney(doc.balanceDue || 0, currency)}</Text>
                  </View>
                </>
              )}
            </View>
          </>
        )}
        {kind === "invoices" && (
          <View style={styles.section}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
              Método de pago / abonos
            </Text>
            {doc.payments?.length ? (
              doc.payments.map((p) => (
                <View style={styles.summaryRow} key={p.id} wrap={false}>
                  <Text style={{ maxWidth: "75%" }}>
                    {dateLabel(p.paymentDate!, fmt)} ·{" "}
                    {labels[p.method || ""] || p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </Text>
                  <Text>{formatMoney(p.amount || 0, currency)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>
                Sin pagos registrados · Pendiente de cobro
              </Text>
            )}
          </View>
        )}
        {doc.nextAppointment && (
          <View
            style={[
              styles.section,
              { padding: 14, backgroundColor: "#edf4f0" },
            ]}
            wrap={false}
          >
            <Text style={{ fontFamily: "Helvetica-Bold" }}>Próxima cita</Text>
            <Text style={{ marginTop: 6 }}>
              {appointmentLabel(doc.nextAppointment)} · Hora de Nicaragua
            </Text>
          </View>
        )}
        {doc.items?.some((i) => (i.sessionsTotal || 0) > 0) && (
          <View style={styles.section}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
              Tratamientos y sesiones
            </Text>
            {doc.items
              .filter((i) => (i.sessionsTotal || 0) > 0)
              .map((i) => (
                <Text key={i.id} style={styles.muted}>
                  {i.description}: {i.sessionsUsed || 0} de {i.sessionsTotal}{" "}
                  realizadas · {(i.sessionsTotal || 0) - (i.sessionsUsed || 0)}{" "}
                  disponibles
                </Text>
              ))}
          </View>
        )}
        {!receipt && doc.notes && (
          <View style={styles.section}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 5 }}>
              Notas
            </Text>
            <Text style={styles.muted}>{doc.notes}</Text>
          </View>
        )}
        {!receipt && doc.terms && (
          <View style={styles.section}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 5 }}>
              Términos y condiciones
            </Text>
            <Text style={styles.muted}>{doc.terms}</Text>
          </View>
        )}
        {company.bankInfo && (
          <View style={styles.section}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 5 }}>
              Información bancaria
            </Text>
            <Text style={styles.muted}>{company.bankInfo}</Text>
          </View>
        )}
        <View style={styles.footer} fixed>
          <Text>
            {company.tradeName || company.name} · {row.documentNumber}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>,
  );
}
