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

### 6.1 Dominio, HTTPS y Webhook de Meta

- **Dominio:** `cotizador.chicologistica.com` (registro DNS `A` → IP del droplet). El panel CRM y el cotizador **comparten este dominio**: el CRM queda en `https://cotizador.chicologistica.com/crm/` (la raíz redirige `301` a `/crm/`) y el cotizador en `https://cotizador.chicologistica.com/cotizador/`.
- **TLS:** certificado **Let's Encrypt** emitido con `certbot certonly --standalone`; los archivos viven en `/etc/letsencrypt/live/cotizador.chicologistica.com/` y se montan de solo lectura en el contenedor Nginx (`/etc/letsencrypt:/etc/letsencrypt:ro`).
- **Nginx:** `server_name cotizador.chicologistica.com`; el puerto 80 redirige `301` a HTTPS y el 443 sirve con el certificado. Meta exige HTTPS con certificado de CA confiable (los autofirmados se rechazan).
- **Ruteo por rutas (un solo Nginx):** `/crm` → `app:3000` (panel + assets); `/api/crm/`, `/api/bot/`, `/api/integrations/`, `/health` → `app:3000`; `/cotizador/` → contenedor `cotizador-web`; `/api/webhooks/` y `/api/quotes` → contenedor `cotizador-api:3001`. Los upstreams del cotizador usan `resolver 127.0.0.11` + variable, así Nginx arranca aunque el stack del cotizador esté caído (responde 502 solo en sus rutas). Ambos stacks comparten la red `deploy_mudanzas_net`.
- **Webhook de Meta:** `https://cotizador.chicologistica.com/api/bot/webhook` (GET verifica con `WA_VERIFY_TOKEN`; POST valida `x-hub-signature-256` con `WA_APP_SECRET`).
- **Webhook del cotizador:** `https://cotizador.chicologistica.com/api/webhooks/mudanzas-chico` (entrante al cotizador, `CRM_WEBHOOK_URL` en el `.env` del CRM) y `https://cotizador.chicologistica.com/api/integrations/cotizador/events` (callback del cotizador hacia el CRM, `CRM_WEBHOOK_URL` en el `.env` del cotizador).
- **Renovación automática:** el timer de certbot (`certbot.timer`) renueva cada ~90 días. Los hooks en `/etc/letsencrypt/renewal-hooks/` detienen Nginx (`pre/stop-nginx`) antes de la validación standalone (requiere puerto 80 libre) y lo levantan después (`post/start-nginx`).
- **Firewall:** la nube de DigitalOcean requiere reglas inbound para TCP 80 y 443 (0.0.0.0/0, ::/0) además de SSH 22.

## 7. Gestión de Credenciales de APIs (Configuración del Chatbot)

Se añadió la capacidad de configurar credenciales de WhatsApp Business API y OpenAI directamente desde el panel CRM, eliminando la necesidad de editar variables de entorno manualmente.

### 7.1 Variables Configurables

- `WA_API_TOKEN` — Token de acceso permanente de WhatsApp Business API
- `WA_VERIFY_TOKEN` — Token de verificación del webhook de Meta
- `WA_PHONE_NUMBER_ID` — ID del número de teléfono de WhatsApp Business
- `WA_APP_SECRET` — Secret de la aplicación de Meta Developers
- `OPENAI_API_KEY` — Clave de API de OpenAI para el asistente de IA
- `ANTHROPIC_API_KEY` — Clave de API para modelos Claude (Anthropic)
- `GEMINI_API_KEY` — Clave de API para modelos Gemini (Google)
- `CRM_WEBHOOK_URL` — URL pública del sistema cotizador que recibe `quote.requested` / `quote.captured`
- `CRM_WEBHOOK_SECRET` — Secreto HMAC compartido (≥ 32 bytes) para firmar/validar webhooks del cotizador (ver §9)

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
1. Lee las variables configurables del `.env` actual.
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

## 8. Seguridad y Gestión de Usuarios

Se ha implementado un módulo completo de seguridad que cubre autenticación robusta, revocación de sesiones, gestión de usuarios y protección de endpoints críticos.

### 8.1 Modelo de Usuario Extendido

La entidad `User` en Prisma ahora incluye dos campos de seguridad:

- `isActive Boolean @default(true)` — Permite desactivar usuarios sin borrarlos (soft delete), conservando auditoría y relaciones.
- `tokenVersion Int @default(0)` — Contador incremental para revocación stateless de JWT.

### 8.2 Revocación de JWT con `tokenVersion`

