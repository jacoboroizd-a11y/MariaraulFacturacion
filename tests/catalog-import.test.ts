import { describe, test, expect } from "vitest";
import ExcelJS from "exceljs";
import { catalogFromCells, parseCatalogFile } from "../server/catalog-import";
describe("importación de catálogo", () => {
  test("encabezados en español, precio decimal y unidades", () => {
    const result = catalogFromCells([
      ["Nombre", "Tipo", "Precio por unidad", "Cobro"],
      ["Botox", "tratamiento", "200,50", "unidad"],
    ]);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      name: "Botox",
      price: "200.50",
      pricingMode: "PER_UNIT",
      sessions: 1,
    });
  });
  test("errores de precio, código repetido y paquete por unidad impiden guardar", () => {
    const result = catalogFromCells([
      ["nombre", "precio", "codigo", "cobro", "sesiones"],
      ["A", "10", "A", "fijo", "1"],
      ["B", "20", "A", "fijo", "1"],
      ["C", "-1", "C", "fijo", "1"],
      ["D", "10", "D", "unidad", "3"],
    ]);
    expect(result.errors).toHaveLength(3);
  });
  test("CSV con punto y coma y comillas", async () => {
    const file = new File(
      ['nombre;tipo;precio;existencias\n"Crema; especial";cosmetico;"50,25";4'],
      "catalogo.csv",
    );
    expect((await parseCatalogFile(file)).rows[0]).toMatchObject({
      name: "Crema; especial",
      price: "50.25",
      type: "PRODUCT",
      stock: 4,
    });
  });
  test("Excel real se lee; fórmulas requieren convertir a valores", async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Catálogo");
    sheet.addRow(["nombre", "precio", "sesiones"]);
    sheet.addRow(["Paquete", 900, 3]);
    const buffer = await book.xlsx.writeBuffer();
    const file = new File([new Uint8Array(buffer)], "catalogo.xlsx");
    expect((await parseCatalogFile(file)).rows[0]).toMatchObject({
      name: "Paquete",
      price: "900",
      sessions: 3,
    });
    sheet.getCell("B2").value = { formula: "1+1", result: 2 };
    const formulaFile = new File(
      [new Uint8Array(await book.xlsx.writeBuffer())],
      "formulas.xlsx",
    );
    await expect(parseCatalogFile(formulaFile)).rejects.toThrow("fórmulas");
  });
});
