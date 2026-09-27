import { prisma } from '../../core/database/prisma';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';

export interface LeadQuery {
  page?: number;
  pageSize?: number;
  businessStatus?: string;
  hasQuote?: boolean;
  search?: string;
}

export interface LeadClient {
  id: string;
  name: string | null;
  phone: string;
  createdAt: Date;
}

export interface LeadConversation {
  id: string;
  status: string;
  businessStatus: string | null;
  priority: string;
  lastMessageAt: Date;
  assignedUser: {
    id: string;
    name: string;
    role: string;
  } | null;
}

export interface LeadQuote {
  id: string;
  origin: string;
  destination: string;
  volume: number | null;
  price: number | null;
  status: string;
  updatedAt: Date;
}

export interface Lead {
  client: LeadClient;
  conversation: LeadConversation | null;
  quote: LeadQuote | null;
  hasQuote: boolean;
}

export interface PaginatedLeads {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MARKETING_ROLE = 'MARKETING_DIRECTOR';
const ADMIN_ROLE = 'ADMIN';

function canSeeAll(user: AuthenticatedRequest['user']): boolean {
  return user?.role === ADMIN_ROLE || user?.role === MARKETING_ROLE;
}

export async function listLeads(query: LeadQuery, user: AuthenticatedRequest['user']): Promise<PaginatedLeads> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const isAdminOrMarketing = canSeeAll(user);

  const clientWhere: any = {};

  if (query.search) {
    clientWhere.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search } },
    ];
  }

  const someConversation: any = {};
  if (!isAdminOrMarketing) {
    someConversation.assignedUserId = user?.id;
    someConversation.businessStatus = { notIn: ['FINALIZADO'], not: null };
  }
  if (query.businessStatus) {
    someConversation.businessStatus = query.businessStatus;
  }
  if (query.businessStatus) {
    clientWhere.conversations = { some: someConversation };
  } else if (!isAdminOrMarketing) {
    // Agents see their assigned conversations plus every web-born lead
    // (quotes created in the cotizador web, which have no conversation).
    clientWhere.OR = [
      {
        conversations: {
          some: { assignedUserId: user?.id, businessStatus: { notIn: ['FINALIZADO'], not: null } }
        }
      },
      { quotes: { some: { source: 'WEB' } } }
    ];
  }

  const hasQuoteFilter = query.hasQuote !== undefined;
  if (hasQuoteFilter) {
    if (query.hasQuote) {
      clientWhere.quotes = { some: {} };
    } else {
      clientWhere.quotes = { none: {} };
    }
  }

  const conversationWhere: any = {
    businessStatus: { notIn: ['FINALIZADO'], not: null },
  };

  if (!isAdminOrMarketing) {
    conversationWhere.assignedUserId = user?.id;
  }

  const clients = await prisma.client.findMany({
    where: clientWhere,
    include: {
      conversations: {
        where: conversationWhere,
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
        include: {
          assignedUser: { select: { id: true, name: true, role: true } },
        },
      },
      quotes: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    skip,
    take: pageSize,
  });

  const total = await prisma.client.count({ where: clientWhere });

  const data: Lead[] = clients.map((c) => {
    const conv = c.conversations[0] ?? null;
    const quote = c.quotes[0] ?? null;

    return {
      client: {
        id: c.id,
        name: c.name,
        phone: c.phone,
        createdAt: c.createdAt,
      },
      conversation: conv
        ? {
            id: conv.id,
            status: conv.status,
            businessStatus: conv.businessStatus,
            priority: conv.priority,
            lastMessageAt: conv.lastMessageAt,
            assignedUser: conv.assignedUser
              ? { id: conv.assignedUser.id, name: conv.assignedUser.name, role: conv.assignedUser.role }
              : null,
          }
        : null,
      quote: quote
        ? {
            id: quote.id,
            origin: quote.origin,
            destination: quote.destination,
            volume: quote.volume,
            price: quote.price,
            status: quote.status,
            updatedAt: quote.updatedAt,
          }
        : null,
      hasQuote: !!quote,
    };
  });

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}