- El token JWT firma el claim `tv` (tokenVersion) junto con `role` y `sub` (userId).
- El middleware `requireCrmUser` verifica en cada request:
  1. El usuario existe y está activo (`isActive=true`) → 403 "Account disabled" si no.
  2. El claim `tv` coincide con `user.tokenVersion` en BD → 401 "Token revoked" si no.
- Cualquier operación que deba invalidar sesiones existentes incrementa `tokenVersion`:
  - Cambio de contraseña propia (`POST /api/crm/auth/change-password`)
  - Restablecimiento de contraseña por admin (`POST /api/crm/auth/users/:id/reset-password`)
  - Desactivación de usuario (`PATCH /api/crm/auth/users/:id/status` con `isActive=false`)

Esto logra revocación inmediata sin blocklists ni almacenamiento de tokens revocados.

### 8.3 Endpoints de Autenticación y Usuarios

Todos bajo `/api/crm/auth` y protegidos por JWT (salvo `bootstrap` y `login`):

| Método | Endpoint | Roles | Descripción |
|--------|----------|-------|-------------|
| POST | `/auth/bootstrap` | público | Crea el primer ADMIN (una sola vez) |
| POST | `/auth/login` | público | Login → JWT 8h con `tv` |
| GET | `/auth/users` | ADMIN | Lista usuarios (sin hash de contraseña) |
| POST | `/auth/users` | ADMIN | Crea usuario (AGENT, MARKETING_DIRECTOR, ADMIN) |
| PATCH | `/auth/users/:id` | ADMIN | Edita email, name, role, availabilityStatus, maxActiveConversations |
| PATCH | `/auth/users/:id/status` | ADMIN | Activa/desactiva usuario (revoca sesiones al desactivar; devuelve el usuario actualizado) |
| DELETE | `/auth/users/:id` | ADMIN | Elimina usuario permanentemente (conversaciones asignadas quedan sin asignar) |
| POST | `/auth/users/:id/reset-password` | ADMIN | Resetea contraseña (modo: admin escribe nueva, o genera temporal de 16 chars base64url). Si el objetivo es el propio usuario, devuelve además un JWT nuevo para no cerrar la sesión actual |
| POST | `/auth/change-password` | cualquier autenticado | Cambio de contraseña propia (verifica actual, renueva JWT, revoca otras sesiones) |

**Guardas de seguridad:**
- No puedes cambiar tu propio rol ni desactivarte/eliminarte a ti mismo.
- No puedes desactivar, degradar ni eliminar al último `ADMIN` activo.
- El email debe ser único (409 si ya existe otro usuario con el mismo email; se normaliza a minúsculas).
- Login rechaza usuarios inactivos (403).
- Contraseñas: scrypt + salt 16 bytes, mínimo 12 caracteres (validado con Zod).

### 8.4 Protección de Configuración del Bot

Los endpoints `GET/PUT /api/bot/config` ahora requieren autenticación y rol:
- Middleware: `requireCrmUser` + `requireCrmRole('ADMIN', 'MARKETING_DIRECTOR')`
- Validación Zod estricta en PUT (`botConfigSchema`).
- Frontend: grupo "Configuración del Chatbot" oculto para rol `AGENT`.

### 8.5 Frontend: Paneles de Administración

Nuevas vistas en `frontend/src/` integradas en `App.tsx`:

- **UserManagement.tsx** (solo ADMIN, pestaña "Usuarios" en grupo "Administración"):
  - Tabla con nombre, email, rol, estado, disponibilidad.
  - Crear usuario (modal con validación).
  - Editar usuario (nombre, rol, disponibilidad, máx. conversaciones).
  - Activar/desactivar (confirma, revoca sesiones).
  - Restablecer contraseña (dos modos: "Escribir nueva" o "Generar temporal" — la temporal se muestra una sola vez con botón copiar).

- **AccountSettings.tsx** (todos los roles, pestaña "Mi Cuenta"):
  - Formulario cambio de contraseña propia (actual + nueva + confirmación).
  - Toggle mostrar/ocultar contraseñas.
  - Al éxito, renueva el token en `sessionStorage` (sesión actual continúa, otras revocadas).

- Sidebar actualizada:
  - **CRM** → Bandeja CRM.
  - **Configuración del Chatbot** (acordeón, solo ADMIN + MARKETING_DIRECTOR) → Mensajes, Personalidad, Respuestas Rápidas, Reglas y Límites, y Configuración de APIs (esta última solo ADMIN).
  - **Administración** (acordeón, solo ADMIN) → Usuarios.
  - **Mi Cuenta** (todos los roles) → Cambio de contraseña.
  - Header muestra nombre de usuario y botón "Salir".

