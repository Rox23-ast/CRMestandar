# Arquitectura de Mudanzas Chico

Este documento describe la arquitectura, estructura y decisiones de diseño del proyecto backend "Mudanzas Chico". Es un **documento vivo** que debe ser actualizado continuamente a medida que el proyecto evolucione y se implementen nuevas características.

## 1. Visión General

El proyecto es una solución completa para "Mudanzas Chico", dividida en:
- **Backend (API RESTful):** Node.js, Express y TypeScript.
- **Frontend (Panel de Admin):** React (Vite) + TypeScript y Tailwind CSS.

Actúa como el sistema unificado para tres módulos principales:
- **Bot:** Gestión de integraciones y webhooks para WhatsApp, y su panel de configuración de IA.
- **CRM:** Panel de administración, gestión de clientes y seguimiento.
- **Cotizador:** Motor de cálculo de precios de mudanzas.

La persistencia de datos se maneja mediante **SQLite** y se gestiona con el ORM **Prisma**. Todo el sistema está diseñado para ser seguro, robusto y preparado para ser desplegado mediante Docker en DigitalOcean, persistiendo los datos de SQLite a través de un volumen de Docker seguro.

## 2. Estructura de Directorios (Domain-Driven Structure)

```text
/
├── /frontend           # SPA React (Vite) para el panel de administración
│   ├── /src
│   │   ├── App.tsx     # Layout principal y sistema de pestañas de configuración
│   │   └── index.css   # Estilos base y tipografías (Tailwind)
│   └── tailwind.config.js # Design System (Colores corporativos y fuentes)
│
├── /src                # Backend Node.js
│   ├── /bot            # Módulo del Chatbot (WhatsApp)
│   │   ├── /controllers# Webhook de Meta y Endpoints del Panel.
│   │   ├── /services   # Lógica (whatsappService, aiService, conversationFlow)
│   │   └── /templates  # Plantillas
│   ├── /crm            # Módulo del CRM
│   │   ├── /controllers# Bandeja, mensajes, asignaciones y notificaciones
│   │   ├── /services   # Conversaciones, asignación, eventos y notificaciones
│   │   └── routes.ts   # Rutas REST protegidas por JWT
│   ├── /cotizador      # Módulo de Cotización
│   ├── /core           # Núcleo de la aplicación (Seguridad y Configuración)
│   └── index.ts        # Entrypoint
```

## 3. Conversaciones y Asignaciones

- **Conversación como unidad de trabajo:** El primer mensaje de un cliente crea una `Conversation`. Los mensajes posteriores mantienen la misma asignación hasta que la conversación se cierre.
- **Mensajes:** Cada entrada y salida se registra en `Message`, con dirección, autor (`CUSTOMER`, `BOT`, `AGENT`), tipo, estado de entrega e identificador externo de WhatsApp para evitar duplicados.
- **Asignación durante horario laboral:** Se selecciona un agente con estado `AVAILABLE`, capacidad disponible y la asignación más antigua (`round-robin`).
- **Asignación fuera de horario:** Se asigna al rol `MARKETING_DIRECTOR`. La configuración inicial usa `America/Bogota`, lunes a viernes de 08:00 a 18:00, y admite excepciones por fecha.
- **Control bot/agente:** La conversación inicia en `BOT_ACTIVE`. El agente puede tomarla (`HUMAN_ACTIVE`) y reactivar el bot explícitamente. Una conversación resuelta se reabre cuando llega un nuevo mensaje.
- **Auditoría:** Cambios de asignación, toma de control y reactivación del bot se registran en `AuditEvent`.
- **Seguimiento:** `SlaPolicy`, prioridad y `nextFollowUpAt` permiten ajustar los tiempos de respuesta y seguimiento sin hard-codear la operación.

## 4. API CRM y Notificaciones

- `GET /api/crm/conversations`: Bandeja paginada con filtros de estado, prioridad y agente.
- `GET /api/crm/conversations/:id`: Historial de mensajes, asignaciones y auditoría.
- `POST /api/crm/conversations/:id/claim`: Toma manual de una conversación.
- `POST /api/crm/conversations/:id/bot`: Devuelve la conversación al bot.
- `POST /api/crm/conversations/:id/assign`: Reasignación administrativa o de Marketing.
- `POST /api/crm/conversations/:id/messages`: Respuesta del agente por WhatsApp.
- `GET /api/crm/notifications` y `PATCH /api/crm/notifications/:id/read`: Notificaciones persistentes.
- `GET /api/crm/events`: Canal SSE para notificaciones en tiempo real.
- `POST /api/crm/auth/bootstrap`: Crea una única cuenta `ADMIN` usando `CRM_BOOTSTRAP_TOKEN`.
- `POST /api/crm/auth/login`: Intercambia credenciales por un JWT de 8 horas.
- `POST /api/crm/auth/users`: Crea agentes o directora; requiere rol `ADMIN`.
- `PATCH /api/crm/conversations/:id/status`: Actualiza estado, prioridad y próxima fecha de seguimiento.
- `GET/PUT /api/crm/settings/sla`: Consulta o modifica tiempos de primera respuesta y seguimiento.
- `GET/PUT /api/crm/settings/business-hours`: Consulta o modifica zona horaria y horario semanal.
- `GET/PUT/DELETE /api/crm/settings/business-hours/exceptions`: Gestiona festivos y excepciones de horario.

