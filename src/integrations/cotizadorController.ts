import { Request, Response } from 'express';
import { prisma } from '../core/database/prisma';
import { getRawCredentials } from '../crm/services/credentialService';
import { recordOutboundMessage } from '../crm/services/conversationService';
import { sendWhatsAppMessage } from '../bot/services/whatsappService';
import { verifySignature } from './signature';
import { eventEnvelopeSchema, quoteStatusUpdatedSchema } from './events';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const problem = (res: Response, status: number, title: string) =>
  res.status(status).json({ type: `https://httpstatuses.com/${status}`, title, status });

const formatPrice = (price: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(price);

const buildNotification = (status: 'PENDING' | 'ACCEPTED' | 'REJECTED', price?: number | null): string | null => {
  if (status === 'ACCEPTED') {
    const withPrice = price !== undefined && price !== null
      ? ` por ${formatPrice(price)}`
      : '';
    return `¡Buenas noticias! Tu cotización fue aprobada${withPrice}. Un asistente te contactará pronto para coordinar los detalles.`;
  }
  if (status === 'REJECTED') {
    return 'Tu cotización no fue aprobada. Un asistente de Mudanzas Chico te contactará para revisar alternativas.';
  }
  return null;
};

const notifyClient = async (conversationId: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED', price?: number | null) => {
  const message = buildNotification(status, price);
  if (!message) return;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { client: true }
    });
    if (!conversation) {
      console.warn(`[Cotizador] Conversation ${conversationId} not found; skipping notification`);
      return;
    }

    const sent = await sendWhatsAppMessage(conversation.client.phone, message);
    await recordOutboundMessage({
      conversationId,
      body: message,
      senderType: 'BOT',
      deliveryStatus: sent ? 'SENT' : 'FAILED'
    });
  } catch (error) {
    console.error('[Cotizador] Error notifying client of quote status:', error);
  }
};

const processQuoteStatusUpdate = async (
  data: {
    conversationId: string;
    quoteExternalId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    price?: number | null;
  }
) => {
  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        { externalId: data.quoteExternalId },
        { conversationId: data.conversationId }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!quote) {
    console.warn(
      `[Cotizador] No local Quote found for externalId=${data.quoteExternalId} conversationId=${data.conversationId}`
    );
    return;
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      externalId: data.quoteExternalId,
      status: data.status,
      ...(data.price !== undefined && data.price !== null ? { price: data.price } : {})
    }
  });

  await notifyClient(data.conversationId, data.status, data.price);
};

/**
 * POST /api/integrations/cotizador/events
 * Receives quote.status.updated callbacks from the external cotizador.
 * Protected by HMAC signature (X-Mudanzas-Signature), deduplicated by event id.
 */
export const receiveCotizadorEvent = async (req: RawBodyRequest, res: Response) => {
  let secret: string;
  try {
    secret = (await getRawCredentials()).CRM_WEBHOOK_SECRET;
  } catch (error) {
    console.error('[Cotizador] Failed to load webhook credentials:', error);
    return problem(res, 503, 'Webhook credentials unavailable');
  }
  if (!secret) {
    console.error('[Cotizador] CRM_WEBHOOK_SECRET is not configured; rejecting callback');
    return problem(res, 503, 'Webhook secret not configured');
  }
  if (!verifySignature(req.header('x-mudanzas-signature'), req.rawBody, secret)) {
    return res.sendStatus(401);
  }

  const envelope = eventEnvelopeSchema.safeParse(req.body);
  if (!envelope.success) return problem(res, 400, 'Invalid event envelope');

  // Known events are fully validated before the idempotency marker is created,
  // so a rejected payload stays retryable by the sender.
  const isQuoteStatusUpdated = envelope.data.event === 'quote.status.updated';
  if (isQuoteStatusUpdated) {
    const parsed = quoteStatusUpdatedSchema.safeParse(req.body);
    if (!parsed.success) return problem(res, 400, 'Invalid event payload');
    return handleQuoteStatusUpdated(parsed.data, res);
  }

  // Unknown event type: acknowledge (200) so the sender does not retry forever.
  const duplicate = await markEventProcessed(envelope.data.id, envelope.data.event, req.body, 'IGNORED');
  return res.json({ received: true, ignored: true, duplicate });
};

const markEventProcessed = async (
  eventId: string,
  event: string,
  body: unknown,
  status: 'PROCESSED' | 'IGNORED'
): Promise<boolean> => {
  try {
    await prisma.webhookEvent.create({
      data: {
        id: eventId,
        direction: 'INBOUND',
        event,
        payload: JSON.stringify(body),
        status
      }
    });
    return false;
  } catch {
    // Unique constraint violation => this event id was already processed.
    return true;
  }
};

const releaseEventMarker = async (eventId: string): Promise<void> => {
  try {
    await prisma.webhookEvent.delete({ where: { id: eventId } });
  } catch (error) {
    console.error('[Cotizador] Failed to release event marker:', error);
  }
};

const handleQuoteStatusUpdated = async (
  payload: ReturnType<typeof quoteStatusUpdatedSchema.parse>,
  res: Response
) => {
  const duplicate = await markEventProcessed(payload.id, payload.event, payload, 'PROCESSED');
  if (duplicate) return res.json({ received: true, duplicate: true });

  try {
    await processQuoteStatusUpdate(payload.data);
  } catch (error) {
    // Release the idempotency marker so the sender's retry can process it again.
    console.error('[Cotizador] Error processing quote.status.updated:', error);
    await releaseEventMarker(payload.id);
    return problem(res, 500, 'Event processing failed');
  }
  return res.json({ received: true });
};
