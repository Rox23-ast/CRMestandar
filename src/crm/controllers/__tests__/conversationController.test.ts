import { Response } from 'express';
import { statusSchema, listAssignableUsers, sendAgentAttachment, startConversation, getMedia, updateConversationClient, listConversations, getConversation } from '../conversationController';
import { prisma } from '../../../core/database/prisma';
import { recordOutboundMessage } from '../../services/conversationService';
import { uploadWhatsAppMedia, sendWhatsAppMedia, sendWhatsAppMessage, getWhatsAppMedia, downloadWhatsAppMedia } from '../../../bot/services/whatsappService';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    conversation: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    client: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    notification: { findMany: jest.fn(), updateMany: jest.fn() },
    conversationStatusConfig: { findMany: jest.fn() }
  }
}));

jest.mock('../../services/conversationService', () => ({
  recordOutboundMessage: jest.fn()
}));

jest.mock('../../../bot/services/whatsappService', () => ({
  uploadWhatsAppMedia: jest.fn(),
  sendWhatsAppMedia: jest.fn(),
  sendWhatsAppMessage: jest.fn(),
  getWhatsAppMedia: jest.fn(),
  downloadWhatsAppMedia: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
  conversation: { findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  client: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock };
  notification: { findMany: jest.Mock; updateMany: jest.Mock };
  conversationStatusConfig: { findMany: jest.Mock };
};
const mockRecordOutbound = recordOutboundMessage as jest.Mock;
const mockUploadMedia = uploadWhatsAppMedia as jest.Mock;
const mockSendMedia = sendWhatsAppMedia as jest.Mock;
const mockSendWhatsApp = sendWhatsAppMessage as jest.Mock;
const mockGetMedia = getWhatsAppMedia as jest.Mock;
const mockDownloadMedia = downloadWhatsAppMedia as jest.Mock;

describe('conversationController - statusSchema', () => {
  it('accepts a businessStatus-only update (panel dropdown)', () => {
    const result = statusSchema.safeParse({ businessStatus: 'EN_PROCESO' });
    expect(result.success).toBe(true);
  });

  it('accepts a full status update', () => {
    const result = statusSchema.safeParse({
      status: 'HUMAN_ACTIVE',
      priority: 'HIGH',
      businessStatus: 'PENDIENTE_COTIZACION'
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown conversation status', () => {
    const result = statusSchema.safeParse({ status: 'NOPE' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty payload', () => {
    const result = statusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('conversationController - listAssignableUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only active AGENT and MARKETING_DIRECTOR users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-1', name: 'Ana Agente', role: 'AGENT' },
      { id: 'u-2', name: 'Directora Marketing', role: 'MARKETING_DIRECTOR' }
    ] as never);

    const res = {
      json: jest.fn().mockReturnValue({}),
      status: jest.fn().mockReturnThis()
    } as unknown as Response;

    await listAssignableUsers({} as never, res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, role: { in: ['AGENT', 'MARKETING_DIRECTOR'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' }
    });
    expect(res.json).toHaveBeenCalledWith([
      { id: 'u-1', name: 'Ana Agente', role: 'AGENT' },
      { id: 'u-2', name: 'Directora Marketing', role: 'MARKETING_DIRECTOR' }
    ]);
  });
});

describe('conversationController - sendAgentAttachment', () => {
  const CONVERSATION_ID = '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60';
  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: { id: 'admin-1', role: 'ADMIN' },
    params: { id: CONVERSATION_ID },
    query: { type: 'document', mediaType: 'application/pdf', filename: 'cotizacion.pdf', caption: 'Adjunto' },
    body: Buffer.from('contenido-del-archivo'),
    ...overrides
  }) as never;
  const makeRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, clientId: 'client-1', assignedUserId: null } as never);
    mockPrisma.conversation.update.mockResolvedValue({} as never);
    mockPrisma.client.findUnique.mockResolvedValue({ id: 'client-1', phone: '573001112233' } as never);
    mockUploadMedia.mockResolvedValue({ id: 'media-1' } as never);
    mockSendMedia.mockResolvedValue(true as never);
    mockRecordOutbound.mockResolvedValue({ id: 'msg-1' } as never);
  });

  it('uploads the file, sends it as a document and records the outbound message', async () => {
    const res = makeRes();
    await sendAgentAttachment(makeReq(), res);

    expect(mockUploadMedia).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
      'cotizacion.pdf'
    );
    expect(mockSendMedia).toHaveBeenCalledWith(
      '573001112233',
      'document',
      'media-1',
      'Adjunto',
      'cotizacion.pdf'
    );
    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DOCUMENT',
        mediaId: 'media-1',
        senderType: 'AGENT',
        deliveryStatus: 'SENT'
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects an empty body', async () => {
    const res = makeRes();
    await sendAgentAttachment(makeReq({ body: Buffer.alloc(0) }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('returns 502 when Meta rejects the upload', async () => {
    mockUploadMedia.mockResolvedValue({ id: null, error: 'Unsupported file type' } as never);
    const res = makeRes();

    await sendAgentAttachment(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  it('records FAILED and returns 502 when the media message fails', async () => {
    mockSendMedia.mockResolvedValue(false as never);
    const res = makeRes();

    await sendAgentAttachment(makeReq(), res);

    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryStatus: 'FAILED' })
    );
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('rejects images larger than 5 MB (413)', async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'image', mediaType: 'image/jpeg', filename: 'big.jpg' }, body: bigBuffer }), res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('rejects videos larger than 16 MB (413)', async () => {
    const bigBuffer = Buffer.alloc(17 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'video', mediaType: 'video/mp4', filename: 'big.mp4' }, body: bigBuffer }), res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('rejects audio larger than 16 MB (413)', async () => {
    const bigBuffer = Buffer.alloc(17 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'audio', mediaType: 'audio/ogg', filename: 'big.ogg' }, body: bigBuffer }), res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('rejects documents larger than 60 MB (413)', async () => {
    const bigBuffer = Buffer.alloc(61 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'document', mediaType: 'application/pdf', filename: 'big.pdf' }, body: bigBuffer }), res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('accepts images under 5 MB', async () => {
    const buffer = Buffer.alloc(5 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'image', mediaType: 'image/png', filename: 'ok.png' }, body: buffer }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockUploadMedia).toHaveBeenCalled();
  });

  it('accepts videos under 16 MB', async () => {
    const buffer = Buffer.alloc(16 * 1024 * 1024);
    const res = makeRes();

    await sendAgentAttachment(makeReq({ query: { type: 'video', mediaType: 'video/mp4', filename: 'ok.mp4' }, body: buffer }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockUploadMedia).toHaveBeenCalled();
  });
});

describe('conversationController - updateConversationClient', () => {
  const CONVERSATION_ID = '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60';
  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: { id: 'agent-1', role: 'AGENT' },
    params: { id: CONVERSATION_ID },
    body: { name: 'Carlos Gómez' },
    ...overrides
  }) as never;
  const makeRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, clientId: 'client-1', assignedUserId: 'agent-1' } as never);
    mockPrisma.client.update.mockResolvedValue({ id: 'client-1', phone: '573001112233', name: 'Carlos Gómez' } as never);
  });

  it('updates the client name of the conversation', async () => {
    const res = makeRes();
    await updateConversationClient(makeReq(), res);

    expect(mockPrisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { name: 'Carlos Gómez' }
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'client-1', name: 'Carlos Gómez' })
    );
  });

  it('clears the client name when null is sent', async () => {
    const res = makeRes();
    await updateConversationClient(makeReq({ body: { name: null } }), res);

    expect(mockPrisma.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { name: null }
    });
  });

  it('rejects an empty name (400)', async () => {
    const res = makeRes();
    await updateConversationClient(makeReq({ body: { name: '   ' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.client.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the conversation does not exist', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null as never);
    const res = makeRes();
    await updateConversationClient(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when an agent is not assigned to the conversation', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, clientId: 'client-1', assignedUserId: 'other-agent' } as never);
    const res = makeRes();
    await updateConversationClient(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.client.update).not.toHaveBeenCalled();
  });

  it('allows ADMIN and MARKETING_DIRECTOR to edit any conversation', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, clientId: 'client-1', assignedUserId: 'other-agent' } as never);
    const res = makeRes();
    await updateConversationClient(makeReq({ user: { id: 'admin-1', role: 'ADMIN' } }), res);

    expect(res.json).toHaveBeenCalled();
    expect(mockPrisma.client.update).toHaveBeenCalled();
  });
});

