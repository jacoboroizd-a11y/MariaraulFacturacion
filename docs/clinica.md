# Clínica y cosméticos

## Venta rápida

Después de iniciar sesión, todos abren el **Dashboard**. ADMIN y BILLING crean documentos desde **Nueva factura**. VIEWER conserva acceso de consulta al resumen y a los registros.

1. Toca tratamientos, paquetes o cosméticos para agregarlos. Ajusta la cantidad en el resumen.
2. Escribe el nombre y teléfono opcional del cliente. Si existe, selecciona su coincidencia; si es nuevo, su ficha se crea automáticamente al guardar la factura, sin registro previo.
3. Elige pago completo, abono o cobrar después. Para pagos recibidos, selecciona efectivo, tarjeta, transferencia u otro. Las notas de venta no tienen fecha de vencimiento; los abonos y saldos se mantienen registrados.
4. Agrega la próxima cita (hora de Nicaragua) y guarda. Desde el comprobante puedes imprimir, registrar otro abono o marcarlo como pagado sin salir de la factura.

La factura, el cliente, las sesiones y el primer pago se guardan en una sola transacción. Un fallo revierte todo. Los reintentos de venta, cobro y entradas de inventario no duplican operaciones mientras se conserva la pantalla y su identificador de solicitud.

El nombre es necesario para identificar al cliente. Coincidencias por nombre o teléfono se sugieren; personas distintas con el mismo nombre no se fusionan automáticamente.

## Catálogo, unidades y paquetes

- Cosmético: precio por unidad vendida y existencias.
- Tratamiento individual: precio fijo, una sesión.
- Paquete: precio total del paquete y sesiones incluidas; al vender varios paquetes se acumulan las sesiones.
- Tratamiento por unidad aplicada: tipo Tratamiento, **Cómo se cobra: Precio por unidad aplicada**, precio por unidad y una sesión. Por ejemplo, 20 unidades a una tarifa de 200 calculan 4,000; las 20 unidades representan un tratamiento, no 20 sesiones.

Los precios y tasas provienen del catálogo en el servidor. Se convierten con el tipo de cambio de la empresa cuando cambia la moneda de venta. Los impuestos solo se agregan si el artículo tiene uno configurado. La factura conserva sus precios históricos.

**Sesiones y citas** permite registrar visitas y reprogramar la próxima cita. También se puede hacer desde la factura. Se rechazan sesiones superiores a las contratadas y cambios fuera de la empresa del usuario. Una factura con sesiones utilizadas no se puede anular; corregir sesiones ya registradas requiere un flujo posterior de reversión.

## Inventario

Los cosméticos nuevos comienzan con cero unidades salvo que se indiquen existencias al crearlos o importarlos. Carga los conteos reales antes de venderlos. Los tratamientos no consumen este inventario.

**Inventario** muestra existencias, productos agotados y últimos 100 movimientos. Permite entradas y salidas con motivo. Emitir una factura descuenta unidades incluso si se cobra después; un borrador o una cotización no las descuenta. Anular una factura emitida sin pagos ni sesiones usadas devuelve las unidades una sola vez. Para anular una venta cobrada, revierte primero sus pagos desde su historial.

La aplicación impide cantidades fraccionarias de cosméticos, stock negativo y sobreventa concurrente. Los cambios de inventario se auditan.

## Importación de Excel / CSV

En **Tratamientos y cosméticos**, abre **Importar**. Descarga la plantilla, selecciona un `.xlsx` o `.csv`, revisa la vista previa y guarda. Usa la primera hoja, hasta 200 artículos, 30 columnas y 5 MB. Las fórmulas deben convertirse a valores antes de importar. Los CSV admiten comas o punto y coma.

Columnas:

| Columna     | Valores                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| nombre      | Obligatorio                                                                      |
| precio      | Obligatorio; máximo dos decimales                                                |
| tipo        | tratamiento, paquete o cosmetico; por defecto tratamiento                        |
| moneda      | NIO o USD; por defecto NIO                                                       |
| sesiones    | Entero 1–100; por defecto 1                                                      |
| existencias | Conteo absoluto de cosméticos; omitir conserva el stock de un artículo existente |
| cobro       | fijo o unidad; por defecto fijo                                                  |
| unidad      | Nombre de la unidad aplicada o vendida                                           |
| codigo      | Código único; si se omite, se genera a partir del nombre                         |

Un código existente actualiza ese artículo; uno nuevo lo crea. Se preservan sus impuestos y estado activo. Una columna de existencias explícita reemplaza el conteo, no suma una entrada. No se guarda una importación con errores. El archivo real de tarifas de la clínica todavía debe cargarse; la aplicación no incluye tarifas médicas inventadas.

## Publicación de este cambio

Primero actualiza la base de producción y después publica el código. El build de Vercel genera Prisma y compila; no aplica migraciones automáticamente.

- Desde una máquina autorizada: ejecutar `npm run db:migrate` con la conexión de producción configurada de forma segura.
- Desde Neon: ejecutar el contenido completo de [actualizar-clinica-neon.sql](actualizar-clinica-neon.sql) en SQL Editor. El script aplica exclusivamente esta migración y registra su checksum para Prisma. Se puede repetir si ya se aplicó correctamente.

Después integrar la rama de clínica en `main` para que Vercel despliegue. No ejecutar el seed demo en producción. Usuarios, clientes, facturas, pagos y credenciales existentes se conservan.

## Validación

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, y `npm run test:e2e` con PostgreSQL y el servidor iniciado. Las pruebas usan datos aislados o identificados y eliminan sus propios registros.

## Impuestos opcionales

En Configuración → Impuestos puedes añadir un nombre y porcentaje, editarlo o desactivarlo. En cada tratamiento o cosmético, elige el impuesto correspondiente o Sin impuesto. Las ventas guardan el impuesto aplicado en ese momento; modificar la tarifa no altera los comprobantes anteriores.

## Subir inventario y tratamientos

En Tratamientos y cosméticos están visibles las opciones Importar tratamientos, Importar productos e inventario y Catálogo completo. Inventario incluye la importación de productos. Selecciona la opción, descarga su plantilla y sube un Excel (.xlsx) o CSV. Revisa la vista previa y pulsa Guardar. En archivos separados no necesitas la columna tipo. En Catálogo completo sí debes indicar tipo para los productos. Nombre y precio son obligatorios; existencias es el conteo total disponible y código identifica los artículos para actualizarlos sin duplicarlos.

## Dashboard y reporte mensual

El dashboard es la pantalla de inicio: ventas, cobros, saldos, clientes, tratamientos estéticos y láser facturados, sesiones realizadas, inventario, últimos tratamientos y próximas citas. Para clasificar tratamientos, usa Estético o Láser en categoría. Un tratamiento sin categoría sigue disponible, pero no cuenta en esos dos grupos.

Selecciona un mes y descarga el Excel desde el dashboard. Sesiones realizadas usa la fecha y hora de cada visita marcada como realizada, en Nicaragua. Tratamientos facturados usa el mes de la fecha del comprobante y muestra la hora de registro. Comprar un paquete no implica haber realizado sus sesiones.

Las plantillas Excel incluyen Datos (la hoja a llenar), Instrucciones y Ejemplos. Los ejemplos no se importan ni fijan tus precios. Usa un SKU estable por artículo y presentación: EST-BTX-001, LAS-DEP-001, COS-CRE-001. Reutiliza el mismo SKU al actualizar precios o stock. Lotes, caducidad y precios no forman parte del código.
