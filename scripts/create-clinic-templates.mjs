import ExcelJS from "exceljs";
const shared = [
  "nombre",
  "precio",
  "moneda",
  "codigo",
  "categoria",
  "descripcion",
];
const templates = [
  {
    file: "plantilla-tratamientos",
    columns: [...shared, "cobro", "sesiones", "unidad"],
    examples: [
      [
        "Botox",
        "TU TARIFA",
        "NIO",
        "EST-BTX-001",
        "Estético",
        "Descripción",
        "unidad",
        1,
        "unidad",
      ],
      [
        "Depilación láser",
        "TU PRECIO",
        "NIO",
        "LAS-DEP-001",
        "Láser",
        "Zona o modalidad",
        "fijo",
        1,
        "sesión",
      ],
    ],
  },
  {
    file: "plantilla-inventario",
    columns: [...shared, "existencias", "unidad"],
    examples: [
      [
        "Crema facial 50 ml",
        "TU PRECIO",
        "NIO",
        "COS-CRE-001",
        "Cuidado facial",
        "Presentación 50 ml",
        0,
        "unidad",
      ],
    ],
  },
  {
    file: "plantilla-catalogo",
    columns: [...shared, "tipo", "cobro", "sesiones", "existencias", "unidad"],
    examples: [
      [
        "Tratamiento estético",
        "TU PRECIO",
        "NIO",
        "EST-TRA-001",
        "Estético",
        "Descripción",
        "tratamiento",
        "fijo",
        1,
        "",
        "sesión",
      ],
      [
        "Producto cosmético",
        "TU PRECIO",
        "NIO",
        "COS-PRO-001",
        "Cosméticos",
        "Descripción",
        "cosmetico",
        "fijo",
        1,
        0,
        "unidad",
      ],
    ],
  },
];
for (const template of templates) {
  const book = new ExcelJS.Workbook();
  book.creator = "Mariaraul";
  const data = book.addWorksheet("Datos");
  data.addRow(template.columns);
  data.autoFilter = {
    from: "A1",
    to: data.getRow(1).getCell(template.columns.length).address,
  };
  data.views = [{ state: "frozen", ySplit: 1 }];
  for (const [index, column] of template.columns.entries()) {
    const col = data.getColumn(index + 1);
    col.width = ["nombre", "descripcion", "categoria"].includes(column)
      ? 30
      : 20;
    for (let row = 2; row <= 201; row++) {
      const cell = data.getCell(row, index + 1);
      if (column === "codigo") cell.numFmt = "@";
      if (column === "precio") cell.numFmt = "0.00";
      if (["moneda", "categoria", "tipo", "cobro"].includes(column))
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [
            column === "moneda"
              ? '"NIO,USD"'
              : column === "tipo"
                ? '"tratamiento,paquete,cosmetico"'
                : column === "cobro"
                  ? '"fijo,unidad"'
                  : '"Estético,Láser,Cosméticos"',
          ],
          showErrorMessage: column !== "categoria",
          errorTitle: "Revisa el valor",
          error: "Selecciona un valor de la lista.",
        };
    }
  }
  const guide = book.addWorksheet("Instrucciones");
  guide.addRows([
    ["Campo", "Cómo llenarlo"],
    [
      "Datos",
      "Llena únicamente la primera hoja Datos. No cambies los encabezados. Una fila por artículo, hasta 200.",
    ],
    ["nombre", "Nombre del tratamiento o producto. Obligatorio."],
    [
      "precio",
      "Tu precio real, número mayor o igual a cero. Sin símbolos de moneda ni separadores de miles. No hay precios predeterminados.",
    ],
    ["moneda", "NIO o USD. Si se omite, NIO."],
    [
      "codigo (SKU)",
      "Identificador único y permanente. Usa letras mayúsculas, números y guiones. No incluyas precios, existencias, lote ni caducidad.",
    ],
    [
      "Ejemplos SKU",
      "EST-BTX-001 (Botox), LAS-DEP-001 (láser), COS-CRE-001 (crema). Cada tamaño o presentación debe tener un SKU diferente.",
    ],
    [
      "Actualizar artículos",
      "Usa exactamente el mismo código para actualizar precio o stock. Cambiar el código crea otro artículo. Si se omite, se genera a partir del nombre; se recomienda asignarlo.",
    ],
    [
      "categoria",
      "Estético o Láser para tratamientos. Para productos puedes escribir la categoría que necesites.",
    ],
    [
      "cobro",
      "fijo: precio del tratamiento o paquete. unidad: tarifa multiplicada por unidades aplicadas, por ejemplo Botox. Solo para tratamientos individuales.",
    ],
    [
      "sesiones",
      "1 para un tratamiento individual. Número de sesiones para un paquete; el precio fijo corresponde al paquete completo.",
    ],
    [
      "existencias",
      "Solo productos: conteo total disponible, entero no negativo. El valor reemplaza el stock actual, NO se suma. Vacío conserva el stock; un producto nuevo comienza en 0.",
    ],
    [
      "tipo",
      "Solo en Catálogo completo: tratamiento, paquete o cosmetico. Para productos indicar cosmetico.",
    ],
    [
      "Impuestos",
      "Se conservan los impuestos ya configurados. Asigna los impuestos en el catálogo después de importar artículos nuevos.",
    ],
    [
      "Antes de guardar",
      "Sube el archivo, revisa la vista previa y confirma Guardar. Reemplaza fórmulas por valores. Las otras hojas no se importan.",
    ],
  ]);
  guide.getColumn(1).width = 26;
  guide.getColumn(2).width = 100;
  guide.getColumn(2).alignment = { wrapText: true };
  guide.eachRow((row) => {
    row.height = 44;
  });
  const examples = book.addWorksheet("Ejemplos (no importar)");
  examples.addRow(template.columns);
  examples.addRows(template.examples);
  examples.columns.forEach((c) => {
    c.width = 24;
  });
  for (const sheet of book.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF047857" },
    };
    sheet.getRow(1).height = 28;
  }
  await book.xlsx.writeFile(`public/${template.file}.xlsx`);
}

const clients = new ExcelJS.Workbook();
const customers = clients.addWorksheet("Clientes");
customers.addRow([
  "Nombre y Apellido",
  "Numero de Telefono",
  "Correo Electrónico",
]);
customers.columns.forEach((c) => {
  c.width = 30;
  c.numFmt = "@";
});
customers.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
customers.getRow(1).fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF047857" },
};
const instructions = clients.addWorksheet("Instrucciones");
instructions.addRows([
  ["Completa únicamente la hoja Clientes."],
  ["El nombre es obligatorio. Teléfono y correo son opcionales."],
  [
    "Escribe el teléfono como texto: +50588887777. Sin prefijo se interpreta como Nicaragua.",
  ],
  [
    "Los teléfonos o correos existentes se detectan en la vista previa; no se sobrescriben.",
  ],
  ["No uses fórmulas. Máximo 500 clientes por archivo."],
]);
instructions.getColumn(1).width = 110;
await clients.xlsx.writeFile("public/plantilla-clientes.xlsx");
