import { describe, it, expect } from "vitest";
import {
  calculateDocument,
  paymentBalance,
  invoiceStatus,
  convertCurrency,
  amount,
} from "../lib/money";
import { documentSchema, paymentSchema } from "../server/validation";
const line = {
  description: "Servicio",
  quantity: "3",
  unitPrice: "0.10",
  discountRate: "0",
  taxRate: "0",
};
describe("Cálculos financieros decimales", () => {
  it("evita errores de floating point en el subtotal", () =>
    expect(calculateDocument([line]).subtotal).toBe("0.30"));
  it("redondea mitad hacia arriba", () => expect(amount("2.675")).toBe("2.68"));
  it("calcula descuento de línea, global e IVA después de descuentos", () => {
    const result = calculateDocument(
      [
        {
          ...line,
          quantity: "2",
          unitPrice: "100",
          discountRate: "10",
          taxRate: "15",
        },
      ],
      "10",
    );
    expect(result.subtotal).toBe("200.00");
    expect(result.discountTotal).toBe("38.00");
    expect(result.taxTotal).toBe("24.30");
    expect(result.total).toBe("186.30");
  });
  it("conserva tasas independientes por línea", () => {
    const result = calculateDocument([
      { ...line, quantity: "1", unitPrice: "100", taxRate: "15" },
      { ...line, quantity: "1", unitPrice: "100", taxRate: "0" },
    ]);
    expect(result.total).toBe("215.00");
  });
  it("registra pago parcial y saldo", () =>
    expect(paymentBalance("115", "0", "50")).toEqual({
      amountPaid: "50.00",
      balanceDue: "65.00",
    }));
  it("completa pago", () =>
    expect(paymentBalance("115", "50", "65").balanceDue).toBe("0.00"));
  it("bloquea sobrepagos, negativos y fracciones de centavo", () => {
    expect(() => paymentBalance("100", "80", "21")).toThrow("supera");
    expect(() => paymentBalance("100", "0", "-1")).toThrow();
    expect(() => paymentBalance("100", "0", "0.001")).toThrow();
  });
  it("clasifica pendiente, parcial y pagada", () => {
    const due = new Date("2099-01-01");
    expect(invoiceStatus("100", "0", due)).toBe("PENDING");
    expect(invoiceStatus("100", "25", due)).toBe("PARTIALLY_PAID");
    expect(invoiceStatus("100", "100", due)).toBe("PAID");
  });
  it("vence solo después de la fecha local de Managua", () => {
    expect(
      invoiceStatus(
        "100",
        "0",
        new Date("2026-10-08"),
        "PENDING",
        new Date("2026-10-09T01:00:00Z"),
      ),
    ).toBe("PENDING");
    expect(
      invoiceStatus(
        "100",
        "0",
        new Date("2026-10-07"),
        "PENDING",
        new Date("2026-10-09T01:00:00Z"),
      ),
    ).toBe("OVERDUE");
  });
  it("preserva borradores y anulaciones", () => {
    expect(invoiceStatus("100", "0", new Date("2020-01-01"), "DRAFT")).toBe(
      "DRAFT",
    );
    expect(invoiceStatus("100", "100", new Date(), "VOID")).toBe("VOID");
  });
  it("convierte con tipo de cambio histórico", () => {
    expect(convertCurrency("100", "USD", "NIO", "36.5")).toBe("3650.00");
    expect(convertCurrency("3650", "NIO", "USD", "36.5")).toBe("100.00");
    expect(() => convertCurrency("100", "USD", "NIO", "0")).toThrow();
  });
  it("rechaza datos financieros o fechas inválidas", () => {
    expect(
      paymentSchema.safeParse({
        invoiceId: "i",
        amount: "0.001",
        currency: "NIO",
        paymentDate: "2026-02-30",
        method: "CASH",
      }).success,
    ).toBe(false);
    expect(
      documentSchema.safeParse({
        customerId: "c",
        date: "2026-10-08",
        dueDate: "2026-10-07",
        currency: "NIO",
        exchangeRate: "36.5",
        items: [line],
      }).success,
    ).toBe(false);
  });
});
