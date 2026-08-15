# ADR-001: Propiedad y seguimiento de conversaciones CRM

## Estado
Aceptado

## Contexto

El chatbot puede responder automáticamente, pero cada cliente debe tener un responsable humano para seguimiento. Las conversaciones también deben poder operar fuera de horario, conservar historial y notificar al CRM en tiempo real.

## Decisión

Usar `Conversation` como unidad de asignación y `Message` como unidad de historial.

- La primera entrada crea la conversación y asigna un agente por round-robin durante el horario laboral.
- Fuera de horario, la conversación se asigna al rol `MARKETING_DIRECTOR`.
- El bot comienza activo, pero un agente puede tomar control explícitamente.
- Las asignaciones se conservan históricamente en `ConversationAssignment`.
- Las notificaciones se persisten en `Notification` y se distribuyen al CRM mediante SSE.
- Los mensajes entrantes se identifican con el ID externo de WhatsApp para mantener idempotencia.

## Alternativas consideradas

### Asignar cada mensaje individual

Rechazado porque dividiría una conversación entre agentes y rompería la continuidad del seguimiento.

### Mantener el estado solo en `Client.botStep`

Rechazado porque no permite historial, múltiples conversaciones, auditoría, asignaciones ni métricas SLA.

### Notificaciones únicamente mediante polling

Rechazado como mecanismo principal porque retrasa la recepción y aumenta consultas innecesarias. Se conserva la base persistente y SSE entrega los eventos en tiempo real.

## Consecuencias

- El CRM puede mostrar una bandeja operativa completa y auditable.
- El bot y el agente no deben responder simultáneamente cuando el estado sea `HUMAN_ACTIVE`.
- Las futuras políticas de SLA, prioridades, disponibilidad y conservación se pueden agregar sin cambiar el historial de mensajes.
- La autenticación JWT debe estar implementada antes de habilitar el panel CRM en producción.
