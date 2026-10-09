# Activar esta versión

1. Ejecutar `docs/actualizar-operaciones-clinica-neon.sql` en Neon, `neondb`, rama de producción. El SELECT final debe mostrar las cinco migraciones con `aplicada = t`. Puede reintentarse y conserva cuentas/facturas. Nunca ejecutar `db:seed` en producción.
2. Después desplegar el código nuevo en Vercel. Instalaciones nuevas: `npm run db:migrate`.
3. Administración → Usuarios: crear nombre, usuario corto, PIN y rol Contadora. Este perfil tiene bienvenida y consulta/descarga de reportes diarios/mensuales únicamente.
4. Abrir caja antes de cobrar. No se inventa una apertura para las facturas anteriores.

## Correos de cierres

Guardar de forma segura en Vercel `RESEND_API_KEY`, `REPORTS_FROM` (remitente de un dominio verificado en Resend) y `CRON_SECRET`. Verificar el dominio con los registros DNS que proporciona Resend. No escribir claves en GitHub o el chat.

Destinatario fijo: **info@dramariaraul.com**. El cierre manual prepara y envía el reporte diario inmediatamente. El automático prepara el correo a partir de las 20:00 Nicaragua. El último día laboral del mes prepara también el mensual: lunes a viernes, excluyendo feriados nacionales y días adicionales configurados. Adjuntos PDF Carta y Excel: ventas Treat Yourself, láser/estética Dra. Mariaraúl, pacientes, facturas, tarjeta/efectivo, adelantos, salidas y cierres por NIO/USD.

`vercel.json` configura `0 2 * * *` UTC (20:00 Nicaragua), `/api/cron/clinic`, con `Authorization: Bearer <CRON_SECRET>`. Vercel añade la cabecera automáticamente. **Vercel Hobby no garantiza el minuto exacto del cron.** Si el correo debe salir puntualmente a las 20:00, usar un scheduler con esa precisión que llame el mismo endpoint a las 02:00 UTC y añada la cabecera. Los cobros y salidas se bloquean a las 20:00 en cada operación aunque el scheduler tarde.

Se guardan payload, adjuntos y clave de idempotencia. Los fallos se reintentan con el mismo contenido. Los envíos ambiguos fuera de la ventana de idempotencia del proveedor pasan a revisión. `SENT` indica aceptación por Resend, no lectura ni llegada al buzón. Sin credenciales, quedan pendientes y se pueden descargar; el cierre no falla por un problema de correo. No está activado el envío real en desarrollo.

## Google Calendar

ICS público/privado de Google o archivo `.ics` hasta 2 MB: solo lectura. El archivo es una copia; el enlace se actualiza al consultar Citas.

Para sincronizar las citas creadas o movidas:

1. Habilitar Calendar API en Google Cloud, configurar consentimiento y cliente OAuth Web. Alcance `https://www.googleapis.com/auth/calendar.events`.
2. Registrar callback `https://mariaraul-facturacion.vercel.app/api/calendar/google/callback`, o el dominio real si cambia.
3. Añadir `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` en Vercel.
4. Administración → Google Calendar → Enlazar cuenta. La cuenta debe poder editar el calendario de la clínica. Indicar su ID; `primary` es el calendario principal de la cuenta.

La próxima cita de la factura y su evento local son un registro. Reintentos usan el mismo ID Google. Versiones locales y ETags evitan sustituir cambios recientes por antiguos. Si Google falla se conserva la cita pendiente y se reintenta al abrir agenda o en cron. Las citas que provienen solo de Google/ICS se editan en Google. Cambiar a un ICS reemplaza la conexión OAuth de escritura.

## WhatsApp Business e Instagram

Se utilizan APIs oficiales de Meta. No se embebe una sesión de WhatsApp Web.

1. Configurar app Meta con WhatsApp Cloud API y Messenger para Instagram: cuenta profesional vinculada a página Facebook, permisos de mensajería, revisión y modo Live cuando corresponda.
2. Añadir `META_APP_SECRET` en Vercel. Graph `v24.0` por defecto; `META_GRAPH_VERSION` permite cambiarla tras verificar compatibilidad.
3. Administración, en Mensajería: guardar token, ID del número WhatsApp, ID de WhatsApp Business, ID Instagram y página Facebook. Tokens cifrados. Se utiliza un token con acceso a ambos activos; si requieren tokens separados, responder para ese activo desde Business Suite hasta configurar su integración.
4. Webhook `https://mariaraul-facturacion.vercel.app/api/messaging/webhook`: copiar el token de verificación mostrado y suscribir mensajes de WhatsApp/Instagram. Se valida la firma HMAC y el ID de cuenta para aislar empresas.

El personal responde dentro de 24 horas, usa textos rápidos y plantillas WhatsApp aprobadas. Soporta cuerpo de texto con variables numéricas; multimedia, botones y encabezados variables se administran en Meta. Fuera de 24 horas se requiere plantilla aprobada o Business Suite. Los envíos ambiguos no se repiten automáticamente. Las conversaciones aparecen con mensajes nuevos del webhook; no importa el historial antiguo. Archivos recibidos: consultar en Business Suite. Una conversación de WhatsApp puede guardarse como cliente, con teléfono internacional y sin duplicación por teléfono.

## Compartir PDF

Compartir PDF abre el menú nativo de iPad/móvil cuando soporta archivos; elegir WhatsApp y contacto. En escritorio se descarga para adjuntar. **Un enlace de WhatsApp no puede adjuntar un PDF automáticamente.** Abrir WhatsApp lleva al chat correcto; Abrir correo abre la app predeterminada. Los reportes automáticos sí adjuntan PDF/Excel mediante Resend.
