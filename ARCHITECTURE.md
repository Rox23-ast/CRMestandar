# Arquitectura de G Consultores CRM

Este documento describe la arquitectura, estructura y decisiones de diseño del CRM estándar de **G Consultores**. Es un **documento vivo** que debe ser actualizado continuamente a medida que el proyecto evolucione y se implementen nuevas características.

## 1. Visión General

El proyecto es una plantilla de CRM reutilizable por cliente, actualmente desplegada para "Mudanzas Chico", dividida en:
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
- **Asignación inicial:** toda conversación nueva entra a la cola del rol `MARKETING_DIRECTOR` (`assignedRole`, sin `assignedUserId`) con `reason: INITIAL_MARKETING_QUEUE`; la directora de marketing distribuye a los comerciales desde la bandeja con "Asignar" (el round-robin automático quedó deshabilitado).
- **Control bot/agente:** La conversación inicia en `BOT_ACTIVE`. El agente puede tomarla (`HUMAN_ACTIVE`) y reactivar el bot explícitamente. Al **activar el bot** desde el toggle (transición apagado → encendido en `updateBotConfig`), todas las conversaciones `HUMAN_ACTIVE`/`NEW` vuelven a `BOT_ACTIVE` de una vez. Una conversación resuelta se reabre cuando llega un nuevo mensaje.
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
- **Abstracción de IA (multi-proveedor):** `aiService.ts` soporta **OpenAI** (`gpt-4o-mini`, SDK oficial, `response_format: json_object`), **Anthropic** (`claude-3-5-haiku-latest`, REST) y **Google Gemini** (`gemini-2.0-flash`, REST con `responseMimeType: application/json`). Se usa el **primer proveedor configurado** en orden OpenAI → Anthropic → Gemini; si un proveedor falla o devuelve JSON inválido, se pasa automáticamente al siguiente (cadena de fallback). Si ninguna clave está configurada, se usa el fallback `[MOCK]` NLP por palabras clave. El JSON se tolera con fences de markdown.
- **Respuestas Rápidas deterministas:** Las reglas configuradas en *Respuestas Rápidas* (`customRules`) se evalúan por coincidencia de palabras clave (case-insensitive, separadas por coma) antes de llamar a la IA, en `matchQuickResponse()` de `conversationFlow.ts`. Si alguna regla coincide, el bot responde exactamente el texto configurado (con reemplazo de `[Nombre]` si el cliente tiene nombre registrado) sin depender de la disponibilidad o validez de las APIs de IA. Solo los mensajes sin regla coincidente pasan al LLM.

