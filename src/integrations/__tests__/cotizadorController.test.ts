import { Request, Response } from 'express';
import { receiveCotizadorEvent } from '../cotizadorController';
import { signPayload } from '../signature';
import { prisma } from '../../core/database/prisma';
import { getRawCredentials } from '../../crm/services/credentialService';
import { recordOutboundMessage } from '../../crm/services/conversationService';
import { createNotification } from '../../crm/services/notificationService';
import { sendWhatsAppMessage, sendWhatsAppDocument } from '../../bot/services/whatsappService';

jest.mock('../../core/database/prisma', () => ({
  prisma: {
    webhookEvent: { create: jest.fn(), delete: jest.fn() },
    quote: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    conversation: { findUnique: jest.fn(), findFirst: jest.fn() },
    client: { upsert: jest.fn(), findUnique: jest.fn() }
  }
}));

jest.mock('../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

jest.mock('../../crm/services/conversationService', () => ({
  recordOutboundMessage: jest.fn()
}));

jest.mock('../../crm/services/notificationService', () => ({
  createNotification: jest.fn()
}));

jest.mock('../../bot/services/whatsappService', () => ({
  sendWhatsAppMessage: jest.fn(),
  sendWhatsAppDocument: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  webhookEvent: { create: jest.Mock; delete: jest.Mock };
  quote: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
  conversation: { findUnique: jest.Mock; findFirst: jest.Mock };
  client: { upsert: jest.Mock; findUnique: jest.Mock };
};
const mockGetRawCredentials = getRawCredentials as jest.Mock;
const mockRecordOutbound = recordOutboundMessage as jest.Mock;
const mockSendWhatsApp = sendWhatsAppMessage as jest.Mock;
const mockSendWhatsAppDocument = sendWhatsAppDocument as jest.Mock;
const mockCreateNotification = createNotification as jest.Mock;

const SECRET = 'c'.repeat(64);

const EVENT_ID = 'd4e5f6a7-b8c9-4d0e-9f2a-3b4c5d6e7f80';
const CONVERSATION_ID = '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60';

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  event: 'quote.status.updated',
  version: 1,
  id: EVENT_ID,
  timestamp: new Date().toISOString(),
  data: {
    conversationId: CONVERSATION_ID,
    quoteExternalId: 'qz-ext-1',
    status: 'ACCEPTED',
    price: 850000
  },
  ...overrides
});

const buildCreatedEvent = (overrides: Record<string, unknown> = {}) => ({
  event: 'quote.created',
  version: 1,
  id: EVENT_ID,
  timestamp: new Date().toISOString(),
  data: {
    quoteExternalId: 'qz-web-1',
    client: { phone: '573001112233', name: 'Ana Web' },
    quote: { origin: 'Bogotá', destination: 'Medellín', volumeM3: 12.5, price: 850000 },
    status: 'PENDING'
  },
  ...overrides
});

const buildEstimatedEvent = (overrides: Record<string, unknown> = {}) => ({
  event: 'quote.estimated',
  version: 1,
  id: EVENT_ID,
  timestamp: new Date().toISOString(),
  data: {
    quoteExternalId: 'qz-ext-1',
    conversationId: CONVERSATION_ID,
    client: { phone: '573001112233', name: 'María' },
    price: 850000,
    pdfUrl: 'https://cotizador.chicologistica.com/files/qz-ext-1.pdf'
  },
  ...overrides
});

const makeReq = (body: unknown, signature?: string) => {
  const rawBody = Buffer.from(JSON.stringify(body));
  return {
    body,
    rawBody,
    header: (name: string) =>
      name.toLowerCase() === 'x-mudanzas-signature' ? signature : undefined
  } as unknown as Request & { rawBody?: Buffer };
};

const makeRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    sendStatus: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.sendStatus.mockReturnValue(res);
  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
    sendStatus: jest.Mock;
  };
};

const signedReq = (body: unknown) => {
  const req = makeReq(body);
  return makeReq(body, signPayload(req.rawBody!, SECRET));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRawCredentials.mockResolvedValue({
    CRM_WEBHOOK_SECRET: SECRET,
    CRM_WEBHOOK_URL: 'https://cotizador.example/api/webhooks/mudanzas-chico'
  } as never);
  mockPrisma.webhookEvent.create.mockResolvedValue({} as never);
  mockPrisma.webhookEvent.delete.mockResolvedValue({} as never);
  mockSendWhatsApp.mockResolvedValue(true as never);
  mockSendWhatsAppDocument.mockResolvedValue(true as never);
  mockRecordOutbound.mockResolvedValue({} as never);
  mockCreateNotification.mockResolvedValue({} as never);
});

