import { Response } from 'express';
import { statusSchema, listAssignableUsers } from '../conversationController';
import { prisma } from '../../../core/database/prisma';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn() }
  }
}));

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
};

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