- **Seguridad en Capa HTTP:** Se utiliza `helmet` para proteger cabeceras (con CSP explícita que permite `blob:` en `img-src`/`media-src` para renderizar los medios de WhatsApp descargados con token) y `express-rate-limit` para evitar abusos en los endpoints.
- **Validación de Webhooks (Meta/WhatsApp):** El GET valida el token de suscripción y el POST valida `x-hub-signature-256` con `WA_APP_SECRET`. El cuerpo original se conserva solo para verificar la firma. Se responde instantáneamente con status 200 después de validar la autenticidad, antes de procesar el mensaje para evitar reintentos de Meta.
- **Interfaz Gráfica (Frontend):** Se eligió React con Tailwind CSS para mapear de forma exacta la identidad visual.
- **Validación de Datos:** Todos los *inputs* deben ser validados utilizando `zod` antes de llegar a los servicios.
- **Autenticación:** Las rutas privadas (CRM/Cotizador administrativo) se protegen mediante JWT (JSON Web Tokens).
- **Tipado Estricto:** TypeScript se utiliza en modo estricto para evitar errores en tiempo de ejecución.
- **Testing:** Se utiliza `jest` (y `ts-jest`) para pruebas unitarias. Cada nueva funcionalidad en el `core` y módulos críticos debe estar cubierta por tests.
- **Panel CRM inicial:** `frontend/src/CrmInbox.tsx` incluye login JWT, bandeja, historial, toma de control, reactivación del bot, respuesta por WhatsApp y consumo autenticado de SSE.
- **Adjuntos y notas de voz:** la bandeja permite adjuntar archivos (imagen/documento/video/audio) y grabar notas de voz (MediaRecorder). Formatos aceptados según la Media API de Meta: imágenes JPG/PNG, audios AAC/MP4/MP3/AMR/OGG, videos MP4/3GP y documentos con cualquier MIME (PDF, Word, Excel, CSV, TXT, PPT, ZIP…). El input declara `accept` con las extensiones comunes y, si el navegador no reporta MIME, el frontend lo infiere por extensión; formatos no soportados se rechazan con mensaje claro (frontend y 415 en backend). `POST /api/crm/conversations/:id/attachments` recibe el binario (`express.raw`, 60 MB) con validación previa de tamaño según tipo (imágenes ≤ 5 MB, video/audio ≤ 16 MB, documentos ≤ 60 MB), lo sube a la Media API de Meta (`uploadWhatsAppMedia`) y lo envía por `type` con caption opcional (`sendWhatsAppMedia`); el mensaje outbound queda registrado con su `mediaId`. Si el archivo excede el límite por tipo se responde 413 y si el formato no es válido, 415 con el detalle. Si Meta rechaza la subida (p. ej. audio/webm de Chrome), se responde 502 con el detalle.
- **Visualización de media entrante:** `GET /api/crm/media/:id` actúa como proxy autenticado para cualquier rol CRM: resuelve el media id de WhatsApp a su URL temporal (`getWhatsAppMedia`) y descarga el binario con el token (`downloadWhatsAppMedia`); un agente solo puede descargar media de conversaciones a las que tiene acceso (asignadas o cola de marketing), ADMIN/MARKETING_DIRECTOR de cualquiera. La bandeja renderiza imágenes, video y audio con botón de descarga para cada tipo y ofrece descarga para documentos (blob con `createObjectURL`; el token nunca se expone al navegador). Si el `mediaId` guardado es una URL pública (p. ej. el PDF del estimado que el cotizador envía vía `sendWhatsAppDocument`, almacenado en `Quote.documentUrl` y en el `Message` como `mediaId`), el inbox la enlaza directamente ("Ver documento") sin pasar por el proxy.
- **Búsqueda y chat saliente:** el listado acepta `search` (coincidencia por teléfono o nombre, vía `client.OR`). `POST /api/crm/conversations/start` inicia un chat con un número nuevo: upsert del `Client`, crea/reutiliza la `Conversation` como `HUMAN_ACTIVE` asignada al agente y envía el primer mensaje. Si el número **nunca ha escrito**, WhatsApp exige plantilla aprobada: se usa `BotConfig.outreachTemplateName`/`outreachTemplateLanguage`/`outreachTemplateVariables` (el mensaje del agente va a la variable 1 y el resto vacías) vía `sendWhatsAppTemplate`; si falla, cae a texto libre; si Meta rechaza, devuelve 502 con el detalle.
- **Plantillas de WhatsApp:** `GET /api/bot/templates` lista las plantillas de la cuenta vía Graph API (`/{{WABA_ID}}/message_templates`, requiere `WA_WABA_ID` en credenciales), disponible para todos los roles autenticados. En "Configuración del Chatbot → Mensajes y Textos", el botón "Cargar plantillas" las muestra (nombre, idioma, categoría, estado y nº de variables) y al elegir una se guardan los tres campos en `BotConfig` para el primer contacto. Además, en el composer de la bandeja hay un botón de plantillas: el agente elige una, rellena sus variables y `POST /api/crm/conversations/:id/template` la envía y la registra en el historial.
- **Respuestas rápidas:** modelo `QuickReply` (`label` único + `text`) con CRUD en `/api/crm/quick-replies` (lectura para todos, escritura ADMIN/MARKETING_DIRECTOR). En el composer, al escribir `/` aparece el menú filtrado por label y al seleccionar se inserta el texto (con `[Nombre]` reemplazado por el nombre del cliente cuando está registrado); la gestión (agregar/editar/eliminar) vive en el panel de la bandeja.
- **Edición y eliminación de mensajes enviados:** sobre cada burbuja OUTBOUND (hover) aparecen acciones de editar (solo texto), eliminar (con confirmación) y responder. `PATCH /api/crm/messages/:id` edita el `body` y `DELETE /api/crm/messages/:id` borra el registro, ambos solo para `direction=OUTBOUND` y con el permiso de la conversación (asignado o ADMIN/MARKETING_DIRECTOR). WhatsApp no permite editar/retirar mensajes ya entregados: los cambios solo se reflejan en el historial del CRM.
- **Datos del cliente:** Meta incluye en cada webhook `value.contacts[].profile.name` (nombre de pantalla del usuario) y `wa_id`; el webhook lo mapea por `from` y lo pasa como `contactName` a `recordInboundMessage`, que asigna `Client.name` solo si está vacío (el teléfono siempre se guarda en `Client.phone`, clave única). En la barra superior del chat, "Agregar cliente" abre un modal (nombre editable, teléfono de solo lectura) que guarda vía `PATCH /api/crm/conversations/:id/client` con zod.
- **No leídas primero:** el estado "no leído" de una conversación persiste en `Notification.readAt` (por usuario o rol). `listConversations` calcula los ids con notificaciones sin leer, los coloca al inicio de la **página 1** con el flag `unread: true` y devuelve `unreadCount` para la insignia; en páginas posteriores las no leídas no se repiten y el `skip` descuenta las ya mostradas. Abrir la conversación (`getConversation`) marca sus notificaciones como leídas, por lo que el orden y la insignia sobreviven recargas de página.
- **Paginación de la bandeja:** la lista carga 500 conversaciones por página (el backend admite hasta 500) y muestra una barra fija "Página X de Y" con botones anterior/siguiente al pie del listado. El polling (30 s), el SSE y las acciones sobre conversaciones refrescan la página en curso; cambiar cualquier filtro vuelve a la página 1. Así ADMIN y MARKETING_DIRECTOR (sin filtro de asignación) navegan todas las conversaciones, no solo las primeras 500.
- **Filtros de la bandeja:** búsqueda, estado de gestión, origen, "Ver finalizadas", "Solo no leídas" (todos los roles; backend `unreadOnly` que restringe a conversaciones con notificaciones sin leer) y "Asesor" (solo ADMIN/MARKETING_DIRECTOR, `assignedUserId` o la opción "Sin asignar" vía `unassignedOnly` → `assignedUserId: null`; el listado de asesores viene de `/api/crm/assignable-users`).

