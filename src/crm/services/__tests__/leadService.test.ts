import { prisma } from '../../../core/database/prisma';
import { listLeads, exportLeadsCsv, LeadQuery } from '../leadService';
import { AuthenticatedRequest } from '../../../core/auth/authMiddleware';

jest.mock('../../../core/database/prisma', () => ({
  prisma: {
    conversation: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    conversationStatusConfig: {
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  conversation: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  conversationStatusConfig: {
    findMany: jest.Mock;
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

const baseConversation = {
  id: 'conv-1',
  status: 'HUMAN_ACTIVE',
  businessStatus: 'PENDIENTE_COTIZACION',
  priority: 'HIGH',
  source: 'ADS',
  lastMessageAt: new Date('2026-09-20T15:30:00Z'),
  createdAt: new Date('2026-09-01T10:00:00Z'),
  client: {
    id: 'client-1',
    name: 'Juan Pérez',
    phone: '+5491155551234',
    createdAt: new Date('2026-09-01T10:00:00Z'),
  },
  assignedUser: { id: 'agent-1', name: 'Agent', role: 'AGENT' },
};

const FINAL_STATUS = [{ code: 'FINALIZADO', isFinal: true, isActive: true }];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.conversationStatusConfig.findMany.mockResolvedValue(FINAL_STATUS as never);
});

describe('leadService', () => {
  describe('listLeads', () => {
    it('returns conversation rows with client and assigned user for admin', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([baseConversation] as never);
      mockPrisma.conversation.count.mockResolvedValue(1 as never);

      const result = await listLeads({ page: 1, pageSize: 20 }, adminUser);

      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0].client.name).toBe('Juan Pérez');
      expect(result.data[0].client.phone).toBe('+5491155551234');
      expect(result.data[0].status).toBe('HUMAN_ACTIVE');
      expect(result.data[0].businessStatus).toBe('PENDIENTE_COTIZACION');
      expect(result.data[0].assignedUser?.name).toBe('Agent');
    });

    it('excludes final business statuses by default', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20 }, adminUser);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessStatus: { notIn: ['FINALIZADO'], not: null },
          }),
        })
      );
    });

    it('includes final conversations when includeFinal is set', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20, includeFinal: true }, adminUser);

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.businessStatus).toBeUndefined();
    });

    it('filters by businessStatus, conversationStatus, priority, source and date range', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads(
        {
          page: 1,
          pageSize: 20,
          businessStatus: 'EN_PROCESO',
          conversationStatus: 'HUMAN_ACTIVE',
          priority: 'HIGH',
          source: 'ADS',
          dateFrom: '2026-09-01',
          dateTo: '2026-09-30',
        },
        adminUser
      );

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.businessStatus).toBe('EN_PROCESO');
      expect(call.where.status).toBe('HUMAN_ACTIVE');
      expect(call.where.priority).toBe('HIGH');
      expect(call.where.source).toBe('ADS');
      expect(call.where.lastMessageAt.gte).toBeInstanceOf(Date);
      expect(call.where.lastMessageAt.lte).toBeInstanceOf(Date);
    });

    it('matches ORGANIC source against null', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20, source: 'ORGANIC' }, adminUser);

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.source).toBeNull();
    });

    it('searches by client name or phone', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20, search: 'Juan' }, adminUser);

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.client).toEqual({
        OR: [
          { name: { contains: 'Juan' } },
          { phone: { contains: 'Juan' } },
        ],
      });
    });

    it('restricts agents to their assigned conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20 }, agentUser);

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where.assignedUserId).toBe('agent-1');
    });

    it('orders by lastMessageAt desc', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([] as never);
      mockPrisma.conversation.count.mockResolvedValue(0 as never);

      await listLeads({ page: 1, pageSize: 20 }, adminUser);

      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual({ lastMessageAt: 'desc' });
    });
  });

  describe('exportLeadsCsv', () => {
    it('returns a CSV with headers and rows separated by semicolons', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([baseConversation] as never);

      const csv = await exportLeadsCsv({}, adminUser);

      expect(csv).toContain('Fecha último mensaje;Nombre;Teléfono;Estado;Gestión;Prioridad;Origen;Comercial');
      expect(csv).toContain('Juan Pérez');
      expect(csv).toContain('+5491155551234');
      expect(csv).toContain('HUMAN_ACTIVE');
      expect(csv).toContain('PENDIENTE_COTIZACION');
      expect(csv).toContain('Pauta');
      expect(csv).toContain('Agent');
    });

    it('escapes semicolons and quotes in cell values', async () => {
      const tricky = {
        ...baseConversation,
        client: { ...baseConversation.client, name: 'María "La Grande"; Pérez' },
      };
      mockPrisma.conversation.findMany.mockResolvedValue([tricky] as never);

      const csv = await exportLeadsCsv({}, adminUser);

      expect(csv).toContain('"María ""La Grande""; Pérez"');
    });
  });
});