Las rutas CRM, excepto `auth/bootstrap` y `auth/login`, requieren un JWT Bearer válido y cargan el usuario desde la base de datos. Las contraseñas se almacenan usando scrypt con salt. Las respuestas de error usan un formato Problem Details reducido y las entradas se validan con Zod.

## 5. Evolución del Bot y Machine State

- **Flujos de Conversación:** Se implementó una "Máquina de Estados" para el Bot (mediante la columna `botStep` en la tabla de Clientes). Esto permite que el chatbot recuerde la fase del cliente (Ej. `START`, `QUOTE_ORIGIN`, `QUOTE_DESTINATION`, `AGENT_HANDOFF`) sin perder contexto.
- **Abstracción de IA (OpenAI):** Se integró el SDK oficial de OpenAI (`openai`) en `aiService.ts`. El chatbot utiliza el modelo `gpt-4o-mini` configurado con `response_format: { type: "json_object" }` para asegurar que las respuestas sean estructuradas. Esto permite que el LLM redacte respuestas naturales y extraiga la intención (`intent`) en una sola llamada a la API, optimizando costos y velocidad.
- **Respuestas Rápidas deterministas:** Las reglas configuradas en *Respuestas Rápidas* (`customRules`) se evalúan por coincidencia de palabras clave (case-insensitive, separadas por coma) antes de llamar a la IA, en `matchQuickResponse()` de `conversationFlow.ts`. Si alguna regla coincide, el bot responde exactamente el texto configurado (con reemplazo de `[Nombre]` si el cliente tiene nombre registrado) sin depender de la disponibilidad o validez de la API de OpenAI. Solo los mensajes sin regla coincidente pasan al LLM.

- **Seguridad en Capa HTTP:** Se utiliza `helmet` para proteger cabeceras y `express-rate-limit` para evitar abusos en los endpoints.
- **Validación de Webhooks (Meta/WhatsApp):** El GET valida el token de suscripción y el POST valida `x-hub-signature-256` con `WA_APP_SECRET`. El cuerpo original se conserva solo para verificar la firma. Se responde instantáneamente con status 200 después de validar la autenticidad, antes de procesar el mensaje para evitar reintentos de Meta.
- **Interfaz Gráfica (Frontend):** Se eligió React con Tailwind CSS para mapear de forma exacta la identidad visual.
- **Validación de Datos:** Todos los *inputs* deben ser validados utilizando `zod` antes de llegar a los servicios.
- **Autenticación:** Las rutas privadas (CRM/Cotizador administrativo) se protegen mediante JWT (JSON Web Tokens).
- **Tipado Estricto:** TypeScript se utiliza en modo estricto para evitar errores en tiempo de ejecución.
- **Testing:** Se utiliza `jest` (y `ts-jest`) para pruebas unitarias. Cada nueva funcionalidad en el `core` y módulos críticos debe estar cubierta por tests.
- **Panel CRM inicial:** `frontend/src/CrmInbox.tsx` incluye login JWT, bandeja, historial, toma de control, reactivación del bot, respuesta por WhatsApp y consumo autenticado de SSE.

## 6. Despliegue del Panel Web

El despliegue Docker usa una etapa independiente para instalar las dependencias del frontend y ejecutar `npm run build` dentro de `frontend/`. La imagen de producción copia `frontend/dist` a `/app/public`, y Express sirve esos archivos estáticos desde `src/index.ts` mediante `express.static` bajo la ruta `/crm`. La raíz del servidor (`http://ip:puerto/`) redirige con `301` a `/crm/`, que actúa como ruta principal del panel, y `/crm` sin barra final se canonicaliza a `/crm/`. De esta forma, el panel React y la API se entregan desde el mismo contenedor y detrás del proxy Nginx. Las imágenes de backend usan Node.js 22, compatible con `openai`, e instalan OpenSSL para que Prisma seleccione y ejecute correctamente su engine nativo sobre Alpine.

## 7. Gestión de Credenciales de APIs (Configuración del Chatbot)

Se añadió la capacidad de configurar credenciales de WhatsApp Business API y OpenAI directamente desde el panel CRM, eliminando la necesidad de editar variables de entorno manualmente.

### 7.1 Variables Configurables