## 5.1 Frontend estándar por cliente (Fase 1)

El panel dejó de ser una pantalla monolítica atada a "Mudanzas Chico" y ahora parte de una base reutilizable para instalaciones independientes. La Fase 1 conserva la API y los flujos existentes, pero separa configuración, identidad visual, sesión, navegación y layout.

### Configuración de instalación

- `frontend/src/config/installation.ts` concentra nombre del cliente, marca del proveedor, logos, colores, idioma, zona horaria, moneda, módulos habilitados, modo del bot y URL del cotizador.
- Los recursos de marca viven en `frontend/public/brand/`: logo a color, símbolo blanco para fondos oscuros y favicon de G Consultores.
- La marca del proveedor es **G Consultores**. La instalación actual mantiene `clientName: "Mudanzas Chico"` y puede cambiarse sin tocar componentes.
- Los módulos se controlan con `modules`: `inbox`, `leads`, `quotes`, `dashboard`, `users`, `bot` y `settings`. En esta fase `quotes` y `dashboard` permanecen deshabilitados hasta implementar sus pantallas y endpoints.

### Tema y componentes base

- `frontend/src/config/theme.ts` aplica la configuración al arrancar: variables CSS, `lang`, título del documento, favicon y `theme-color`.
- `frontend/src/index.css` define los tokens por defecto y las clases compartidas `ui-card`, `ui-btn-*`, `ui-input`, `ui-label`, `ui-eyebrow` y `ui-badge`.
- `frontend/tailwind.config.js` consume las variables CSS, por lo que los colores de la instalación pueden cambiarse sin recompilar estilos. Los alias heredados (`primary`, `secondary`, `neutral`, `accent-gold`) se mantienen para no romper las pantallas existentes.
- La tipografía es **Mukta**; los alias `font-cormorant` y `font-raleway` apuntan a Mukta para que las vistas antiguas adopten la identidad sin una migración masiva.
- Componentes reutilizables: `frontend/src/components/ui/` (Button, Card, Input, Badge) y `frontend/src/components/brand/BrandLogo.tsx`.