### 8.6 Migración de Base de Datos

Ejecutada via `npx prisma migrate dev --name user_security`:
- Añade columnas `isActive` (default true) y `tokenVersion` (default 0) a tabla `User`.
- Usuarios existentes quedan activos con `tokenVersion=0`.
- **Nota:** Tokens JWT previos a la migración carecen de claim `tv` y son rechazados por el middleware → usuarios deben re-loguearse una vez tras el deploy.

---

## 9. Integración con el Cotizador Externo (Webhooks)

El cotizador es un **desarrollo aparte** (sistema completo con su propia UI, usuarios y BD). La integración con el backend es **event-driven por webhooks firmados**, no REST síncrono ni BD compartida. Detalle completo en `docs/integracion-cotizador.md`.

**Estado: IMPLEMENTADO (Septiembre 2026).**

### 9.1 Flujo saliente (backend → cotizador)

- `quote.requested` se emite cuando la IA detecta `intent: "QUOTE"` **o** cuando coincide la regla de respuesta rápida de captura (título/keywords con `cotiza|mudanza|traslad|captura`) en `conversationFlow.ts`.
- `quote.captured` se emite al completar la captura (`QUOTE_VOLUME` → `AGENT_HANDOFF`): el bot **persiste** origen/destino/volumen en `Client` (`quoteOrigin`, `quoteDestination`, `quoteVolume`), crea el `Quote` local (`status: PENDING`, con `conversationId`) y emite el evento con `volumeM3` redondeado a 2 decimales.
- Destino: `CRM_WEBHOOK_URL` (configurable en el panel **Configuración de APIs** o en `.env`).
- Cliente: `src/integrations/webhookClient.ts` — emisión **no bloqueante** (el chat nunca espera la respuesta HTTP), reintentos de fondo con backoff exponencial (5s → 25s → 125s → 625s, máx. 5 intentos) y auditoría de cada intento en la tabla `WebhookEvent`. Si URL/secret no están configurados, el evento se omite con un warning (no-op).

### 9.2 Entrante (callback cotizador → backend)

- `POST /api/integrations/cotizador/events` recibe `quote.status.updated` (registrado junto al webhook de Meta, **antes** del rate limiter global; protegido por HMAC en vez de rate-limit).
- Validación en orden: carga de credenciales (si no se pueden descifrar o `CRM_WEBHOOK_SECRET` no está configurado responde **503** reintentable, con log del error) → firma HMAC (`X-Mudanzas-Signature: t=<unix>,v1=<hex>`, ventana anti-replay de 5 min, `timingSafeEqual`) → envelope Zod → payload Zod → dedup por `event.id` (constraint único en `WebhookEvent`; si el procesamiento falla se libera el marcador para que el reintento del emisor pueda repetirlo).
- Mapeo a `Quote`: busca por `externalId` o `conversationId`, actualiza `externalId`, `status` y `price` (si viene). Si no existe `Quote` local, responde 200 con warning (sin crear registros inválidos).
- Notificación al cliente: en `ACCEPTED` (con precio formateado `es-CO`) o `REJECTED` el bot envía WhatsApp y registra el mensaje como outbound en la conversación. `PENDING` no notifica.
- Eventos de tipo desconocido se **acknowledgan con 200** (`ignored: true`) para evitar reintentos infinitos del emisor.

### 9.3 Seguridad y datos

- **Firma:** `v1 = HMAC_SHA256(secret, "v1:" + t + ":" + rawBody)`; mismo secreto en ambos sistemas (`CRM_WEBHOOK_SECRET`, ≥ 32 bytes, generado con `crypto.randomBytes(32).toString('hex')`).
- **Idempotencia:** `event.id` único en la tabla `WebhookEvent` (dirección `INBOUND`/`OUTBOUND`, payload, status `PENDING|DELIVERED|PROCESSED|IGNORED|FAILED`, intentos y último error).
- **Clave única del cliente:** `Client.phone` (`@unique`).
- **Migración:** `20260924051037_add_cotizador_integration` — añade `Quote.externalId`/`Quote.conversationId`, campos de captura en `Client` y la tabla `WebhookEvent`. El Dockerfile ejecuta `npx prisma migrate deploy` antes de arrancar.

---

## 10. Estructura de la Base de Datos

