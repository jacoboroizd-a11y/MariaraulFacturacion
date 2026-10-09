import Decimal from "decimal.js";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type MoneyInput = Decimal.Value;
export const decimal = (value: MoneyInput) => new Decimal(value);
export const round = (value: MoneyInput) => decimal(value).toDecimalPlaces(2);
export const amount = (value: MoneyInput) => round(value).toFixed(2);
export type LineInput = {
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};
export function calculateDocument(lines: LineInput[], discountRate = "0") {
  const globalDiscount = decimal(discountRate).div(100);
  const items = lines.map((line, position) => {
    const subtotal = round(decimal(line.quantity).times(line.unitPrice));
    const lineDiscount = round(
      subtotal.times(decimal(line.discountRate).div(100)),
    );
    const discount = lineDiscount.plus(
      round(subtotal.minus(lineDiscount).times(globalDiscount)),
    );
    const taxable = subtotal.minus(discount);
    const tax = round(taxable.times(decimal(line.taxRate).div(100)));
    return {
      ...line,
      productId: line.productId || null,
      position,
      subtotal: amount(subtotal),
      discount: amount(discount),
      tax: amount(tax),
      total: amount(taxable.plus(tax)),
    };
  });
  const sum = (key: "subtotal" | "discount" | "tax" | "total") =>
    amount(items.reduce((acc, item) => acc.plus(item[key]), decimal(0)));
  return {
    items,
    subtotal: sum("subtotal"),
    discountTotal: sum("discount"),
    taxTotal: sum("tax"),
    total: sum("total"),
  };
}
export function paymentBalance(
  total: MoneyInput,
  paid: MoneyInput,
  incoming: MoneyInput,
) {
  const value = decimal(incoming);
  if (value.lte(0) || value.decimalPlaces() > 2)
    throw new Error("El pago debe ser positivo y tener máximo dos decimales.");
  const nextPaid = round(decimal(paid).plus(value));
  if (nextPaid.gt(total)) throw new Error("El pago supera el saldo pendiente.");
  return {
    amountPaid: amount(nextPaid),
    balanceDue: amount(decimal(total).minus(nextPaid)),
  };
}
export function invoiceStatus(
  total: MoneyInput,
  paid: MoneyInput,
  dueDate: Date | null,
  current = "PENDING",
  today = new Date(),
) {
  if (current === "VOID" || current === "DRAFT") return current;
  if (decimal(paid).gte(total)) return "PAID";
  const day = new Date(
    today.toLocaleDateString("en-CA", { timeZone: "America/Managua" }) +
      "T00:00:00Z",
  );
  if (dueDate && dueDate < day) return "OVERDUE";
  return decimal(paid).gt(0) ? "PARTIALLY_PAID" : "PENDING";
}
export function convertCurrency(
  value: MoneyInput,
  from: string,
  to: string,
  rate: MoneyInput,
) {
  if (decimal(rate).lte(0)) throw new Error("Tipo de cambio inválido.");
  return amount(
    from === to
      ? value
      : from === "USD"
        ? decimal(value).times(rate)
        : decimal(value).div(rate),
  );
}
export function formatMoney(value: MoneyInput, currency = "NIO") {
  return `${currency === "USD" ? "US$" : "C$"} ${decimal(value)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