### Sesión, acceso y navegación

- `frontend/src/features/auth/useSession.ts` centraliza token, nombre, rol, login, logout, renovación de token y detección de sesión expirada.
- La expiración se controla por el `exp` del JWT y por un interceptor global de Axios que cierra la sesión ante `401`, excepto en los endpoints de autenticación (`/api/crm/auth/*`).
- `frontend/src/features/auth/LoginPage.tsx` implementa el acceso con identidad de G Consultores, formulario accesible y mensaje de sesión expirada.
- `frontend/src/app/navigation.tsx` define las vistas, los grupos de navegación y los permisos por rol. Los ítems se ocultan según los módulos habilitados y el rol (`ADMIN`, `MARKETING_DIRECTOR`, `AGENT`).
- `frontend/src/app/AppShell.tsx` contiene el sidebar azul, la cabecera, el menú móvil, el usuario activo y el cierre de sesión. `App.tsx` queda como composición de vistas y estado del bot.
- La bandeja (`CrmInbox.tsx`) conserva SSE, adjuntos, notas de voz, filtros y acciones, pero adopta superficies, bordes y estados seleccionados del nuevo tema.

### Validación de la fase

- Frontend: `npm run build` y `npm run lint`.
- Backend sin cambios funcionales en esta fase; se mantiene `npm run build` y `npm run test` para las siguientes entregas.
- Criterio de aceptación: cambiar nombre, logos o colores en `installation.ts` actualiza la instalación; login, navegación por rol, sesión expirada y bandeja siguen operativos en escritorio y móvil.

## 6. Despliegue del Panel Web

El despliegue Docker usa una etapa independiente para instalar las dependencias del frontend y ejecutar `npm run build` dentro de `frontend/`. La imagen de producción copia `frontend/dist` a `/app/public`, y Express sirve esos archivos estáticos desde `src/index.ts` mediante `express.static` bajo la ruta `/crm`. La raíz del servidor (`http://ip:puerto/`) redirige con `301` a `/crm/`, que actúa como ruta principal del panel, y `/crm` sin barra final se canonicaliza a `/crm/`. De esta forma, el panel React y la API se entregan desde el mismo contenedor y detrás del proxy Nginx. Las imágenes de backend usan Node.js 22, compatible con `openai`, e instalan OpenSSL para que Prisma seleccione y ejecute correctamente su engine nativo sobre Alpine.

### 6.1 Dominio, HTTPS y Webhook de Meta

- **Dominio:** `cotizador.chicologistica.com` (registro DNS `A` → IP del droplet). El panel CRM y el cotizador **comparten este dominio**: el CRM queda en `https://cotizador.chicologistica.com/crm/` (la raíz redirige `301` a `/crm/`) y el cotizador en `https://cotizador.chicologistica.com/cotizador/`.
- **TLS:** certificado **Let's Encrypt** emitido con `certbot certonly --standalone`; los archivos viven en `/etc/letsencrypt/live/cotizador.chicologistica.com/` y se montan de solo lectura en el contenedor Nginx (`/etc/letsencrypt:/etc/letsencrypt:ro`).
- **Nginx:** `server_name cotizador.chicologistica.com`; el puerto 80 redirige `301` a HTTPS y el 443 sirve con el certificado. Meta exige HTTPS con certificado de CA confiable (los autofirmados se rechazan).
- **Ruteo por rutas (un solo Nginx):** `/crm` → `app:3000` (panel + assets); `/api/crm/`, `/api/bot/`, `/api/integrations/`, `/health` → `app:3000`; `/cotizador/` → contenedor `cotizador-web`; `/api/webhooks/`, `/api/quotes` y `/files/` (PDFs públicos de estimados que Meta descarga para WhatsApp) → contenedor `cotizador-api:3001`. Los upstreams del cotizador usan `resolver 127.0.0.11` + variable, así Nginx arranca aunque el stack del cotizador esté caído (responde 502 solo en sus rutas). Ambos stacks comparten la red `deploy_mudanzas_net`.
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
- `processMessageWithAI`: usa `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` y `GEMINI_API_KEY` de la DB; elige el primer proveedor configurado y hace fallback automático al siguiente si falla. Si ninguna está configurada, usa el fallback Mock NLP.

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

