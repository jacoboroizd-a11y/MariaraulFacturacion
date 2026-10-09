import { pageContext } from "@/server/auth";
import { db } from "@/server/db";
import { serialize } from "@/server/queries";
import { Inventory, type StockEvent } from "@/components/inventory";
export default async function InventoryPage() {
  const ctx = await pageContext();
  const [products, logs] = await Promise.all([
    db.product.findMany({
      where: { companyId: ctx.companyId, type: "PRODUCT" },
      orderBy: { name: "asc" },
    }),
    db.auditLog.findMany({
      where: {
        companyId: ctx.companyId,
        entityType: "Product",
        action: { in: ["STOCK_ADJUSTED", "STOCK_SOLD", "STOCK_RETURNED"] },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    }),
  ]);
  const movements: StockEvent[] = logs.map((log) => {
    const meta = log.metadata as Record<string, unknown>;
    return {
      id: log.id,
      name:
        products.find((p) => p.id === log.entityId)?.name ||
        "Artículo retirado",
      date: log.timestamp.toISOString(),
      quantity: Number(meta.quantity || 0),
      balance: Number(meta.balance || 0),
      reason:
        log.action === "STOCK_SOLD"
          ? "Venta"
          : log.action === "STOCK_RETURNED"
            ? "Anulación de venta"
            : String(meta.reason || "Ajuste"),
      ...(typeof meta.invoiceId === "string"
        ? { invoiceId: meta.invoiceId }
        : {}),
    };
  });
  return (
    <Inventory
      products={serialize(products)}
      movements={movements}
      writable={ctx.role !== "VIEWER"}
    />
  );
}
