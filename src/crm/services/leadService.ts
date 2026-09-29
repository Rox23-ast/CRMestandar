import { prisma } from '../../core/database/prisma';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';

export interface LeadQuery {
  page?: number;
  pageSize?: number;
  businessStatus?: string;
  conversationStatus?: string;
  priority?: string;
  assignedUserId?: string;
  source?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  includeFinal?: boolean;
}

export interface LeadRow {
  id: string;
  client: {
    id: string;
    name: string | null;
    phone: string;
    createdAt: Date;
  };
  status: string;
  businessStatus: string | null;
  priority: string;
  source: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  assignedUser: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface PaginatedLeads {
  data: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MARKETING_ROLE = 'MARKETING_DIRECTOR';
const ADMIN_ROLE = 'ADMIN';

export const MAX_EXPORT_ROWS = 10000;

function canSeeAll(user: AuthenticatedRequest['user']): boolean {
  return user?.role === ADMIN_ROLE || user?.role === MARKETING_ROLE;
}

const buildConversationWhere = async (
  query: LeadQuery,
  user: AuthenticatedRequest['user']
): Promise<Record<string, unknown>> => {
  const where: any = {};

  if (!canSeeAll(user)) {
    where.assignedUserId = user?.id;
  } else if (query.assignedUserId) {
    where.assignedUserId = query.assignedUserId;
  }

  if (query.conversationStatus) where.status = query.conversationStatus;
  if (query.priority) where.priority = query.priority;
  if (query.source === 'ADS') where.source = 'ADS';
  if (query.source === 'ORGANIC') where.source = null;

  if (query.dateFrom || query.dateTo) {
    where.lastMessageAt = {};
    if (query.dateFrom) where.lastMessageAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
    if (query.dateTo) where.lastMessageAt.lte = new Date(`${query.dateTo}T23:59:59.999Z`);
  }

  if (query.search) {
    where.client = {
      OR: [
        { name: { contains: query.search } },
        { phone: { contains: query.search } }
      ]
    };
  }

  // Sin filtro de gestión explícito, se excluyen los estados finales salvo
  // que se pida incluirlos (mismo comportamiento que la bandeja CRM).
  if (!query.businessStatus && !query.includeFinal) {
    const finalStatuses = await prisma.conversationStatusConfig.findMany({
      where: { isFinal: true, isActive: true }
    });
    const finalCodes = finalStatuses.map((status) => status.code);
    if (finalCodes.length > 0) {
      where.businessStatus = { notIn: finalCodes, not: null };
    }
  } else if (query.businessStatus) {
    where.businessStatus = query.businessStatus;
  }

  return where;
};

const toLeadRow = (conversation: any): LeadRow => ({
  id: conversation.id,
  client: {
    id: conversation.client.id,
    name: conversation.client.name,
    phone: conversation.client.phone,
    createdAt: conversation.client.createdAt
  },
  status: conversation.status,
  businessStatus: conversation.businessStatus,
  priority: conversation.priority,
  source: conversation.source,
  lastMessageAt: conversation.lastMessageAt,
  createdAt: conversation.createdAt,
  assignedUser: conversation.assignedUser
    ? {
        id: conversation.assignedUser.id,
        name: conversation.assignedUser.name,
        role: conversation.assignedUser.role
      }
    : null
});

const CONVERSATION_INCLUDE = {
  client: { select: { id: true, name: true, phone: true, createdAt: true } },
  assignedUser: { select: { id: true, name: true, role: true } }
};

export async function listLeads(
  query: LeadQuery,
  user: AuthenticatedRequest['user']
): Promise<PaginatedLeads> {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 50, 500);
  const skip = (page - 1) * pageSize;
  const where = await buildConversationWhere(query, user);

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.conversation.count({ where })
  ]);

  return {
    data: conversations.map(toLeadRow),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

const escapeCsvCell = (value: string) =>
  /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const formatDateTime = (date: Date) => {
  const parts = new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};

export async function exportLeadsCsv(
  query: LeadQuery,
  user: AuthenticatedRequest['user']
): Promise<string> {
  const where = await buildConversationWhere(query, user);
  const conversations = await prisma.conversation.findMany({
    where,
    include: CONVERSATION_INCLUDE,
    orderBy: { lastMessageAt: 'desc' },
    take: MAX_EXPORT_ROWS
  });

  const rows: string[][] = [
    ['Fecha último mensaje', 'Nombre', 'Teléfono', 'Estado', 'Gestión', 'Prioridad', 'Origen', 'Comercial'],
    ...conversations.map((conversation) => {
      const row = toLeadRow(conversation);
      return [
        formatDateTime(row.lastMessageAt),
        row.client.name ?? '',
        row.client.phone,
        row.status,
        row.businessStatus ?? '',
        row.priority,
        row.source === 'ADS' ? 'Pauta' : 'Orgánico',
        row.assignedUser?.name ?? ''
      ];
    })
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');
}