- `POST /api/integrations/cotizador/events` recibe `quote.status.updated`, `quote.created` y `quote.estimated` (registrado junto al webhook de Meta, **antes** del rate limiter global; protegido por HMAC en vez de rate-limit).
- Validación en orden: carga de credenciales (si no se pueden descifrar o `CRM_WEBHOOK_SECRET` no está configurado responde **503** reintentable, con log del error) → firma HMAC (`X-Mudanzas-Signature: t=<unix>,v1=<hex>`, ventana anti-replay de 5 min, `timingSafeEqual`) → envelope Zod → payload Zod → dedup por `event.id` (constraint único en `WebhookEvent`; si el procesamiento falla se libera el marcador para que el reintento del emisor pueda repetirlo).
- **`quote.created` (leads web):** upsert de `Client` por `phone` y creación idempotente de `Quote` por `externalId` con `source: 'WEB'` (origen/destino/volumen/precio opcionales). Sincroniza al CRM las cotizaciones creadas en la web del cotizador, sin conversación.
- **`quote.status.updated`:** matching en 3 pasos — 1) por `externalId`, 2) por `conversationId`, 3) si no existe `Quote` local y el evento trae `client`, crea `Client` + `Quote` "tardía" (`source: 'WEB'`, o `'BOT'` si trae `conversationId`). Si no existe y no hay `client`, responde 200 con warning (sin crear registros inválidos).
- **Notificación:** con `conversationId` → WhatsApp normal en `ACCEPTED`/`REJECTED` (precio formateado `es-CO`), `PENDING` no notifica. Sin `conversationId` (leads web) → si el cliente tiene conversación activa con `lastMessageAt` ≤ 24h se le envía WhatsApp; si no, se crean notificaciones internas (`Notification` rol `ADMIN` y `MARKETING_DIRECTOR`, tipo `QUOTE_WEB_STATUS`) para seguimiento manual.
- **`quote.estimated` (PDF):** guarda `Quote.documentUrl` (y `price` si viene) y envía el documento por WhatsApp (`sendWhatsAppDocument`, `type: document`, caption con precio) cuando hay conversación o conversación reciente ≤ 24h del cliente; registra el mensaje outbound como `DOCUMENT`. Si no hay canal o Meta rechaza (ventana de 24h), crea notificaciones internas `QUOTE_PDF_PENDING` con la URL del PDF. El PDF debe ser una URL pública descargable por Meta (GET plano) terminada en `.pdf`.
- Eventos de tipo desconocido se **acknowledgan con 200** (`ignored: true`) para evitar reintentos infinitos del emisor.

### 9.3 Seguridad y datos

- **Firma:** `v1 = HMAC_SHA256(secret, "v1:" + t + ":" + rawBody)`; mismo secreto en ambos sistemas (`CRM_WEBHOOK_SECRET`, ≥ 32 bytes, generado con `crypto.randomBytes(32).toString('hex')`).
- **Idempotencia:** `event.id` único en la tabla `WebhookEvent` (dirección `INBOUND`/`OUTBOUND`, payload, status `PENDING|DELIVERED|PROCESSED|IGNORED|FAILED`, intentos y último error).
- **Clave única del cliente:** `Client.phone` (`@unique`).
- **Migraciones:** `20260924051037_add_cotizador_integration` — añade `Quote.externalId`/`Quote.conversationId`, campos de captura en `Client` y la tabla `WebhookEvent`. `20260927214517_add_quote_source` — añade `Quote.source` (`BOT` | `WEB`). `20260928013116_add_quote_document_url` — añade `Quote.documentUrl` (URL pública del PDF del estimado). El Dockerfile ejecuta `npx prisma migrate deploy` antes de arrancar.

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

## 12. Leads (Hoja de Cálculo de Conversaciones)

### 12.1 Descripción

