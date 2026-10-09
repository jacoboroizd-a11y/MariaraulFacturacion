# Mariaraul · Facturación

MVP de facturación para empresas nicaragüenses, construido con Next.js App Router, TypeScript, Tailwind CSS, componentes shadcn/ui, PostgreSQL, Prisma, Zod, React Hook Form y JOSE.

Incluye clientes, catálogo de productos/servicios, cotizaciones, conversión a facturas, pagos parciales, recibos, PDFs vectoriales, dashboard, reportes, búsqueda, configuración, impuestos, usuarios y auditoría. NIO y USD usan tipos de cambio históricos por documento.

## Requisitos

- Node.js 22 o 24 y npm (el entorno se validó con Node 24).
- PostgreSQL 17; Docker + Compose es una alternativa local.
- Acceso a registry.npmjs.org y binaries.prisma.sh para instalar y generar Prisma.
- Chromium para las pruebas de navegador. Su ruta es configurable.

## Instalación local

```bash
npm ci
npm run local:env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

`local:env` crea `.env` solo si no existe y genera contraseñas y claves aleatorias; no imprime los valores. Revisa `.env` localmente para obtener tus credenciales. Si usas PostgreSQL externo, copia `.env.example` a `.env`, completa las variables y omite `db:start`. No ejecutes el seed en una base de producción.

El servidor de desarrollo escucha en el puerto 3000. En este entorno cloud, los procesos deben reiniciarse al restaurar una instancia; `scripts/start-db.sh` también restaura el respaldo local si PostgreSQL está vacío.

## Variables de entorno

| Variable                         | Uso                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | Conexión PostgreSQL privada. Usa TLS según los requisitos de tu proveedor.                                                |
| `AUTH_SECRET`                    | Clave de sesión de al menos 32 caracteres; genera con `openssl rand -hex 32`.                                             |
| `APP_URL`                        | Origen exacto de la aplicación, incluyendo protocolo y puerto. Protege las mutaciones contra solicitudes de otros sitios. |
| `POSTGRES_PASSWORD`              | Solo Docker local; debe coincidir con la contraseña de `DATABASE_URL`.                                                    |
| `SEED_ADMIN_PASSWORD`            | Contraseña elegida para el administrador demo, mínimo 12 caracteres.                                                      |
| `SEED_BILLING_PASSWORD`          | Contraseña elegida para el usuario de facturación demo, mínimo 12 caracteres.                                             |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | Ruta opcional al ejecutable Chromium. En cloud: `/usr/bin/chromium`.                                                      |
| `E2E_BASE_URL`                   | Origen opcional del servidor probado; por defecto el puerto 3000 local.                                                   |

Las variables `SEED_*` solo se necesitan para crear la demo y ejecutar E2E. Nunca se exponen al navegador. No agregues `.env` al control de versiones.

## Demo

- Empresa: **Distribuidora Ejemplo Nicaragua, S.A.**
- Administrador: `admin@ejemplo.invalid`.
- Facturación: `facturacion@ejemplo.invalid`.
- Contraseñas: valores de `SEED_ADMIN_PASSWORD` y `SEED_BILLING_PASSWORD` definidos al ejecutar el seed.
- 8 clientes ficticios, 15 productos/servicios, IVA configurable del 15%, 5 cotizaciones, 15 facturas y 14 pagos con sus recibos.
- Incluye documentos pagados, parciales, pendientes, vencidos y un borrador de cotización.

El seed es no destructivo: si la empresa demo ya existe, preserva sus datos y contraseñas y omite la creación. No se utiliza una contraseña universal ni existe acceso automático sin autenticación.

## Flujo principal

1. Inicia sesión y crea un cliente.
2. Crea un producto o servicio con precio, moneda e impuesto.
3. Crea una cotización, selecciona el cliente y agrega productos usando el buscador. Puedes agregar líneas personalizadas y editar cantidad, precio, descuento e impuesto.
4. Guarda y convierte la cotización en factura. La conversión repetida devuelve la factura existente.
5. Abre el PDF o imprime el documento.
6. Registra un pago parcial; se genera su recibo y se actualizan saldo y estado.
7. Registra el saldo restante; la factura pasa a **PAID**.
8. Revisa dashboard, reportes e historial actualizado.

Las facturas directas pueden guardarse como borrador o emitirse. Las emitidas son inmutables: para corregir una factura sin pagos, anúlala y emite otra. Los borradores se pueden editar o eliminar. Para anular una factura pagada, revierte primero sus pagos. Al eliminar un pago, se recalculan los saldos y su recibo queda anulado, conservando el historial.

## Reglas financieras

- PostgreSQL almacena dinero con `Decimal(18,2)`, cantidades con cuatro decimales y tipos de cambio con seis.
- `lib/money.ts` centraliza todos los cálculos con `decimal.js`, precisión 40 y redondeo HALF_UP a dos decimales.
- Los precios no incluyen impuestos. Se aplica primero el descuento de línea, después el descuento global proporcional por línea y finalmente el impuesto sobre el neto. El total es la suma de los totales de línea ya redondeados.
- Pagos exclusivamente en la moneda de la factura; se bloquean montos negativos, fracciones de centavo y sobrepagos.
- El tipo de cambio expresa **NIO por USD**. Los resúmenes convierten con el tipo histórico de cada documento a la moneda principal actual de la empresa.
- Los impuestos cobrados se asignan proporcionalmente a los pagos recibidos dentro del período.
- Los estados vencidos se actualizan al consultar documentos, dashboard o reportes, usando la fecha de Nicaragua (`America/Managua`).
- Las secuencias de factura, cotización y recibo se incrementan dentro de transacciones serializables con reintentos limitados y espera aleatoria. Los índices únicos por empresa refuerzan la integridad. La configuración no permite retroceder la numeración.
- Los documentos conservan los datos de empresa/cliente, tasas y términos al emitirse. Los cambios futuros no alteran los documentos anteriores.

## Seguridad y arquitectura multiempresa

Las sesiones usan JWT firmado con JOSE, cookie HttpOnly/SameSite y Secure en producción; la sesión también se verifica contra PostgreSQL en cada solicitud. Las contraseñas se almacenan con bcrypt, costo 12. Logout elimina la sesión. Hay un límite de intentos de inicio de sesión por cuenta.

`Context` deriva usuario y empresa de la sesión y verifica su membresía vigente. Las lecturas y mutaciones aplican `companyId`; el servidor comprueba IDs relacionados y permisos. Los roles son ADMIN (incluye usuarios/configuración), BILLING (operaciones de facturación) y VIEWER (solo lectura). La interfaz oculta acciones sin permiso y el servidor rechaza intentos directos.

Los documentos y sus relaciones utilizan claves foráneas compuestas para impedir vínculos entre empresas. Las migraciones incluyen restricciones CHECK de saldos, montos, porcentajes, fechas y tipos de cambio. Las operaciones de conversión, pagos, numeración y auditoría son atómicas.

La estructura permite múltiples membresías por usuario; este MVP abre la primera empresa de su sesión. La creación de empresas se realiza mediante aprovisionamiento/seed, y no incluye todavía un flujo público de registro o selector de empresa.

## Estructura

- `app/`: páginas del App Router, rutas protegidas y API.
- `components/`: shell, tablas, editor, formularios y documentos imprimibles.
- `components/ui/`: componentes shadcn/ui (Radix Slot, CVA y estilos Tailwind).
- `server/domain.ts`: reglas de negocio y transacciones.
- `server/auth.ts`: autenticación, sesión y permisos.
- `server/queries.ts`: consultas por empresa y reportes.
- `server/pdf.tsx`: documentos con `@react-pdf/renderer`, sin screenshots ni navegador headless.
- `lib/`: cálculos, presentación y fechas.
- `prisma/`: esquema, migraciones y seed.
- `tests/`: pruebas financieras, integración PostgreSQL y E2E.
- `scripts/`: preparación y respaldo del entorno local.

## Migraciones

```bash
npm run db:generate
npm run db:migrate
```

Para desarrollar futuras modificaciones al modelo:

```bash
npx prisma migrate dev --name nombre_del_cambio
```

Las restricciones CHECK se mantienen en las migraciones SQL. Usa `migrate deploy` en producción; no reemplaces las migraciones por `db push`.

## Validaciones

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

La integración requiere PostgreSQL y crea empresas aisladas temporales, verifica transacciones, roles, aislamiento, PDFs y reportes, y elimina exclusivamente sus propios datos al terminar.

Con el servidor iniciado y la demo sembrada:

```bash
npm run test:e2e
```

E2E usa las credenciales demo de `.env`, recorre el flujo desde el navegador y valida protección de rutas/origen. Crea registros identificados por un sufijo aleatorio y elimina exclusivamente sus propios registros al terminar. Las capturas de fallos permanecen en `test-results/` (ignorado).

```bash
npm run format:check
```

## Build y despliegue en Vercel

```bash
npm run db:generate
npm run db:migrate
npm run build
npm start
```

1. Conecta el repositorio a Vercel con el preset Next.js.
2. Provisiona PostgreSQL administrado y configura `DATABASE_URL`, `AUTH_SECRET` y `APP_URL` con el dominio HTTPS real. Usa un pool/conexión apropiado para serverless según tu proveedor.
3. Configura el build como `npm run db:generate && npm run build`.
4. Ejecuta `npm run db:migrate` desde CI o una máquina autorizada antes de desplegar; no ejecutes migraciones concurrentes en cada función.
5. Aprovisiona empresa y administrador en la base de destino. El seed documentado sirve para entornos de demostración; no ejecutarlo automáticamente en producción.
6. Las rutas PDF usan el runtime Node.js y no requieren Chromium. Las sesiones requieren PostgreSQL disponible.

El proyecto no está desplegado automáticamente por estas instrucciones.

## Respaldo cloud

`npm run db:backup` guarda un dump privado en `/workspace/.cloud/mariaraul.dump`, fuera del repositorio. El respaldo corresponde al momento en que se ejecuta; repítelo después de cambios que quieras conservar. `db:start` solo lo restaura cuando no existe el esquema de la aplicación. En producción, usa el servicio de respaldos de tu proveedor.

La publicación del entorno cloud conserva archivos y dependencias, pero no garantiza conservar procesos o volúmenes Docker externos. Los pasos reutilizables guardados reinician PostgreSQL y la aplicación y recuperan ese dump cuando hace falta. Cada tarea cloud ya está aislada: usa el checkout existente y no crees worktrees salvo solicitud expresa.