describe('conversationController - listConversations', () => {
  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: { id: 'agent-1', role: 'AGENT' },
    query: { page: '1', pageSize: '50', includeFinal: 'true' },
    ...overrides
  }) as never;
  const makeRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns unread conversations first with the unread flag', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([{ conversationId: 'conv-unread' }] as never);
    mockPrisma.conversation.findMany
      .mockResolvedValueOnce([{ id: 'conv-unread' }] as never)
      .mockResolvedValueOnce([{ id: 'conv-read-1' }, { id: 'conv-read-2' }] as never);
    mockPrisma.conversation.count.mockResolvedValue(3 as never);

    const res = makeRes();
    await listConversations(makeReq(), res);

    expect(mockPrisma.conversation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['conv-unread'] } }), take: 50 })
    );
    expect(mockPrisma.conversation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ['conv-unread'] } }), skip: 0, take: 50 })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ id: 'conv-unread', unread: true }),
          expect.objectContaining({ id: 'conv-read-1', unread: false }),
          expect.objectContaining({ id: 'conv-read-2', unread: false })
        ],
        unreadCount: expect.any(Number)
      })
    );
  });

  it('keeps the standard ordering when nothing is unread', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([] as never);
    mockPrisma.conversation.findMany.mockResolvedValueOnce([{ id: 'conv-1' }] as never);
    mockPrisma.conversation.count.mockResolvedValue(1 as never);

    const res = makeRes();
    await listConversations(makeReq(), res);

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ unreadCount: 0 })
    );
  });
});