describe('POST /api/integrations/cotizador/events', () => {
  it('rejects requests without a signature (401)', async () => {
    const body = buildEvent();
    const res = makeRes();
    await receiveCotizadorEvent(makeReq(body), res);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
  });

  it('rejects requests signed with the wrong secret (401)', async () => {
    const body = buildEvent();
    const rawBody = Buffer.from(JSON.stringify(body));
    const badHeader = signPayload(rawBody, 'wrong-secret');
    const res = makeRes();
    await receiveCotizadorEvent(makeReq(body, badHeader), res);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
  });

  it('returns 503 when stored credentials cannot be decrypted', async () => {
    const body = buildEvent();
    mockGetRawCredentials.mockRejectedValueOnce(
      new Error('Unsupported state or unable to authenticate data') as never
    );
    const res = makeRes();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns 503 when CRM_WEBHOOK_SECRET is not configured', async () => {
    const body = buildEvent();
    mockGetRawCredentials.mockResolvedValueOnce({
      CRM_WEBHOOK_SECRET: '',
      CRM_WEBHOOK_URL: 'https://cotizador.example/api/webhooks/mudanzas-chico'
    } as never);
    const res = makeRes();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('rejects a malformed envelope (400)', async () => {
    const body = { event: 'quote.status.updated', version: 1, timestamp: 'x' };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = makeReq(body, signPayload(rawBody, SECRET));
    const res = makeRes();
    await receiveCotizadorEvent(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an invalid payload without creating the dedup marker (400)', async () => {
    const body = buildEvent({ data: { conversationId: 'c', quoteExternalId: 'q', status: 'NOPE' } });
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = makeReq(body, signPayload(rawBody, SECRET));
    const res = makeRes();
    await receiveCotizadorEvent(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('maps a valid quote.status.updated to the local Quote and notifies the client', async () => {
    const body = buildEvent();
    const res = makeRes();
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'local-quote-1' } as never);
    mockPrisma.quote.update.mockResolvedValue({} as never);
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: CONVERSATION_ID,
      client: { phone: '573001112233', name: 'María' }
    } as never);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ externalId: 'qz-ext-1' }, { conversationId: CONVERSATION_ID }]
        }
      })
    );
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'local-quote-1' },
      data: { externalId: 'qz-ext-1', status: 'ACCEPTED', price: 850000 }
    });
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      '573001112233',
      expect.stringContaining('aprobada')
    );
    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID, senderType: 'BOT' })
    );
  });

  it('does not notify the client for PENDING status', async () => {
    const body = buildEvent({
      data: { conversationId: CONVERSATION_ID, quoteExternalId: 'qz-ext-1', status: 'PENDING' }
    });
    const res = makeRes();
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'local-quote-1' } as never);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it('deduplicates a redelivered event id (200, no reprocessing)', async () => {
    const body = buildEvent();
    mockPrisma.webhookEvent.create.mockRejectedValueOnce(new Error('Unique constraint')) as never;

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    expect(mockPrisma.quote.findFirst).not.toHaveBeenCalled();
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it('returns 500 and releases the marker when processing fails', async () => {
    const body = buildEvent();
    const res = makeRes();
    mockPrisma.quote.findFirst.mockRejectedValue(new Error('db down')) as never;

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockPrisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { id: EVENT_ID } });
  });

  it('acknowledges unknown event types with 200 (ignored)', async () => {
    const body = buildEvent({ event: 'future.event', data: { foo: 'bar' } });
    const res = makeRes();

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true, ignored: true, duplicate: false });
    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IGNORED' }) })
    );
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
  });

  it('logs a warning and returns 200 when no local Quote exists', async () => {
    const body = buildEvent();
    const res = makeRes();
    mockPrisma.quote.findFirst.mockResolvedValue(null as never);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('creates a Client and a WEB Quote from a valid quote.created', async () => {
    const body = buildCreatedEvent();
    mockPrisma.client.upsert.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'Ana Web' } as never);
    mockPrisma.quote.findFirst.mockResolvedValue(null as never);
    mockPrisma.quote.create.mockResolvedValue({} as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.client.upsert).toHaveBeenCalledWith({
      where: { phone: '573001112233' },
      update: { name: 'Ana Web' },
      create: { phone: '573001112233', name: 'Ana Web' }
    });
    expect(mockPrisma.quote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        externalId: 'qz-web-1',
        origin: 'Bogotá',
        destination: 'Medellín',
        volume: 12.5,
        price: 850000,
        status: 'PENDING',
        source: 'WEB'
      })
    });
  });

  it('is idempotent by externalId on quote.created', async () => {
    const body = buildCreatedEvent();
    mockPrisma.client.upsert.mockResolvedValue({ id: 'client-1' } as never);
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'existing-quote' } as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid quote.created payload without creating the dedup marker (400)', async () => {
    const body = buildCreatedEvent({
      data: { quoteExternalId: 'qz-web-1', client: { phone: '573001112233', name: 'Ana' }, status: 'NOPE' }
    });
    const res = makeRes();

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('deduplicates a redelivered quote.created event id (200, no reprocessing)', async () => {
    const body = buildCreatedEvent();
    mockPrisma.webhookEvent.create.mockRejectedValueOnce(new Error('Unique constraint')) as never;

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    expect(mockPrisma.quote.create).not.toHaveBeenCalled();
  });

  it('creates a late WEB Quote and internal notifications when a web status arrives first', async () => {
    const body = buildEvent({
      data: {
        conversationId: null,
        quoteExternalId: 'qz-web-1',
        status: 'ACCEPTED',
        price: 950000,
        client: { phone: '573001112233', name: 'Ana Web' }
      }
    });
    mockPrisma.quote.findFirst.mockResolvedValue(null as never);
    mockPrisma.client.upsert.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'Ana Web' } as never);
    mockPrisma.quote.create.mockResolvedValue({} as never);
    mockPrisma.conversation.findFirst.mockResolvedValue(null as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        conversationId: null,
        externalId: 'qz-web-1',
        status: 'ACCEPTED',
        price: 950000,
        source: 'WEB'
      })
    });
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', type: 'QUOTE_WEB_STATUS' })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'MARKETING_DIRECTOR', type: 'QUOTE_WEB_STATUS' })
    );
  });

  it('notifies on WhatsApp when a web quote client has a recent conversation', async () => {
    const body = buildEvent({
      data: {
        conversationId: null,
        quoteExternalId: 'qz-web-1',
        status: 'ACCEPTED',
        price: 950000,
        client: { phone: '573001112233', name: 'Ana Web' }
      }
    });
    mockPrisma.quote.findFirst.mockResolvedValue(null as never);
    mockPrisma.client.upsert.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'Ana Web' } as never);
    mockPrisma.quote.create.mockResolvedValue({} as never);
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-recent' } as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(mockSendWhatsApp).toHaveBeenCalledWith('573001112233', expect.stringContaining('aprobada'));
    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-recent', senderType: 'BOT' })
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('delivers the estimate PDF via WhatsApp and records a DOCUMENT message', async () => {
    const body = buildEstimatedEvent();
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'local-quote-1', clientId: 'client-1' } as never);
    mockPrisma.quote.update.mockResolvedValue({} as never);
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'María' } as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'local-quote-1' },
      data: {
        documentUrl: body.data.pdfUrl,
        price: 850000
      }
    });
    expect(mockSendWhatsAppDocument).toHaveBeenCalledWith(
      '573001112233',
      body.data.pdfUrl,
      expect.stringContaining('estimado')
    );
    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        senderType: 'BOT',
        type: 'DOCUMENT',
        mediaId: body.data.pdfUrl,
        deliveryStatus: 'SENT'
      })
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('falls back to internal notifications when the estimate has no conversation channel', async () => {
    const body = buildEstimatedEvent({ data: { ...buildEstimatedEvent().data, conversationId: null } });
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'local-quote-1', clientId: 'client-1' } as never);
    mockPrisma.quote.update.mockResolvedValue({} as never);
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'Ana Web' } as never);
    mockPrisma.conversation.findFirst.mockResolvedValue(null as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(mockSendWhatsAppDocument).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', type: 'QUOTE_PDF_PENDING', body: expect.stringContaining('pdf') })
    );
  });

  it('falls back to internal notifications when Meta rejects the document send', async () => {
    const body = buildEstimatedEvent();
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'local-quote-1', clientId: 'client-1' } as never);
    mockPrisma.quote.update.mockResolvedValue({} as never);
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'María' } as never);
    mockSendWhatsAppDocument.mockResolvedValueOnce(false as never);

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DOCUMENT', deliveryStatus: 'FAILED' })
    );
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid quote.estimated payload without creating the dedup marker (400)', async () => {
    const body = buildEstimatedEvent({ data: { quoteExternalId: 'q', pdfUrl: 'no-es-url' } });
    const res = makeRes();

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('deduplicates a redelivered quote.estimated event id (200, no reprocessing)', async () => {
    const body = buildEstimatedEvent();
    mockPrisma.webhookEvent.create.mockRejectedValueOnce(new Error('Unique constraint')) as never;

    const res = makeRes();
    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    expect(mockSendWhatsAppDocument).not.toHaveBeenCalled();
  });
});
