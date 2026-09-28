import { Response } from 'express';
import { listQuickReplies, createQuickReply, deleteQuickReply } from '../quickReplyController';
import { prisma } from '../../../core/database/prisma';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    quickReply: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() }
  }
}));

const mockPrisma = prisma as unknown as {
  quickReply: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
};

const makeRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock; send: jest.Mock };
};

describe('quickReplyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists quick replies ordered by label', async () => {
    mockPrisma.quickReply.findMany.mockResolvedValue([{ id: 'r-1', label: 'saludo', text: 'Hola' }] as never);

    const res = makeRes();
    await listQuickReplies({} as never, res);

    expect(mockPrisma.quickReply.findMany).toHaveBeenCalledWith({ orderBy: { label: 'asc' } });
    expect(res.json).toHaveBeenCalledWith([{ id: 'r-1', label: 'saludo', text: 'Hola' }]);
  });

  it('creates a quick reply with valid data', async () => {
    mockPrisma.quickReply.create.mockResolvedValue({ id: 'r-2', label: 'precio', text: 'Te comparto el precio' } as never);

    const res = makeRes();
    await createQuickReply({ body: { label: 'precio', text: 'Te comparto el precio' } } as never, res);

    expect(mockPrisma.quickReply.create).toHaveBeenCalledWith({
      data: { label: 'precio', text: 'Te comparto el precio' }
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects invalid quick reply data (400)', async () => {
    const res = makeRes();
    await createQuickReply({ body: { label: '', text: '' } } as never, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.quickReply.create).not.toHaveBeenCalled();
  });

  it('returns 409 on duplicate label', async () => {
    mockPrisma.quickReply.create.mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`label`)') as never
    );

    const res = makeRes();
    await createQuickReply({ body: { label: 'saludo', text: 'Hola' } } as never, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('deletes a quick reply', async () => {
    mockPrisma.quickReply.delete.mockResolvedValue({} as never);

    const res = makeRes();
    await deleteQuickReply({ params: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' } } as never, res);

    expect(mockPrisma.quickReply.delete).toHaveBeenCalledWith({
      where: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