describe('conversationController - getConversation', () => {
  const CONVERSATION_ID = '7d3e8f1a-2b4c-4d5e-9f0a-1b2c3d4e5f60';
  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: { id: 'admin-1', role: 'ADMIN' },
    params: { id: CONVERSATION_ID },
    ...overrides
  }) as never;
  const makeRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the conversation notifications as read when opened', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({ id: CONVERSATION_ID, assignedUserId: null, assignedRole: 'MARKETING_DIRECTOR' } as never);
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = makeRes();
    await getConversation(makeReq(), res);

    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: CONVERSATION_ID, readAt: null }),
        data: { readAt: expect.any(Date) }
      })
    );
    expect(res.json).toHaveBeenCalled();
  });
});

describe('conversationController - startConversation', () => {
  const makeReq = (overrides: Record<string, unknown> = {}) => ({
    user: { id: 'agent-1', role: 'AGENT' },
    body: { phone: '573001112233', body: 'Hola, soy de Mudanzas Chico' },
    ...overrides
  }) as never;
  const makeRes = () => {
    const res = {
      status: jest.fn(),
      json: jest.fn()
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.client.upsert.mockResolvedValue({ id: 'client-1', phone: '573001112233' } as never);
    mockPrisma.conversation.findFirst.mockResolvedValue(null as never);
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-new', clientId: 'client-1', status: 'HUMAN_ACTIVE' } as never);
    mockPrisma.conversation.update.mockResolvedValue({} as never);
    mockSendWhatsApp.mockResolvedValue(true as never);
    mockRecordOutbound.mockResolvedValue({ id: 'msg-1' } as never);
  });

  it('creates the conversation, sends the first message and records it', async () => {
    const res = makeRes();
    await startConversation(makeReq(), res);

    expect(mockPrisma.client.upsert).toHaveBeenCalledWith({
      where: { phone: '573001112233' },
      update: {},
      create: { phone: '573001112233' }
    });
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: 'client-1',
        status: 'HUMAN_ACTIVE',
        assignedUserId: 'agent-1'
      })
    });
    expect(mockSendWhatsApp).toHaveBeenCalledWith('573001112233', 'Hola, soy de Mudanzas Chico');
    expect(mockRecordOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-new', senderType: 'AGENT', deliveryStatus: 'SENT' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects an invalid phone (400)', async () => {
    const res = makeRes();
    await startConversation(makeReq({ body: { phone: 'abc', body: 'Hola' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  it('returns 502 with the 24h-window detail when WhatsApp rejects the send', async () => {
    mockSendWhatsApp.mockResolvedValue(false as never);
    const res = makeRes();

    await startConversation(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining('plantilla')
      })
    );
  });
});

describe('conversationController - getMedia', () => {
  const makeReq = (params: Record<string, unknown> = {}) => ({
    user: { id: 'agent-1', role: 'AGENT' },
    params,
    ...{}
  }) as never;
  const makeRes = () => {
    const res = {
      set: jest.fn(),
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn()
    };
    res.set.mockReturnValue(res);
    res.send.mockReturnValue(res);
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as unknown as Response & { set: jest.Mock; send: jest.Mock; status: jest.Mock; json: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams the media binary with its mime type', async () => {
    mockGetMedia.mockResolvedValue({ url: 'https://cdn.meta.example/1', mimeType: 'image/jpeg' } as never);
    mockDownloadMedia.mockResolvedValue(Buffer.from('JPEGDATA') as never);

    const res = makeRes();
    await getMedia(makeReq({ id: '1022489778123456' }), res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('JPEGDATA'));
  });

  it('returns 404 when the media id cannot be resolved', async () => {
    mockGetMedia.mockResolvedValue(null as never);

    const res = makeRes();
    await getMedia(makeReq({ id: 'no-existe' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for an invalid media id', async () => {
    const res = makeRes();
    await getMedia(makeReq({ id: 'no válido!!' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
