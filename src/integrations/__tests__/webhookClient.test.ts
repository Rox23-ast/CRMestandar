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
      conversationId: 'conv-1',
      message: 'hola'
    });

    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('creates the audit record and delivers with a valid signature', async () => {
    await emitQuoteRequested({
      client: { phone: '57300', name: 'Ana' },
      conversationId: 'conv-1',
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
    expect(signPayload(init.body, SECRET)).toBe(header);

    expect(mockPrisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED', attempts: 1, lastError: null })
      })
    );
  });

  it('records a failed attempt and retries in the background', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true } as never);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await emitQuoteRequested({
      client: { phone: '57300', name: null },
      conversationId: 'conv-1',
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
      conversationId: 'conv-1',
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
        conversationId: 'conv-1',
        message: 'cotizar'
      })
    ).resolves.toBeUndefined();

    expect(global.fetch).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