Pestaña "Leads" que muestra **todas las conversaciones** como hoja de cálculo (una fila por conversación) con nombre, teléfono, estados, fecha del último mensaje y comercial asignado. Incluye filtros combinables y exportación CSV. Ubicada en el sidebar CRM, visible para todos los roles autenticados.

### 12.2 Backend: Endpoints `GET /api/crm/leads` y `GET /api/crm/leads/export`

**Parámetros query (compartidos por ambos):**
- `page` (int, default 1) y `pageSize` (int, default 50, max 500) — solo en `/leads`
- `businessStatus` (string opcional): filtra por estado de gestión
- `conversationStatus` (string opcional): filtra por estado de conversación (NEW, BOT_ACTIVE, …)
- `priority` (enum URGENT|HIGH|NORMAL|LOW opcional)
- `assignedUserId` (uuid opcional): filtra por comercial asignado
- `source` (enum ADS|ORGANIC opcional; ORGANIC matchea `null`)
- `search` (string opcional): busca por nombre o teléfono del cliente
- `dateFrom`/`dateTo` (YYYY-MM-DD opcionales): rango sobre `lastMessageAt`
- `includeFinal` (boolean opcional): incluye conversaciones con estado de gestión final (por defecto se excluyen los `isFinal` activos de `ConversationStatusConfig`)

**Permisos:**
- ADMIN y MARKETING_DIRECTOR: ven todas las conversaciones
- AGENT: solo conversaciones asignadas a él (el filtro se fuerza por servidor tanto en listado como en total y exportación)

**Exportación:** `/leads/export` responde `text/csv` (separador `;`, BOM UTF-8 para Excel, hasta 10.000 filas) con columnas: Fecha último mensaje, Nombre, Teléfono, Estado, Gestión, Prioridad, Origen, Comercial. Las celdas se escapan (comillas dobles, saltos, `;`). Además, `GET /api/crm/messages/export` (solo ADMIN, hasta 20.000 mensajes) exporta el historial completo de `Message` con fecha, cliente, teléfono, dirección, tipo, texto y estado de entrega; el botón "Exportar mensajes" solo aparece para ADMIN.

**Archivos:**
- `src/crm/services/leadService.ts`: consulta centrada en `Conversation` (`buildConversationWhere` + `toLeadRow`) y builder CSV (`exportLeadsCsv`)
- `src/crm/controllers/leadController.ts`: handlers con validación zod (`listLeads`, `exportLeads`)
- `src/crm/routes.ts`: `GET /api/crm/leads` y `GET /api/crm/leads/export` (protegidos por `requireCrmUser` global)

### 12.3 Frontend: Pestaña `Leads.tsx`

**Componente `Leads.tsx`:**
- Tabla con columnas: Último mensaje (fecha/hora completa), Cliente (nombre/teléfono), Estado (conversación), Gestión (badge con color dinámico de `ConversationStatusConfig`), Prioridad, Origen (Pauta/Orgánico), Comercial (nombre/rol)
- Botón "Sincronizar" que recarga los datos al instante y auto-refresco ligero cada 30 s (las asignaciones hechas desde la bandeja se reflejan sin salir de la pestaña)
- Filtros: búsqueda con debounce, estados de gestión (dinámicos), estado de conversación, prioridad, comercial (solo ADMIN/MARKETING_DIRECTOR), origen, rango de fechas (último mensaje), "Incluir finalizadas" y botón "Limpiar filtros" con contador de filtros activos
- Botón "Exportar CSV" que descarga el CSV del backend con los mismos filtros (axios blob + `Content-Disposition`)
- Paginación con botones anterior/siguiente

**Integración en `App.tsx`:**
- Render: `<Leads token={token} userRole={crmUserRole} />` cuando `activeTab === 'leads'`

### 12.4 Tests

