import { prisma } from '../../../core/database/prisma';
import { listLeads, LeadQuery } from '../leadService';
import { AuthenticatedRequest } from '../../../core/auth/authMiddleware';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    client: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  client: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

const adminUser: AuthenticatedRequest['user'] = {
  id: 'admin-1',
  role: 'ADMIN',
  name: 'Admin',
};

const agentUser: AuthenticatedRequest['user'] = {
  id: 'agent-1',
  role: 'AGENT',
  name: 'Agent',
};

const baseClient = {
  id: 'client-1',
  name: 'Juan Pérez',
  phone: '+5491155551234',
  createdAt: new Date('2026-09-01'),
  conversations: [
    {
      id: 'conv-1',
      status: 'ACTIVE',
      businessStatus: 'PENDIENTE_COTIZACION',
      priority: 'MEDIUM',
      lastMessageAt: new Date('2026-09-20'),
      assignedUser: { id: 'agent-1', name: 'Agent', role: 'AGENT' },
    },
  ],
  quotes: [
    {
      id: 'quote-1',
      origin: 'Buenos Aires',
      destination: 'Córdoba',
      volume: 20,
      price: 150000,
      status: 'PENDING',
      updatedAt: new Date('2026-09-19'),
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('leadService', () => {
  describe('listLeads', () => {
    it('returns paginated leads for admin', async () => {
      mockPrisma.client.findMany.mockResolvedValue([baseClient]);
      mockPrisma.client.count.mockResolvedValue(1);

      const result = await listLeads({ page: 1, pageSize: 20 }, adminUser);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.data[0].client.name).toBe('Juan Pérez');
      expect(result.data[0].hasQuote).toBe(true);
      expect(result.data[0].quote?.origin).toBe('Buenos Aires');
    });

    it('filters by businessStatus', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20, businessStatus: 'PENDIENTE_COTIZACION' }, adminUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversations: { some: { businessStatus: 'PENDIENTE_COTIZACION' } },
          }),
        })
      );
    });

    it('filters by hasQuote=true', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20, hasQuote: true }, adminUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quotes: { some: {} },
          }),
        })
      );
    });

    it('filters by hasQuote=false', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20, hasQuote: false }, adminUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quotes: { none: {} },
          }),
        })
      );
    });

    it('searches by name or phone', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20, search: 'Juan' }, adminUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Juan', mode: 'insensitive' } },
              { phone: { contains: 'Juan' } },
            ],
          }),
        })
      );
    });

    it('restricts agent to assigned conversations only', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20 }, agentUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            conversations: expect.objectContaining({
              where: expect.objectContaining({
                assignedUserId: 'agent-1',
              }),
            }),
          }),
        })
      );
    });

    it('restricts agent to clients with at least one assigned conversation', async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);

      await listLeads({ page: 1, pageSize: 20 }, agentUser);

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversations: {
              some: expect.objectContaining({
                assignedUserId: 'agent-1',
              }),
            },
          }),
        })
      );
      expect(mockPrisma.client.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversations: {
              some: expect.objectContaining({
                assignedUserId: 'agent-1',
              }),
            },
          }),
        })
      );
    });

    it('returns client without quote when hasQuote=false', async () => {
      const clientNoQuote = {
        ...baseClient,
        quotes: [],
      };
      mockPrisma.client.findMany.mockResolvedValue([clientNoQuote]);
      mockPrisma.client.count.mockResolvedValue(1);

      const result = await listLeads({ page: 1, pageSize: 20 }, adminUser);

      expect(result.data[0].hasQuote).toBe(false);
      expect(result.data[0].quote).toBeNull();
    });

    it('returns client without conversation when none active', async () => {
      const clientNoConv = {
        ...baseClient,
        conversations: [],
      };
      mockPrisma.client.findMany.mockResolvedValue([clientNoConv]);
      mockPrisma.client.count.mockResolvedValue(1);

      const result = await listLeads({ page: 1, pageSize: 20 }, adminUser);

      expect(result.data[0].conversation).toBeNull();
    });
  });
});