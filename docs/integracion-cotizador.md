# Integración del Cotizador — Estado Actual y Arquitectura

> Documento vivo. Última actualización: 2026-09-21.
> Describe cómo se conecta el módulo Cotizador (desarrollo externo con su propia UI y BD) con el backend de Mudanzas Chico.

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
        └─────────────callback opcional────────┘
                (quote.status.updated)
```

### 2.2 Configuración en este backend (`.env`)

```env
# Webhook del sistema cotizador externo
COTIZADOR_WEBHOOK_URL="https://cotizador.empresa.com/api/webhooks/mudanzas-chico"
COTIZADOR_WEBHOOK_SECRET="secreto_compartido_de_al_menos_32_bytes"
```

### 2.3 Eventos salientes (backend → cotizador)

#### Evento `quote.requested`
Se envía cuando la IA detecta `intent: "QUOTE"` en un mensaje del cliente.

```json
{
  "event": "quote.requested",
  "version": 1,
  "id": "evt_01H8XK3M9ZQ4W7V2T6Y5B8N1",
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

```json
{
  "event": "quote.captured",
  "version": 1,
  "id": "evt_01H8XK4B2P8A6C5D9E7F0G2",
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

### 2.4 Evento entrante (cotizador → backend, opcional)

#### Callback `quote.status.updated`
El cotizador lo envía cuando una cotización cambia de estado, para que el bot notifique al cliente por WhatsApp.

```json
{
  "event": "quote.status.updated",
  "version": 1,
  "id": "evt_01H8XK5C4Q9B7D6E8F1G3H4",
  "timestamp": "2026-09-22T09:00:00.000Z",
  "data": {
    "conversationId": "uuid-de-la-conversacion",
    "quoteExternalId": "id-en-el-sistema-cotizador",
    "status": "PENDING | ACCEPTED | REJECTED",
    "price": 850000
  }
}
```

### 2.5 Seguridad del contrato

- **Firma HMAC-SHA256** sobre el body crudo, header: `X-Mudanzas-Signature: t=1695306600,v1=<hex>`
  - `v1 = HMAC_SHA256(secret, "v1:" + timestamp + ":" + rawBody)`
- **Timestamp:** se rechazan firmas con más de 5 minutos de antigüedad (anti-replay).
- **Idempotencia:** el campo `id` del evento es un UUID único. El receptor debe deduplicar por `id`.
- **Validación con Zod** en ambos extremos: todo payload entrante se valida antes de procesarse (los datos externos se tratan como no confiables).

### 2.6 Entrega y reintentos

- El webhook saliente espera respuesta `2xx` (idealmente `200`).
- Si falla (timeout, 4xx/5xx, red), se reintenta con **backoff exponencial** (ej. 5s, 25s, 125s, 625s → máx. 5 intentos).
- Eventos fallidos se registran en una tabla `OutboundWebhookEvent` para auditoría y reintento manual.

## 3. Qué hacer con el modelo `Quote` local

El modelo `Quote` en `prisma/schema.prisma` existe pero nunca se usó. **Nueva función:** registro espejo ligero para el CRM.

- Agregar campo `externalId String?` — ID de la cotización en el sistema externo.
- `status` espeja el estado informado por el callback (`PENDING`/`ACCEPTED`/`REJECTED`).
- `price` se llena con el valor del callback.
- El CRM muestra: "cliente en proceso de cotización" + enlace a la conversación. La gestión comercial vive en el sistema cotizador.

## 4. Brecha Crítica Actual (pendiente de implementar)

El flujo del bot (`conversationFlow.ts`) captura origen/destino/volumen pero **NO los persiste ni los envía a ningún sistema**. Hoy los datos se pierden. La implementación de esta arquitectura resuelve esa brecha.

## 5. Plan de Implementación

1. **`src/integrations/webhookClient.ts`** — Cliente saliente genérico: firma HMAC, reintentos con backoff, registro de eventos fallidos.
2. **`src/integrations/events.ts`** — Definiciones Zod de los payloads del contrato (2.3 y 2.4).
3. **Conectar `conversationFlow.ts`:**
   - Al detectar `intent: QUOTE` → emitir `quote.requested`.
   - En el estado `QUOTE_VOLUME` (al recibir la respuesta) → persistir `Quote` local y emitir `quote.captured` con origen, destino y volumen.
4. **Endpoint de callback** `POST /api/integrations/cotizador/events` — valida firma HMAC, parsea con Zod, actualiza la `Quote` local y notifica al cliente vía bot.
5. **Configuración:** `COTIZADOR_WEBHOOK_URL` y `COTIZADOR_WEBHOOK_SECRET` en `.env` / `.env.example`.
6. **Tests unitarios** para firma, validación e idempotencia (jest).

## 6. Preguntas abiertas para el equipo del cotizador

- ¿Endpoints alternos para `quote.requested` y `quote.captured`, o uno solo?
- ¿Formato del `volumeM3`: decimal con cuántos dígitos?
- ¿El callback incluye siempre `price` o solo en `ACCEPTED`?
- ¿Identificador del cliente: teléfono WhatsApp como clave única?