Tests unitarios en `src/crm/services/__tests__/leadService.test.ts`:
- Retorna filas de conversación con cliente y comercial para admin
- Excluye estados finales por defecto e incluye con `includeFinal`
- Filtra por businessStatus, conversationStatus, priority, source y rango de fechas
- `source=ORGANIC` matchea `null`
- Busca por nombre o teléfono del cliente
- Restringe agentes a sus conversaciones asignadas
- Ordena por `lastMessageAt desc`
- CSV: encabezados y filas con `;` y escape de comillas/punto y coma

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
- **Cotizador co-desplegado:** el stack del cotizador (repo aparte) se une a la red externa `deploy_mudanzas_net` con `container_name: cotizador-api` y `cotizador-web`, sin publicar 80/443. El nombre de la red está fijado explícitamente con `name: deploy_mudanzas_net` en el compose del CRM para que no dependa del nombre del proyecto. Su API queda en el puerto interno 3001 y su web en el 80 interno (vía `VITE_BASE=/cotizador/`). El servicio `crm-mock` del cotizador es solo de desarrollo local y no se despliega en el VPS. Orden de despliegue: subir el cotizador primero, luego recargar Nginx (`nginx -s reload`); gracias al resolver por petición, el orden no es crítico.
- **Script de despliegue:** `deploy/deploy.sh` automatiza el VPS: `git pull --ff-only`, ajusta la propiedad del volumen SQLite (`deploy_sqlite_data` → uid/gid 1000) porque el contenedor corre como usuario no-root, compila y recrea el backend (`up -d --build app`, el contenedor ejecuta `prisma migrate deploy` al arrancar), recarga Nginx (`nginx -t` + `nginx -s reload`), verifica `https://127.0.0.1/health` y opcionalmente despliega el cotizador con `./deploy.sh --cotizador <dir>`. Requiere `.env` en la raíz del repo en el servidor.

### 13.4 Política de parches y blindaje (Octubre 2026)

Respuesta a las alertas de octubre de 2026 (PHP "php2shell" y Node.js):

- **Runtime fijado:** las tres etapas del `deploy/Dockerfile` usan `node:22.23.4-alpine` (parche del 21-oct-2026: CVE-2026-111497 y el resto de la línea 22). Se eliminó `node:20-alpine` del frontend-builder porque Node 20 llegó a EOL en abril de 2026 y no recibe parches. La imagen de Nginx está fijada en `nginx:1.30.6-alpine` (rama estable parcheada); actualizarla deliberadamente ante cada release de seguridad.
- **Imagen mínima y no-root:** la etapa `production` instala solo dependencias de producción (`npm ci --omit=dev`; `prisma` pasó a `dependencies` porque el entrypoint ejecuta `prisma migrate deploy`) y arranca con `USER node` (uid 1000). Las herramientas de desarrollo (jest, ts-node-dev, handlebars, etc.) ya no viajan en la imagen final.
- **Dependencias:** backend con `express@5.3.x` (arrastra `proxy-addr@2.0.8`, `body-parser@2.4.0`, `qs@6.16+`) y `zod@4.6.7`; frontend con `axios@1.21+`, `vite@8.3.5+` y `follow-redirects@1.16.1+`. `npm audit --omit=dev` en el backend y `npm audit` en el frontend reportan **0 vulnerabilidades**.
- **Gates de seguridad:** `scripts/verify-commit.ps1` incluye un paso 3 que ejecuta `npm audit --audit-level=high` (backend con `--omit=dev`, frontend completo) y aborta el commit ante vulnerabilidades altas o críticas. `.github/workflows/security-audit.yml` repite la auditoría semanalmente y en cambios de manifiestos; `.github/dependabot.yml` abre PRs semanales para npm (raíz y frontend) y las imágenes Docker.
- **Hardening de Nginx:** `server_tokens off`; TLS restringido a `TLSv1.2`/`TLSv1.3`, `ssl_session_tickets off` y OCSP stapling con `chain.pem`; cabeceras `Strict-Transport-Security`, `X-Content-Type-Options` y `Referrer-Policy` en las respuestas del proxy.
- **Cotizador (PHP, repo aparte):** debe actualizarse a PHP `8.2.35+`, `8.3.36+`, `8.4.27+` o `8.5.12+` según su línea (CVE-2026-109618/109619, RCE sin autenticación). Mientras no se pueda redesplegar, la mitigación es `session.upload_progress.enabled=0` en su `php.ini` (CVE-2026-115560). Verificar con `docker exec cotizador-api php -v` tras el despliegue.

---

*Última actualización: Octubre 2026*