- `WA_API_TOKEN` — Token de acceso permanente de WhatsApp Business API
- `WA_VERIFY_TOKEN` — Token de verificación del webhook de Meta
- `WA_PHONE_NUMBER_ID` — ID del número de teléfono de WhatsApp Business
- `WA_APP_SECRET` — Secret de la aplicación de Meta Developers
- `OPENAI_API_KEY` — Clave de API de OpenAI para el asistente de IA

**Excluidas** (infraestructura/seguridad): `DATABASE_URL`, `JWT_SECRET`, `CRM_BOOTSTRAP_TOKEN`, `PORT`, `NODE_ENV`.

### 7.2 Almacenamiento Seguro

- Nueva entidad Prisma `StoredCredential` (singleton con `id: "default"`).
- Cifrado AES-256-GCM usando `crypto` nativo de Node.js.
- Clave maestra de 32 bytes desde `CREDENTIALS_ENCRYPTION_KEY` (64 hex chars).
- En la BD se guardan: `data` (ciphertext base64), `iv` (base64), `tag` (auth tag base64).
- El backend **nunca devuelve valores en claro** tras el guardado; el endpoint `GET /api/crm/settings/credentials` retorna solo valores enmascarados (primeros 4 y últimos 4 caracteres).

### 7.3 Permisos

- Solo usuarios con rol `ADMIN` pueden ver y editar la sección **Configuración de APIs**.
- Usuarios `AGENT` y `MARKETING_DIRECTOR` no ven esta opción en la sidebar.
- Middleware `requireCrmRole('ADMIN')` protege ambos endpoints (`GET` y `PUT`).

### 7.4 Migración Inicial Automática

Al arrancar el servidor (`src/index.ts`), si la tabla `StoredCredential` está vacía, se ejecuta `seedFromEnv()` que:
1. Lee las 5 variables del `.env` actual.
2. Si alguna tiene valor, cifra y crea el registro singleton.
3. Evita sobrescribir credenciales ya guardadas por el usuario.

### 7.4.1 Consumidores de Credenciales (DB autoritativa)

Todos los servicios del bot leen las credenciales desde la base de datos cifrada vía `getRawCredentials()`. La semántica es:

- Si el registro `StoredCredential` **no existe**, se devuelven los valores del `.env` (fallback inicial).
- Si el registro **existe**, sus valores son **autoritativos**: un campo vacío significa "sin configurar" y **no** se vuelve a leer del `.env`. Esto permite deshabilitar una integración (ej. OpenAI) dejando el campo vacío desde el panel.

Consumidores:

- `verifyWebhook` (`GET /api/bot/webhook`): compara `hub.verify_token` contra `WA_VERIFY_TOKEN` de la DB.
- `isValidMetaSignature` (`POST /api/bot/webhook`): valida `x-hub-signature-256` con `WA_APP_SECRET` de la DB.
- `sendWhatsAppMessage`: usa `WA_API_TOKEN` y `WA_PHONE_NUMBER_ID` de la DB para enviar por Graph API.
- `processMessageWithAI`: usa `OPENAI_API_KEY` de la DB para inicializar el cliente de OpenAI; si está vacía, usa el fallback Mock NLP.

Esto garantiza que los cambios hechos desde el panel CRM surtan efecto sin reiniciar el servidor ni editar el `.env`.

### 7.5 API Endpoints

- `GET /api/crm/settings/credentials` — Retorna credenciales enmascaradas (requiere `ADMIN`).
- `PUT /api/crm/settings/credentials` — Actualiza credenciales (body parcial, requiere `ADMIN`).

### 7.6 Frontend

- Nueva vista `CredentialsSettings.tsx` integrada en `App.tsx`.
- Sidebar reorganizada en dos grupos:
  - **CRM** → *Bandeja CRM* (pantalla por defecto).
  - **Configuración del Chatbot** (acordeón colapsable) → *Mensajes y Textos*, *Personalidad IA*, *Respuestas Rápidas*, *Reglas y Límites*, *Configuración de APIs*.
- Cada campo muestra valor enmascarado con botón "Mostrar/ocultar" y botón "Guardar" individual.
- El botón "Guardar" solo se habilita cuando el campo fue editado (dirty tracking), evitando guardar el literal enmascarado que se muestra tras cada carga.
- Solo visible para usuarios `ADMIN`; otros roles ven mensaje de acceso restringido.

---

## 8. Estructura de la Base de Datos

Para documentar el esquema real de la base de datos se dispone del script `scripts/dump-db-schema.mjs`, ejecutable con `npm run db:schema`. El script consulta `sqlite_master` mediante Prisma (tablas, índices y triggers, excluyendo objetos internos de SQLite y `_prisma_migrations`) y escribe el DDL completo en `docs/db-structure.sql`, un archivo versionable que refleja la estructura vigente sin datos.

*Nota para los Agentes IA: Este documento debe actualizarse cada vez que se cree un nuevo módulo, tabla en la base de datos o se cambie la lógica de negocio fundamental.*
