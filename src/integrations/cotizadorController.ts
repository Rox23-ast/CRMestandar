import { Request, Response } from 'express';
import { prisma } from '../core/database/prisma';
import { getRawCredentials } from '../crm/services/credentialService';
import { recordOutboundMessage } from '../crm/services/conversationService';
import { createNotification } from '../crm/services/notificationService';
import { sendWhatsAppMessage, sendWhatsAppDocument } from '../bot/services/whatsappService';
import { verifySignature } from './signature';
import { eventEnvelopeSchema, quoteStatusUpdatedSchema, quoteCreatedSchema, quoteEstimatedSchema } from './events';

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

// Notifies a web-born quote status change. The client may have never chatted
// with the bot: if a recent conversation exists we message them on WhatsApp,
// otherwise we create internal notifications so an agent follows up manually.
const notifyWebQuote = async (
  client: { id: string; name: string | null; phone: string },
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED',
  price?: number | null,
  quoteExternalId?: string
) => {
  if (status === 'PENDING') return;

  const message = buildNotification(status, price);
  if (!message) return;

  try {
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentConversation = await prisma.conversation.findFirst({
      where: {
        clientId: client.id,
        lastMessageAt: { gte: recentWindow },
        status: { in: ['NEW', 'BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER'] }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    if (recentConversation) {
      const sent = await sendWhatsAppMessage(client.phone, message);
      await recordOutboundMessage({
        conversationId: recentConversation.id,
        body: message,
        senderType: 'BOT',
        deliveryStatus: sent ? 'SENT' : 'FAILED'
      });
      return;
    }
  } catch (error) {
    console.error('[Cotizador] Error notifying web quote via WhatsApp:', error);
  }

  const clientLabel = client.name || client.phone;
  const priceLabel = price !== undefined && price !== null ? ` (${formatPrice(price)})` : '';
  const action = status === 'ACCEPTED' ? 'aceptó' : 'rechazó';
  try {
    for (const role of ['ADMIN', 'MARKETING_DIRECTOR']) {
      await createNotification({
        role,
        type: 'QUOTE_WEB_STATUS',
        title: `Cotización web ${status.toLowerCase()}`,
        body: `${clientLabel} ${action} la cotización ${quoteExternalId ?? 'web'}${priceLabel} desde la web del cotizador.`
      });
    }
  } catch (error) {
    console.error('[Cotizador] Error creating internal notification:', error);
  }
};

const upsertClientByPhone = async (client: { phone: string; name: string }) => {
  return prisma.client.upsert({
    where: { phone: client.phone },
    update: client.name ? { name: client.name } : {},
    create: { phone: client.phone, name: client.name || null }
  });
};

const processQuoteCreated = async (
  data: {
    quoteExternalId: string;
    client: { phone: string; name: string };
    quote?: { origin?: string; destination?: string; volumeM3?: number; price?: number | null };
    status?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  }
) => {
  const client = await upsertClientByPhone(data.client);

  const existing = await prisma.quote.findFirst({ where: { externalId: data.quoteExternalId } });
  if (existing) return;

  await prisma.quote.create({
    data: {
      clientId: client.id,
      externalId: data.quoteExternalId,
      origin: data.quote?.origin ?? '',
      destination: data.quote?.destination ?? '',
      volume: data.quote?.volumeM3 ?? null,
      price: data.quote?.price ?? null,
      status: data.status ?? 'PENDING',
      source: 'WEB'
    }
  });
};

const processQuoteStatusUpdate = async (
  data: {
    conversationId?: string | null;
    quoteExternalId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    price?: number | null;
    client?: { phone: string; name: string };
  }
) => {
  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        { externalId: data.quoteExternalId },
        ...(data.conversationId ? [{ conversationId: data.conversationId }] : [])
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!quote) {
    // Late arrival: the CRM has never seen this quote. Resolvable only when
    // the event carries client data (web-born quotes).
    if (!data.client) {
      console.warn(
        `[Cotizador] No local Quote found for externalId=${data.quoteExternalId} and no client data provided`
      );
      return;
    }
    const client = await upsertClientByPhone(data.client);
    await prisma.quote.create({
      data: {
        clientId: client.id,
        conversationId: data.conversationId ?? null,
        externalId: data.quoteExternalId,
        origin: '',
        destination: '',
        price: data.price ?? null,
        status: data.status,
        source: data.conversationId ? 'BOT' : 'WEB'
      }
    });

    if (data.conversationId) {
      await notifyClient(data.conversationId, data.status, data.price);
    } else {
      await notifyWebQuote(client, data.status, data.price, data.quoteExternalId);
    }
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

  if (data.conversationId) {
    await notifyClient(data.conversationId, data.status, data.price);
  } else if (data.client) {
    const client = await upsertClientByPhone(data.client);
    await notifyWebQuote(client, data.status, data.price, data.quoteExternalId);
  }
};

const buildEstimateCaption = (price?: number | null): string => {
  const withPrice = price !== undefined && price !== null ? ` por ${formatPrice(price)}` : '';
  return `¡Hola! Aquí tienes el estimado de tu mudanza${withPrice}.`;
};

// Handles quote.estimated: stores the PDF URL on the Quote and delivers the
// document via WhatsApp when a conversation channel is available (recent chat
// within 24h). Otherwise it falls back to internal notifications with the URL.
const processQuoteEstimated = async (
  data: {
    quoteExternalId: string;
    conversationId?: string | null;
    client?: { phone: string; name: string };
    price?: number | null;
    pdfUrl: string;
  }
) => {
  const quote = await prisma.quote.findFirst({
    where: {
      OR: [
        { externalId: data.quoteExternalId },
        ...(data.conversationId ? [{ conversationId: data.conversationId }] : [])
      ]
    },
    orderBy: { createdAt: 'desc' }
  });

  if (quote) {
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        documentUrl: data.pdfUrl,
        ...(data.price !== undefined && data.price !== null ? { price: data.price } : {})
      }
    });
  }

  let clientId = quote?.clientId ?? null;
  let phone: string | null = null;
  let name: string | null = null;

  if (clientId) {
    const stored = await prisma.client.findUnique({ where: { id: clientId } });
    phone = stored?.phone ?? null;
    name = stored?.name ?? null;
  }
  if (!phone && data.client) {
    const upserted = await upsertClientByPhone(data.client);
    clientId = upserted.id;
    phone = upserted.phone;
    name = upserted.name;
  }

  const caption = buildEstimateCaption(data.price);

  let conversationId = data.conversationId ?? null;
  if (!conversationId && clientId) {
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.conversation.findFirst({
      where: {
        clientId,
        lastMessageAt: { gte: recentWindow },
        status: { in: ['NEW', 'BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER'] }
      },
      orderBy: { lastMessageAt: 'desc' }
    });
    conversationId = recent?.id ?? null;
  }

  let delivered = false;
  if (conversationId && phone) {
    const sent = await sendWhatsAppDocument(phone, data.pdfUrl, caption);
    delivered = sent;
    await recordOutboundMessage({
      conversationId,
      body: caption,
      senderType: 'BOT',
      deliveryStatus: sent ? 'SENT' : 'FAILED',
      type: 'DOCUMENT',
      mediaId: data.pdfUrl
    });
  }

  if (!delivered) {
    // No WhatsApp channel available (no conversation, or Meta rejected the
    // send, e.g., outside the 24h customer service window).
    const label = name || phone || 'Cliente';
    const reason = !conversationId
      ? 'sin conversación activa'
      : 'envío rechazado por WhatsApp (posible ventana de 24h)';
    try {
      for (const role of ['ADMIN', 'MARKETING_DIRECTOR']) {
        await createNotification({
          role,
          type: 'QUOTE_PDF_PENDING',
          title: 'Estimado pendiente de envío',
          body: `${label} tiene un estimado listo (${reason}). PDF: ${data.pdfUrl}`
        });
      }
    } catch (error) {
      console.error('[Cotizador] Error creating internal notification for PDF:', error);
    }
  }
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

  const isQuoteCreated = envelope.data.event === 'quote.created';
  if (isQuoteCreated) {
    const parsed = quoteCreatedSchema.safeParse(req.body);
    if (!parsed.success) return problem(res, 400, 'Invalid event payload');
    return handleQuoteCreated(parsed.data, res);
  }

  const isQuoteEstimated = envelope.data.event === 'quote.estimated';
  if (isQuoteEstimated) {
    const parsed = quoteEstimatedSchema.safeParse(req.body);
    if (!parsed.success) return problem(res, 400, 'Invalid event payload');
    return handleQuoteEstimated(parsed.data, res);
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

const handleQuoteCreated = async (
  payload: ReturnType<typeof quoteCreatedSchema.parse>,
  res: Response
) => {
  const duplicate = await markEventProcessed(payload.id, payload.event, payload, 'PROCESSED');
  if (duplicate) return res.json({ received: true, duplicate: true });

  try {
    await processQuoteCreated(payload.data);
  } catch (error) {
    console.error('[Cotizador] Error processing quote.created:', error);
    await releaseEventMarker(payload.id);
    return problem(res, 500, 'Event processing failed');
  }
  return res.json({ received: true });
};

const handleQuoteEstimated = async (
  payload: ReturnType<typeof quoteEstimatedSchema.parse>,
  res: Response
) => {
  const duplicate = await markEventProcessed(payload.id, payload.event, payload, 'PROCESSED');
  if (duplicate) return res.json({ received: true, duplicate: true });

  try {
    await processQuoteEstimated(payload.data);
  } catch (error) {
    console.error('[Cotizador] Error processing quote.estimated:', error);
    await releaseEventMarker(payload.id);
    return problem(res, 500, 'Event processing failed');
  }
  return res.json({ received: true });
};
