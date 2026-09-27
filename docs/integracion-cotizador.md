# Integración del Cotizador — Estado Actual y Arquitectura

> Documento vivo. Última actualización: 2026-09-27.
> Describe cómo se conecta el módulo Cotizador (desarrollo externo con su propia UI y BD) con el backend de Mudanzas Chico.
> **Estado: IMPLEMENTADO** (backend de este repo). Ver también ARCHITECTURE.md §9.

## 1. Decisión de Arquitectura (ADR)

**Decisión:** El cotizador es un **sistema completo externo** (UI propia, usuarios propios, base de datos propia). La integración con el backend de Mudanzas Chico (Bot WhatsApp + CRM) se hace mediante **webhooks salientes firmados (event-driven)**, no mediante llamadas REST síncronas.

**Razones:**
1. **Desacoplamiento de disponibilidad:** el bot de WhatsApp no debe fallar si el sistema cotizador está caído. Con webhooks, cada sistema opera independiente.
2. **Dos bases de datos, dos dominios:** el cotizador gestiona su propio ciclo de vida (precios, aprobaciones, seguimiento comercial). Este backend solo es la fuente de *leads* calificados.
3. **Escala simple:** un droplet de 1 vCPU y SQLite no necesita un message broker (RabbitMQ/Kafka). Webhooks HTTP con reintentos es suficiente.
4. **Contrato estable (Hyrum's Law):** se define un contrato JSON versionado y firmado antes de implementar. Los cambios son aditivos y opcionales.

**Alternativas consideradas:**
| Alternativa | Veredicto |
|---|---|
| REST síncrono (este backend llama al cotizador por cada mensaje) | ❌ Acopla disponibilidad; latencia en el chat |
| Base de datos compartida | ❌ Violación de límites de dominio; riesgo de corrupción |
| Cola de mensajes (RabbitMQ/Redis) | ❌ Sobrecargado para esta escala |
| Solo pasar leads por email | ❌ Sin trazabilidad ni automatización |

## 2. Contrato de Integración (Contract-First)

### 2.1 Dirección del flujo

```
Este backend (Bot + CRM) ──webhook──▶ Sistema Cotizador externo
        ▲                                      │
        └─────────────callback─────────────┘
   (quote.status.updated y quote.created para leads web)
```

### 2.2 Configuración en este backend (`.env` o panel)

```env
# URL del sistema cotizador externo (recibe quote.requested / quote.captured)
CRM_WEBHOOK_URL="https://<dominio-api-cotizador>/api/webhooks/mudanzas-chico"
# Secreto HMAC compartido, >= 32 bytes
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRM_WEBHOOK_SECRET="..."
```

Ambas variables también son editables desde el panel CRM (**Configuración de APIs**, rol ADMIN) y quedan cifradas en `StoredCredential`. El cotizador debe recibir **nuestra** URL pública (`https://<nuestro-dominio>/api/integrations/cotizador/events`) y el **mismo** secreto en su `.env` (`COTIZADOR_WEBHOOK_URL` / `COTIZADOR_WEBHOOK_SECRET`).

### 2.3 Eventos salientes (backend → cotizador)

#### Evento `quote.requested`
Se envía cuando la IA detecta `intent: "QUOTE"` en un mensaje del cliente.

```json
{
  "event": "quote.requested",
  "version": 1,
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "timestamp": "2026-09-21T14:30:00.000Z",
  "data": {
    "client": {
      "phone": "573001112233",
      "name": "María Pérez"
    },
    "conversationId": "uuid-de-la-conversacion",
    "message": "Quiero cotizar una mudanza de Bogotá a Medellín"
  }
}
```

#### Evento `quote.captured`
Se envía cuando el bot completa la captura de origen, destino y volumen (estado `QUOTE_VOLUME` → `AGENT_HANDOFF`).

Notas del contrato (fuente: `packages/contract` del cotizador): `id` y `conversationId` son **UUID** (el `conversationId` es el `id` de nuestra `Conversation`, UUID por esquema); `client.name` va como `""` cuando el cliente no tiene nombre guardado (la identidad es el teléfono).

```json
{
  "event": "quote.captured",
  "version": 1,
  "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  "timestamp": "2026-09-21T14:35:00.000Z",
  "data": {
    "client": {
      "phone": "573001112233",
      "name": "María Pérez"
    },
    "conversationId": "uuid-de-la-conversacion",
    "quote": {
      "origin": "Bogotá",
      "destination": "Medellín",
      "volumeM3": 12.5
    }
  }
}
```

### 2.4 Eventos entrantes (cotizador → backend)

#### Callback `quote.status.updated`
El cotizador lo envía cuando una cotización cambia de estado, para que el bot notifique al cliente por WhatsApp.

```json
{
  "event": "quote.status.updated",
  "version": 1,
  "id": "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f",
  "timestamp": "2026-09-22T09:00:00.000Z",
  "data": {
    "conversationId": "uuid-de-la-conversacion | null",
    "quoteExternalId": "id-en-el-sistema-cotizador",
    "status": "PENDING | ACCEPTED | REJECTED",
    "price": 850000,
    "client": { "phone": "573001112233", "name": "María Pérez" }
  }
}
```

- `conversationId` es **opcional** (null cuando la cotización nació en la web del cotizador).
- `client` es **opcional** (recomendado siempre): permite al CRM resolver cotizaciones que nunca ha visto (llegada tardía) sin depender de `conversationId`.
- **Matching en el CRM (3 pasos):** 1) por `quoteExternalId`, 2) por `conversationId`, 3) si no existe → crea `Client` (por teléfono) + `Quote` con `source: 'WEB'`.

