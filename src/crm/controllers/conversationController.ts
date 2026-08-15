import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { prisma } from '../../core/database/prisma';
import { sendWhatsAppMessage } from '../../bot/services/whatsappService';
import {
  manuallyAssignConversation,
  recordOutboundMessage,
  returnConversationToBot,
  takeConversation
} from '../services/conversationService';
import { subscribeToCrmEvents } from '../services/eventStream';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedUserId: z.string().optional()
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4096)
});

const assignmentSchema = z.object({
  userId: z.string().uuid()
});

const statusSchema = z.object({
  status: z.enum(['NEW', 'BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']),
  priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional()
});

const slaSchema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(10080),
  followUpMinutes: z.number().int().min(1).max(43200)
});

const businessHoursSchema = z.object({
  timezone: z.string().min(1).max(100),
  weeklySchedule: z.record(z.string(), z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).nullable())
});

const problem = (res: Response, status: number, title: string, detail?: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    ...(detail ? { detail } : {})
  });

const canSeeAllConversations = (role: string) => ['ADMIN', 'MARKETING_DIRECTOR'].includes(role);

export const listConversations = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || !req.user) {
    return problem(res, 400, 'Invalid conversation filters');
  }

  const { page, pageSize, status, priority, assignedUserId } = parsed.data;
  const userFilter = canSeeAllConversations(req.user.role)
    ? {}
    : { OR: [{ assignedUserId: req.user.id }, { assignedUserId: null, assignedRole: 'MARKETING_DIRECTOR' }] };
  const where = {
    ...userFilter,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignedUserId ? { assignedUserId } : {})
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        client: { select: { id: true, phone: true, name: true } },
        assignedUser: { select: { id: true, name: true, role: true } }
      },
      orderBy: [{ priority: 'asc' }, { lastMessageAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.conversation.count({ where })
  ]);

  return res.json({ data: conversations, pagination: { page, pageSize, total } });
};

export const getConversation = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const conversationId = String(req.params.id);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      client: true,
      assignedUser: { select: { id: true, name: true, role: true } },
      messages: { orderBy: { createdAt: 'asc' } },
      assignments: { orderBy: { assignedAt: 'desc' }, include: { assignedUser: { select: { id: true, name: true } } } },
      auditEvents: { orderBy: { createdAt: 'desc' } }
    }
  });

  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Insufficient permissions');
  }

  return res.json(conversation);
};

export const claimConversation = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const conversationId = String(req.params.id);

  try {
    const conversation = await takeConversation(conversationId, req.user.id);
    return res.json(conversation);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'CONVERSATION_NOT_FOUND') return problem(res, 404, 'Conversation not found');
    if (code === 'CONVERSATION_ALREADY_ASSIGNED') return problem(res, 409, 'Conversation is assigned to another agent');
    if (code === 'USER_NOT_ALLOWED') return problem(res, 403, 'Insufficient permissions');
    return problem(res, 500, 'Unable to claim conversation');
  }
};

export const reactivateBot = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const conversationId = String(req.params.id);

  try {
    return res.json(await returnConversationToBot(conversationId, req.user.id));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'CONVERSATION_NOT_FOUND') return problem(res, 404, 'Conversation not found');
    if (code === 'USER_NOT_ALLOWED') return problem(res, 403, 'Only the assigned agent can reactivate the bot');
    return problem(res, 500, 'Unable to reactivate bot');
  }
};

export const assignConversation = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const conversationId = String(req.params.id);
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Invalid assignment request');

  try {
    const conversation = await manuallyAssignConversation(conversationId, parsed.data.userId, req.user.id);
    return res.json(conversation);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'TARGET_USER_NOT_ALLOWED') return problem(res, 400, 'Target user cannot receive conversations');
    return problem(res, 500, 'Unable to assign conversation');
  }
};

export const updateConversationStatus = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Conversation status data is invalid');
  const conversationId = String(req.params.id);
  const current = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!current) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && current.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const conversation = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: parsed.data.status,
        priority: parsed.data.priority,
        nextFollowUpAt: parsed.data.nextFollowUpAt === undefined
          ? undefined
          : parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null
      }
    });
    await tx.auditEvent.create({
      data: {
        conversationId,
        actorUserId: req.user?.id,
        eventType: 'CONVERSATION_STATUS_UPDATED',
        payload: JSON.stringify(parsed.data)
      }
    });
    return updated;
  });
  return res.json(conversation);
};

export const getSlaPolicy = async (_req: AuthenticatedRequest, res: Response) => {
  const policy = await prisma.slaPolicy.findUnique({ where: { id: 'default' } });
  return res.json(policy ?? { id: 'default', firstResponseMinutes: 15, followUpMinutes: 1440 });
};

export const updateSlaPolicy = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = slaSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'SLA data is invalid');
  const policy = await prisma.slaPolicy.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...parsed.data },
    update: parsed.data
  });
  return res.json(policy);
};

export const getBusinessHours = async (_req: AuthenticatedRequest, res: Response) => {
  const config = await prisma.businessHoursConfig.findUnique({ where: { id: 'default' } });
  return res.json({
    timezone: config?.timezone ?? 'America/Bogota',
    weeklySchedule: config ? JSON.parse(config.weeklySchedule) : {}
  });
};

export const updateBusinessHours = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = businessHoursSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Business-hours data is invalid');
  const config = await prisma.businessHoursConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', timezone: parsed.data.timezone, weeklySchedule: JSON.stringify(parsed.data.weeklySchedule) },
    update: { timezone: parsed.data.timezone, weeklySchedule: JSON.stringify(parsed.data.weeklySchedule) }
  });
  return res.json({ timezone: config.timezone, weeklySchedule: JSON.parse(config.weeklySchedule) });
};

export const sendAgentMessage = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const conversationId = String(req.params.id);
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Message body is invalid');

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  });
  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const client = await prisma.client.findUnique({ where: { id: conversation.clientId } });
  if (!client) return problem(res, 404, 'Conversation client not found');

  const sent = await sendWhatsAppMessage(client.phone, parsed.data.body);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'HUMAN_ACTIVE' }
  });
  const message = await recordOutboundMessage({
    conversationId: conversation.id,
    body: parsed.data.body,
    senderType: 'AGENT',
    deliveryStatus: sent ? 'SENT' : 'FAILED'
  });

  if (!sent) return problem(res, 502, 'WhatsApp message could not be sent');
  return res.status(201).json(message);
};

export const listNotifications = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const notifications = await prisma.notification.findMany({
    where: {
      OR: [
        { userId: req.user.id },
        { role: req.user.role }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  return res.json(notifications);
};

export const markNotificationRead = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const notificationId = String(req.params.id);
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      OR: [{ userId: req.user.id }, { role: req.user.role }]
    },
    data: { readAt: new Date() }
  });
  if (result.count === 0) return problem(res, 404, 'Notification not found');
  return res.status(204).send();
};

export const streamCrmEvents = (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  const unsubscribe = subscribeToCrmEvents((event, data) => {
    const notification = data as { userId?: string | null; role?: string | null };
    if (notification.userId !== req.user?.id && notification.role !== req.user?.role) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
