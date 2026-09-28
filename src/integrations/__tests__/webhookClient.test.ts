import { prisma } from '../../core/database/prisma';
import { getRawCredentials } from '../../crm/services/credentialService';
import { emitQuoteRequested } from '../webhookClient';
import { signPayload } from '../signature';

jest.mock('../../core/database/prisma', () => ({
  prisma: {
    webhookEvent: { create: jest.fn(), update: jest.fn() }
  }
}));

jest.mock('../../crm/services/credentialService', () => ({
  getRawCredentials: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  webhookEvent: { create: jest.Mock; update: jest.Mock };
};
const mockGetRawCredentials = getRawCredentials as jest.Mock;

const SECRET = 'd'.repeat(64);
const URL = 'https://cotizador.example/api/webhooks/mudanzas-chico';
const CONVERSATION_ID = '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRawCredentials.mockResolvedValue({
    CRM_WEBHOOK_URL: URL,
    CRM_WEBHOOK_SECRET: SECRET
  } as never);
  mockPrisma.webhookEvent.create.mockResolvedValue({ id: 'evt_created' } as never);
  mockPrisma.webhookEvent.update.mockResolvedValue({} as never);
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as never) as jest.Mock;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('integrations - webhookClient', () => {
  it('skips the event when webhook config is missing', async () => {
    mockGetRawCredentials.mockResolvedValue({ CRM_WEBHOOK_URL: '', CRM_WEBHOOK_SECRET: '' } as never);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await emitQuoteRequested({
      client: { phone: '57300', name: null },
      conversationId: CONVERSATION_ID,
      message: 'hola'
    });

    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('creates the audit record and delivers with a valid signature', async () => {
    await emitQuoteRequested({
      client: { phone: '57300', name: 'Ana' },
      conversationId: CONVERSATION_ID,
      message: 'Quiero cotizar'
    });
    await flush();

    expect(mockPrisma.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'OUTBOUND', event: 'quote.requested', status: 'PENDING' })
      })
    );

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);

    const header = init.headers['X-Mudanzas-Signature'];
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    // Re-sign with the timestamp from the header to avoid clock-drift flakiness.
    const timestamp = Number(header.split(',')[0].split('=')[1]);
    expect(signPayload(init.body, SECRET, timestamp)).toBe(header);

    expect(mockPrisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED', attempts: 1, lastError: null })
      })
    );
  });

  it('emits a UUID event id and converts an unknown client name to empty string', async () => {
    await emitQuoteRequested({
      client: { phone: '57300', name: null },
      conversationId: CONVERSATION_ID,
      message: 'hola'
    });
    await flush();

    const auditCall = mockPrisma.webhookEvent.create.mock.calls[0][0];
    expect(auditCall.data.id).toMatch(UUID_V4);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(URL);
    const body = JSON.parse(init.body);
    expect(body.id).toBe(auditCall.data.id);
    expect(body.data.client.name).toBe('');
  });

  it('records a failed attempt and retries in the background', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true } as never);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await emitQuoteRequested({
      client: { phone: '57300', name: null },
      conversationId: CONVERSATION_ID,
      message: 'cotizar'
    });

    await jest.advanceTimersByTimeAsync(5_000);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockPrisma.webhookEvent.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', attempts: 1, lastError: 'network down' })
      })
    );
    expect(mockPrisma.webhookEvent.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED', attempts: 2 })
      })
    );
    errorSpy.mockRestore();
  });

  it('marks the event FAILED after the final attempt', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await emitQuoteRequested({
      client: { phone: '57300', name: null },
      conversationId: CONVERSATION_ID,
      message: 'cotizar'
    });

    for (const delay of [5_000, 25_000, 125_000, 625_000]) {
      await jest.advanceTimersByTimeAsync(delay);
    }

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(mockPrisma.webhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', attempts: 5, lastError: 'down' })
      })
    );
    errorSpy.mockRestore();
  });

  it('never throws when the delivery pipeline fails', async () => {
    mockPrisma.webhookEvent.create.mockRejectedValue(new Error('disk full'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      emitQuoteRequested({
        client: { phone: '57300', name: null },
        conversationId: CONVERSATION_ID,
        message: 'cotizar'
      })
    ).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