#### Evento `quote.created` (web → CRM)
El cotizador lo emite al crear una cotización desde su formulario web (sin conversación). Sincroniza la lead al CRM de inmediato.

```json
{
  "event": "quote.created",
  "version": 1,
  "id": "d4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80",
  "timestamp": "2026-09-26T21:00:00.000Z",
  "data": {
    "quoteExternalId": "q_abc123",
    "client": { "phone": "573001112233", "name": "Ana Web" },
    "quote": { "origin": "Bogotá", "destination": "Medellín", "volumeM3": 12.5, "price": 850000 },
    "status": "PENDING",
    "createdAt": "2026-09-26T21:00:00.000Z"
  }
}
```

- `quote`, `status` y `createdAt` son opcionales (defaults: `''`/`''`/`null` para origen/destino/volumen, `PENDING` para el estado).
- El CRM hace upsert del `Client` por teléfono y crea la `Quote` idempotentemente por `quoteExternalId` con `source: 'WEB'`.

#### Notificaciones de cotizaciones web

- **ACCEPTED/REJECTED con `conversationId`:** WhatsApp normal al cliente (flujo del bot).
- **ACCEPTED/REJECTED sin `conversationId`:** si el cliente tiene una conversación activa con `lastMessageAt` en las últimas 24h → WhatsApp; si no → **notificación interna** (`Notification` con rol `ADMIN` y `MARKETING_DIRECTOR`, tipo `QUOTE_WEB_STATUS`) para que un agente lo contacte manualmente.

### 2.5 Seguridad del contrato

- **Firma HMAC-SHA256** sobre el body crudo, header: `X-Mudanzas-Signature: t=1695306600,v1=<hex>`
  - `v1 = HMAC_SHA256(secret, "v1:" + timestamp + ":" + rawBody)`
- **Timestamp:** se rechazan firmas con más de 5 minutos de antigüedad (anti-replay).
- **Idempotencia:** el campo `id` del evento es un UUID único. El receptor debe deduplicar por `id`.
- **Validación con Zod** en ambos extremos: todo payload entrante se valida antes de procesarse (los datos externos se tratan como no confiables).

### 2.6 Entrega y reintentos