Para documentar el esquema real de la base de datos se dispone del script `scripts/dump-db-schema.mjs`, ejecutable con `npm run db:schema`. El script consulta `sqlite_master` mediante Prisma (tablas, índices y triggers, excluyendo objetos internos de SQLite y `_prisma_migrations`) y escribe el DDL completo en `docs/db-structure.sql`, un archivo versionable que refleja la estructura vigente sin datos.

*Nota para los Agentes IA: Este documento debe actualizarse cada vez que se cree un nuevo módulo, tabla en la base de datos o se cambie la lógica de negocio fundamental.*

---

## 11. Estados de Gestión Configurables y Mejoras de Asignación (Septiembre 2026)

### 11.1 Contexto y Objetivo

Se separan dos conceptos de estado que antes se mezclaban:
- **Estado de máquina** (técnico, no configurable): `NEW`, `BOT_ACTIVE`, `HUMAN_ACTIVE`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED`. Controla el flujo bot/agente y visibilidad técnica.
- **Estado de gestión** (negocio, configurable desde el front): `PENDIENTE_COTIZACION`, `EN_PROCESO`, `FINALIZADO`, etc. Define en qué fase comercial está la conversación y permite sacarla de la bandeja activa cuando se marca como final.

### 11.2 Modelo de Datos

**Nueva tabla `ConversationStatusConfig`:**
```prisma
model ConversationStatusConfig {
  id        String   @id @default(uuid())
  code      String   @unique   // slug: PENDIENTE_COTIZACION
  label     String              // "Pendiente de cotización"
  color     String   @default("#64748b")
  isFinal   Boolean  @default(false)  // true ⇒ sale de bandeja activa
  isActive  Boolean  @default(true)   // soft-delete
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Campo añadido en `Conversation`:**
```prisma
businessStatus String?   // FK a ConversationStatusConfig (code)
```

**Seed inicial (incluido en migración `add_business_status_config`):**
| code | label | color | isFinal | sortOrder |
|------|-------|-------|---------|-----------|
| PENDIENTE_COTIZACION | Pendiente de cotización | #f59e0b | false | 1 |
| EN_PROCESO | En proceso | #3b82f6 | false | 2 |
| FINALIZADO | Finalizado | #22c55e | true | 3 |

Las nuevas conversaciones arrancan con `businessStatus = 'PENDIENTE_COTIZACION'` (constante `DEFAULT_BUSINESS_STATUS`).

### 11.3 Endpoints de Configuración (`/api/crm/settings/statuses`)

| Método | Endpoint | Roles | Descripción |
|--------|----------|-------|-------------|
| GET | `/settings/statuses` | Cualquier CRM user | Lista estados activos ordenados por `sortOrder` |
| POST | `/settings/statuses` | ADMIN, MARKETING_DIRECTOR | Crea estado (label → slug único, color hex, isFinal, sortOrder) |
| PATCH | `/settings/statuses/:id` | ADMIN, MARKETING_DIRECTOR | Edita label, color, isFinal, sortOrder |
| DELETE | `/settings/statuses/:id` | ADMIN, MARKETING_DIRECTOR | Soft-delete (`isActive=false`) |

Validación Zod: `code` generado por slugify del label (mayúsculas, underscores, máx 30 chars), `color` regex hex, `isFinal` boolean, `sortOrder` int.

### 11.4 Integración en Conversaciones

- `PATCH /conversations/:id/status` acepta ahora `businessStatus` (opcional, validado contra configs activas).
- `GET /conversations`:
  - Por defecto **excluye** conversaciones cuyo `businessStatus` tenga `isFinal=true`.
  - Nuevo query param `includeFinal=true` para verlas.
  - Nuevo query param `businessStatus=<code>` para filtrar por estado de gestión.
- Frontend: badge coloreado con el `color` configurado, dropdown para cambiar estado, filtros por estado y toggle "Ver finalizadas".

### 11.5 Mejoras en Asignación de Conversaciones

**Bug corregido:** `getAssignmentTarget()` en `conversationService.ts` ahora filtra `isActive: true` en la búsqueda de agentes. Antes, usuarios desactivados seguían recibiendo asignaciones.

**Fallback a persona concreta:** Fuera de horario o sin agentes disponibles, se busca la primera `MARKETING_DIRECTOR` activa (`isActive=true`, ordenada por `createdAt`). Se asigna a **esa persona concreta** (userId + role: MARKETING_DIRECTOR) en lugar de dejar la conversación en una cola genérica por rol. Solo si no existe ninguna directora activa se usa la cola por rol como último recurso.

**Guards actualizados:**
- `manuallyAssignConversation`: valida que el target tenga `isActive=true`.
- `takeConversation`: un AGENT no puede tomar una conversación asignada a la directora (guard por `assignedRole === MARKETING_ROLE`).
- `listConversations`: AGENT ve **solo sus** conversaciones asignadas (ya no ve la cola marketing). ADMIN y MARKETING_DIRECTOR ven todas.

### 11.6 Cambio de Etiqueta: AGENT → "Comercial"

Internamente el rol sigue siendo `AGENT` (string en BD, middlewares, middlewares de autorización). En la UI:
- `UserManagement.tsx`: etiqueta "Comercial" en tabla, modal creación y modal edición.
- `CrmInbox.tsx`: badge de asignado muestra "Comercial" (ya usaba nombre, rol no se mostraba directamente).
- `App.tsx`: nueva sección **Configuración CRM** en sidebar (visible para ADMIN + MARKETING_DIRECTOR) con pestaña **Estados de Gestión** (`StatusSettings.tsx`).

### 11.7 Frontend: Nuevos Componentes

- **`StatusSettings.tsx`**: CRUD completo de estados (label, color picker, checkbox "es final", orden). Lista con swatch de color, badge "Final", toggle activo/inactivo.
- **`CrmInbox.tsx`**: 
  - Filtros en cabecera: checkbox "Ver finalizadas", select por estado de gestión, botón limpiar.
  - Lista: badge coloreado de estado de gestión.
  - Detalle: badge de estado de gestión + dropdown "Cambiar estado" con opciones activas (badge "Final" en las finales).
- **`UserManagement.tsx`**: rol AGENT etiquetado "Comercial" en tabla, select creación y select edición.

### 11.8 Migración y Tests

- Migración `20260917174859_add_business_status_config` con seed SQL de los 3 estados iniciales (incluye `updatedAt = CURRENT_TIMESTAMP` para compatibilidad SQLite).
- Tests unitarios existentes pasan (39/39). Build TypeScript OK (`npm run build`).

---

## 12. Leads (Almacenamiento de Leads)

### 12.1 Descripción

Pestaña "Leads" que muestra una vista consolidada de clientes potenciales, agrupando conversaciones activas y cotizaciones por cliente. Ubicada en el sidebar CRM, visible para todos los roles autenticados.

### 12.2 Backend: Endpoint `GET /api/crm/leads`

**Parámetros query:**
- `page` (int, default 1)
- `pageSize` (int, default 20, max 100)
- `businessStatus` (string opcional): filtra por estado de gestión
- `hasQuote` (boolean opcional): filtra clientes con/sin cotización
- `search` (string opcional): busca por nombre o teléfono

**Permisos:**
- ADMIN y MARKETING_DIRECTOR: ven todos los leads
- AGENT: solo leads con al menos una conversación activa asignada a él (el filtro se aplica tanto al listado como al total; sin él, un AGENT podía enumerar nombre y teléfono de todos los clientes)

**Respuesta:**
```json
{
  "data": [
    {
      "client": { "id", "name", "phone", "createdAt" },
      "conversation": { "id", "status", "businessStatus", "priority", "lastMessageAt", "assignedUser": { "id", "name", "role" } },
      "quote": { "id", "origin", "destination", "volume", "price", "status", "updatedAt" },
      "hasQuote": true
    }
  ],
  "pagination": { "total", "page", "pageSize", "totalPages" }
}
```

**Archivos:**
- `src/crm/services/leadService.ts`: lógica de agrupación por cliente (última conversación activa + última cotización)
- `src/crm/controllers/leadController.ts`: handler con validación zod
- `src/crm/routes.ts`: `GET /api/crm/leads` (protegido por `requireCrmUser` global)

### 12.3 Frontend: Pestaña `Leads.tsx`

**Componente `Leads.tsx`:**
- Tabla con columnas: Cliente (nombre/teléfono), Estado de gestión (badge con color), Cotización (badge Sí/No + estado), Asignado (nombre/rol), Última actividad (tiempo relativo), Acciones (ver detalle)
- Filtros: búsqueda por nombre/teléfono, select de businessStatus, botones "Todos/Con cotización/Sin cotización"
- Paginación con botones anterior/siguiente
- Modal de detalle: información completa del cliente, conversación y cotización

**Integración en `App.tsx`:**
- Nuevo tab `'leads'` en tipo `activeTab`
- Botón "Leads" en grupo CRM del sidebar (icono `Contact`)
- Header: título "Leads", subtítulo "Vista consolidada de clientes potenciales"
- Render: `<Leads token={token} />` cuando `activeTab === 'leads'`

### 12.4 Estado de Cotizaciones

La captura del bot ahora **persiste** en `Quote` al completarse el flujo (origen + destino + volumen, ver §9), con `conversationId` y `externalId` para correlación con el cotizador. Los clientes cuyo flujo de captura aún no se ha completado mostrarán "Sin cotización" en la pestaña Leads hasta que el bot cierre esa captura.

### 12.5 Tests

Tests unitarios en `src/crm/services/__tests__/leadService.test.ts` (9 tests):
- Retorna leads paginados para admin
- Filtra por businessStatus
- Filtra por hasQuote=true y hasQuote=false
- Busca por nombre o teléfono
- Restringe agente a conversaciones asignadas
- Restringe agente a clientes con al menos una conversación asignada (fuga de datos corregida)
- Retorna cliente sin cotización
- Retorna cliente sin conversación activa

Total de tests: 101/101 pasan (incluye suites de integración del cotizador: firma, eventos, callback —con casos 401/400/503/200/dedup—, webhook client, conversationFlow y credentials, que además limpia la DB de dev al terminar el suite). Verificado además con E2E local en Docker contra el cotizador real (requested→captured→PATCH→callback→Quote ACCEPTED).

---

## 13. Endurecimiento de Seguridad (Septiembre 2026)

### 13.1 CORS por Allowlist

`app.use(cors())` abierto fue reemplazado por una política explícita en `src/index.ts`:

- Peticiones **same-origin** (Origin ausente o con el mismo host de la petición) siempre permitidas — el panel se sirve desde el mismo dominio.
- Peticiones **cross-origin** solo permitidas si el origen está en `CORS_ORIGINS` (env, lista separada por comas). Default para desarrollo: `http://localhost:5173,http://127.0.0.1:5173` (Vite dev).
- Cualquier otro origen no recibe cabecera `Access-Control-Allow-Origin`.

### 13.2 Rate Limiting por Capas

- **Global:** 100 req / 15 min por IP para toda la app.
- **Autenticación:** limiter estricto adicional de 10 req / 15 min por IP en `/api/crm/auth/login` y `/api/crm/auth/bootstrap` (anti fuerza bruta).
- **Webhooks exentos:** `GET/POST /api/bot/webhook` y `POST /api/integrations/cotizador/events` se registran **antes** del limiter global para no estrangular tráfico legítimo de Meta ni del cotizador; ambos POST quedan protegidos por validación HMAC (`x-hub-signature-256` y `X-Mudanzas-Signature` respectivamente).

### 13.3 Entorno Local vs VPS (nginx)

El `nginx.conf` base es para producción (SSL con certificados Let's Encrypt de `cotizador.chicologistica.com`, puerto 80 redirige a HTTPS). Para correr el stack localmente sin certificados:

- `deploy/nginx.local.conf`: puerto 80 sin SSL, proxy a `app:3000`, oculta cabeceras COOP/COEP/Origin-Agent-Cluster.
- `deploy/docker-compose.override.yml`: lo carga Compose automáticamente en local (expone además `3000:3000` del backend). En el VPS se ejecuta `docker compose -f docker-compose.yml up -d` (sin override) para usar la config con SSL.
- **Cotizador co-desplegado:** el stack del cotizador (repo aparte) se une a la red externa `deploy_mudanzas_net` con `container_name: cotizador-api` y `cotizador-web`, sin publicar 80/443. Su API queda en el puerto interno 3001 y su web en el 80 interno (vía `VITE_BASE=/cotizador/`). El servicio `crm-mock` del cotizador es solo de desarrollo local y no se despliega en el VPS. Orden de despliegue: subir el cotizador primero, luego recargar Nginx (`nginx -s reload`); gracias al resolver por petición, el orden no es crítico.
- **Script de despliegue:** `deploy/deploy.sh` automatiza el VPS: `git pull --ff-only`, compila y recrea el backend (`up -d --build app`, el contenedor ejecuta `prisma migrate deploy` al arrancar), recarga Nginx (`nginx -t` + `nginx -s reload`), verifica `https://127.0.0.1/health` y opcionalmente despliega el cotizador con `./deploy.sh --cotizador <dir>`. Requiere `.env` en la raíz del repo en el servidor.

---

*Última actualización: Septiembre 2026*
