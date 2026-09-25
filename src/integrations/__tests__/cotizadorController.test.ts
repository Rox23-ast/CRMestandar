import { Request, Response } from 'express';
import { receiveCotizadorEvent } from '../cotizadorController';
import { signPayload } from '../signature';
import { prisma } from '../../core/database/prisma';
import { getRawCredentials } from '../../crm/services/credentialService';
import { recordOutboundMessage } from '../../crm/services/conversationService';
import { sendWhatsAppMessage } from '../../bot/services/whatsappService';

jest.mock('../../core/database/prisma', () => ({
  prisma: {
    webhookEvent: { create: jest.fn(), delete: jest.fn() },
    quote: { findFirst: jest.fn(), update: jest.fn() },
    conversation: { findUnique: jest.fn() }
  }
}));

jest.mock('../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

jest.mock('../../crm/services/conversationService', () => ({
  recordOutboundMessage: jest.fn()
}));

jest.mock('../../bot/services/whatsappService', () => ({
  sendWhatsAppMessage: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  webhookEvent: { create: jest.Mock; delete: jest.Mock };
  quote: { findFirst: jest.Mock; update: jest.Mock };
  conversation: { findUnique: jest.Mock };
};
const mockGetRawCredentials = getRawCredentials as jest.Mock;
const mockRecordOutbound = recordOutboundMessage as jest.Mock;
const mockSendWhatsApp = sendWhatsAppMessage as jest.Mock;

const SECRET = 'c'.repeat(64);

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  event: 'quote.status.updated',
  version: 1,
  id: 'evt_callback_1',
  timestamp: new Date().toISOString(),
  data: {
    conversationId: 'conv-1',
    quoteExternalId: 'qz-ext-1',
    status: 'ACCEPTED',
    price: 850000
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
  mockRecordOutbound.mockResolvedValue({} as never);
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
      id: 'conv-1',
      client: { phone: '573001112233', name: 'María' }
    } as never);

    await receiveCotizadorEvent(signedReq(body), res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ externalId: 'qz-ext-1' }, { conversationId: 'conv-1' }]
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
      expect.objectContaining({ conversationId: 'conv-1', senderType: 'BOT' })
    );
  });

  it('does not notify the client for PENDING status', async () => {
    const body = buildEvent({
      data: { conversationId: 'conv-1', quoteExternalId: 'qz-ext-1', status: 'PENDING' }
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
    expect(mockPrisma.webhookEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt_callback_1' } });
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
});