- El webhook saliente espera respuesta `2xx` (idealmente `200`).
- Si falla (timeout, 4xx/5xx, red), se reintenta con **backoff exponencial** (5s, 25s, 125s, 625s → máx. 5 intentos) **en background**: el chat nunca espera la entrega.
- Cada evento (saliente y entrante) se registra en la tabla `WebhookEvent` (id del evento, dirección, payload, status, intentos, último error) para auditoría y reintento manual.
- El emisor del cotizador (callbacks hacia nosotros) debe aplicar la misma política de reintentos; nuestro endpoint deduplica por `event.id` y libera el marcador si el procesamiento falla, para que el reintento pueda repetirse.
- Si nuestro endpoint responde **503** (secreto no configurado o no descifrable en el CRM), el emisor debe reintentar más tarde: no es un rechazo permanente del evento.

## 3. Qué hacer con el modelo `Quote` local

El modelo `Quote` en `prisma/schema.prisma` se usa ahora como **registro espejo ligero** para el CRM.

- ✅ Campo `externalId String? @unique` — ID de la cotización en el sistema externo (se llena con el primer callback).
- ✅ Campo `conversationId String?` — correlación con la conversación de WhatsApp (también clave de búsqueda del callback).
- `status` espeja el estado informado por el callback (`PENDING`/`ACCEPTED`/`REJECTED`).
- `price` se llena con el valor del callback (cuando viene).
- El CRM muestra: "cliente en proceso de cotización" + enlace a la conversación. La gestión comercial vive en el sistema cotizador.

## 4. Brecha Crítica (RESUELTA)

El flujo del bot **ahora persiste** origen/destino/volumen en `Client` durante la captura y, al completarla, crea el `Quote` local y emite `quote.captured`. Antes esos datos se perdían.

## 5. Implementación (Septiembre 2026)

1. ✅ **`src/integrations/webhookClient.ts`** — Cliente saliente: firma HMAC, reintentos de fondo con backoff, auditoría en `WebhookEvent`.
2. ✅ **`src/integrations/events.ts`** — Definiciones Zod de los payloads (§2.3 y §2.4).
3. ✅ **`src/integrations/signature.ts`** — Firmar/verificar `X-Mudanzas-Signature` con ventana anti-replay de 5 min.
4. ✅ **`conversationFlow.ts`:**
   - `intent: QUOTE` de la IA **o** regla rápida de captura → emite `quote.requested`.
   - Captura en `QUOTE_ORIGIN`/`QUOTE_DESTINATION`/`QUOTE_VOLUME` → persiste en `Client`, crea `Quote` y emite `quote.captured`.
5. ✅ **Callback** `POST /api/integrations/cotizador/events` — firma, Zod, dedup, mapeo a `Quote`, notificación WhatsApp en ACCEPTED/REJECTED.
6. ✅ **Configuración:** `CRM_WEBHOOK_URL` y `CRM_WEBHOOK_SECRET` en `.env`/`.env.example` **y** en el panel CRM (Configuración de APIs).
7. ✅ **Tests:** firma, schemas, callback (401/400/503/200/dedup), webhook client, conversationFlow, credentials (101/101).
8. ✅ **E2E local (Docker):** verificado contra el cotizador real — `quote.requested` crea su fila PENDING → `quote.captured` aplica origen/destino/volumen → PATCH `ACCEPTED`+precio en su API → su outbox entrega `quote.status.updated` → el CRM marca la `Quote` ACCEPTED con precio y `externalId`, `WebhookEvent` INBOUND PROCESSED y notifica por WhatsApp (falla degradada si las credenciales de Meta no son válidas).

## 6. Respuestas a las preguntas del contrato (§ previo)

- **¿Endpoints alternos o uno solo?** → **Uno solo** para `quote.requested` y `quote.captured`: la URL de `CRM_WEBHOOK_URL` (`https://<dominio-api-cotizador>/api/webhooks/mudanzas-chico`).
- **¿Formato del `volumeM3`?** → **Decimal con máximo 2 dígitos** (ej. `12.5`); el emisor redondea a 2 decimales antes de enviar y Zod rechaza negativos.
- **¿`price` siempre o solo en `ACCEPTED`?** → **Solo está garantizado en `ACCEPTED`**; otros estados pueden omitirlo. El CRM persiste el precio solo cuando el callback lo incluye.
- **¿Teléfono WhatsApp como clave única del cliente?** → **Sí.** `Client.phone` es `@unique` en el esquema y el evento incluye `client.phone` (+ `conversationId` para correlación).
