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

Las rutas CRM, excepto `auth/bootstrap` y `auth/login`, requieren un JWT Bearer válido y cargan el usuario desde la base de datos. Las contraseñas se almacenan usando scrypt con salt. Las respuestas de error usan un formato Problem Details reducido y las entradas se validan con Zod.

## 5. Evolución del Bot y Machine State

- **Flujos de Conversación:** Se implementó una "Máquina de Estados" para el Bot (mediante la columna `botStep` en la tabla de Clientes). Esto permite que el chatbot recuerde la fase del cliente (Ej. `START`, `QUOTE_ORIGIN`, `QUOTE_DESTINATION`, `AGENT_HANDOFF`) sin perder contexto.
- **Abstracción de IA (OpenAI):** Se integró el SDK oficial de OpenAI (`openai`) en `aiService.ts`. El chatbot utiliza el modelo `gpt-4o-mini` configurado con `response_format: { type: "json_object" }` para asegurar que las respuestas sean estructuradas. Esto permite que el LLM redacte respuestas naturales y extraiga la intención (`intent`) en una sola llamada a la API, optimizando costos y velocidad.

- **Seguridad en Capa HTTP:** Se utiliza `helmet` para proteger cabeceras y `express-rate-limit` para evitar abusos en los endpoints.
- **Validación de Webhooks (Meta/WhatsApp):** El GET valida el token de suscripción y el POST valida `x-hub-signature-256` con `WA_APP_SECRET`. El cuerpo original se conserva solo para verificar la firma. Se responde instantáneamente con status 200 después de validar la autenticidad, antes de procesar el mensaje para evitar reintentos de Meta.
- **Interfaz Gráfica (Frontend):** Se eligió React con Tailwind CSS para mapear de forma exacta la identidad visual.
- **Validación de Datos:** Todos los *inputs* deben ser validados utilizando `zod` antes de llegar a los servicios.
- **Autenticación:** Las rutas privadas (CRM/Cotizador administrativo) se protegen mediante JWT (JSON Web Tokens).
- **Tipado Estricto:** TypeScript se utiliza en modo estricto para evitar errores en tiempo de ejecución.
- **Testing:** Se utiliza `jest` (y `ts-jest`) para pruebas unitarias. Cada nueva funcionalidad en el `core` y módulos críticos debe estar cubierta por tests.
- **Panel CRM inicial:** `frontend/src/CrmInbox.tsx` incluye login JWT, bandeja, historial, toma de control, reactivación del bot, respuesta por WhatsApp y consumo autenticado de SSE.

---
*Nota para los Agentes IA: Este documento debe actualizarse cada vez que se cree un nuevo módulo, tabla en la base de datos o se cambie la lógica de negocio fundamental.*
