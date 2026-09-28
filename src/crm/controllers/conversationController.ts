import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { prisma } from '../../core/database/prisma';
import { sendWhatsAppMessage, sendWhatsAppDocument, uploadWhatsAppMedia, sendWhatsAppMedia, getWhatsAppMedia, downloadWhatsAppMedia, WhatsAppMediaType } from '../../bot/services/whatsappService';
import {
  DEFAULT_WEEKLY_SCHEDULE,
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
  assignedUserId: z.string().uuid().optional(),
  businessStatus: z.string().optional(),
  source: z.enum(['ADS', 'ORGANIC']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  includeFinal: z.coerce.boolean().optional()
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4096)
});

const startConversationSchema = z.object({
  phone: z.string().trim().regex(/^\+?\d{7,20}$/, 'Phone must be digits with optional +'),
  body: z.string().trim().min(1).max(4096)
});

const mediaIdSchema = z.string().regex(/^[\w.-]{5,200}$/, 'Media ID is invalid');

const assignmentSchema = z.object({
  userId: z.string().uuid()
});

const attachmentQuerySchema = z.object({
  type: z.enum(['image', 'audio', 'video', 'document']),
  mediaType: z.string().min(1).max(100).optional().default('application/octet-stream'),
  filename: z.string().min(1).max(200).optional().default('archivo'),
  caption: z.string().max(4096).optional()
});

const statusConfigCreateSchema = z.object({
  label: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#64748b'),
  isFinal: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional().default(0)
});

const statusConfigUpdateSchema = z.object({
  id: z.string().uuid()
});

const statusConfigDeleteSchema = z.object({
  id: z.string().uuid()
});

export const statusSchema = z.object({
  // status es opcional: el panel también usa este endpoint para actualizar
  // solo el estado de gestión (businessStatus).
  status: z.enum(['NEW', 'BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  businessStatus: z.string().optional()
}).refine(
  (data) =>
    data.status !== undefined ||
    data.priority !== undefined ||
    data.nextFollowUpAt !== undefined ||
    data.businessStatus !== undefined,
  { message: 'At least one field is required' }
);

const slaSchema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(10080),
  followUpMinutes: z.number().int().min(1).max(43200)
});

const businessHoursSchema = z.object({
  timezone: z.string().min(1).max(100),
  weeklySchedule: z.record(z.string(), z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).nullable())
});

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isOpen: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reason: z.string().max(200).nullable().optional()
});

const problem = (res: Response, status: number, title: string, detail?: string) =>
  res.status(status).json({
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    ...(detail ? { detail } : {})
  });

const parseConversationId = (value: unknown) => z.string().uuid().safeParse(value);

const canSeeAllConversations = (role: string) => ['ADMIN', 'MARKETING_DIRECTOR'].includes(role);

export const listConversations = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success || !req.user) {
    return problem(res, 400, 'Invalid conversation filters');
  }

  const { page, pageSize, status, priority, assignedUserId, businessStatus, source, search, includeFinal } = parsed.data;
  const userFilter = canSeeAllConversations(req.user.role)
    ? {}
    : { assignedUserId: req.user.id };
  const where: any = {
    ...userFilter,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(source === 'ADS' ? { source: 'ADS' } : {}),
    ...(source === 'ORGANIC' ? { source: null } : {}),
    ...(search
      ? {
          client: {
            OR: [
              { phone: { contains: search } },
              { name: { contains: search, mode: 'insensitive' } }
            ]
          }
        }
      : {})
  };

  // Excluir conversaciones cuyo estado de gestión sea final, a menos que se pida verlas
  if (!includeFinal) {
    const finalStatuses = await prisma.conversationStatusConfig.findMany({ where: { isFinal: true, isActive: true } });
    const finalCodes = finalStatuses.map(s => s.code);
    if (finalCodes.length > 0) {
      where.businessStatus = { notIn: finalCodes, not: null };
    }
  }

  // Filtrar por businessStatus si viene en la query
  if (businessStatus) {
    where.businessStatus = businessStatus;
  }

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
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;

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
  const canAccessQueue = !conversation.assignedUserId && conversation.assignedRole === 'MARKETING_DIRECTOR';
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id && !canAccessQueue) {
    return problem(res, 403, 'Insufficient permissions');
  }

  return res.json(conversation);
};

export const claimConversation = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;

  try {
    const conversation = await takeConversation(conversationId, req.user.id);
    return res.json(conversation);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'CONVERSATION_NOT_FOUND') return problem(res, 404, 'Conversation not found');
    if (code === 'CONVERSATION_ALREADY_ASSIGNED') return problem(res, 409, 'Conversation is assigned to another agent');
    if (code === 'MARKETING_QUEUE_REQUIRES_DIRECTOR') return problem(res, 403, 'Marketing must assign this conversation');
    if (code === 'USER_NOT_ALLOWED') return problem(res, 403, 'Insufficient permissions');
    return problem(res, 500, 'Unable to claim conversation');
  }
};

export const reactivateBot = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;

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
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;
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

export const listAssignableUsers = async (_req: AuthenticatedRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['AGENT', 'MARKETING_DIRECTOR'] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' }
  });
  return res.json(users);
};

export const updateConversationStatus = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Conversation status data is invalid');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;
  const current = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!current) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && current.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const sla = await prisma.slaPolicy.findUnique({ where: { id: 'default' } });
  const nextFollowUpAt = parsed.data.nextFollowUpAt === undefined
    ? parsed.data.status === 'HUMAN_ACTIVE'
      ? new Date(Date.now() + (sla?.followUpMinutes ?? 1440) * 60 * 1000)
      : undefined
    : parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null;

  const conversation = await prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status: parsed.data.status,
        priority: parsed.data.priority,
        nextFollowUpAt,
        businessStatus: parsed.data.businessStatus
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

export const listConversationStatuses = async (req: AuthenticatedRequest, res: Response) => {
  const statuses = await prisma.conversationStatusConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  return res.json(statuses);
};

export const createConversationStatus = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = statusConfigCreateSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Conversation status data is invalid');
  const { label, color, isFinal, sortOrder } = parsed.data;
  const code = label
    .toUpperCase()
    .replace(/[^\w]/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .replace(/__+/g, '_')
    .substring(0, 30);
  // Verificar unicidad del code
  const exists = await prisma.conversationStatusConfig.findFirst({ where: { code, isActive: true } });
  if (exists) return problem(res, 409, 'Ya existe un estado con ese código');
  const status = await prisma.conversationStatusConfig.create({
    data: { code, label, color, isFinal: isFinal ?? false, sortOrder: sortOrder ?? 0, isActive: true }
  });
  return res.json(status);
};

export const updateConversationStatusConfig = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = statusConfigUpdateSchema.safeParse(req.params);
  if (!parsed.success) return problem(res, 400, 'Conversation status ID is invalid');
  const id = parsed.data.id;
  const updateData: any = {};
  if (req.body.label !== undefined) updateData.label = req.body.label;
  if (req.body.color !== undefined) updateData.color = req.body.color;
  if (req.body.isFinal !== undefined) updateData.isFinal = req.body.isFinal;
  if (req.body.sortOrder !== undefined) updateData.sortOrder = req.body.sortOrder;
  const status = await prisma.conversationStatusConfig.update({ where: { id }, data: updateData });
  return res.json(status);
};

export const deleteConversationStatusConfig = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = statusConfigDeleteSchema.safeParse(req.params);
  if (!parsed.success) return problem(res, 400, 'Conversation status ID is invalid');
  const id = parsed.data.id;
  await prisma.conversationStatusConfig.update({ where: { id }, data: { isActive: false } });
  return res.json({ success: true });
};

export const getBusinessHours = async (_req: AuthenticatedRequest, res: Response) => {
  const config = await prisma.businessHoursConfig.findUnique({ where: { id: 'default' } });
  return res.json({
    timezone: config?.timezone ?? 'America/Bogota',
    weeklySchedule: config ? JSON.parse(config.weeklySchedule) : DEFAULT_WEEKLY_SCHEDULE
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

export const listBusinessHourExceptions = async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(await prisma.businessHoursException.findMany({ orderBy: { date: 'asc' } }));
};

export const saveBusinessHourException = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = exceptionSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Business-hours exception is invalid');
  const exception = await prisma.businessHoursException.upsert({
    where: { date: parsed.data.date },
    create: { ...parsed.data },
    update: { ...parsed.data }
  });
  return res.json(exception);
};

export const deleteBusinessHourException = async (req: AuthenticatedRequest, res: Response) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.params.date);
  if (!date.success) return problem(res, 400, 'Exception date is invalid');
  await prisma.businessHoursException.deleteMany({ where: { date: date.data } });
  return res.status(204).send();
};

export const sendAgentMessage = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;
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

/**
 * POST /api/crm/conversations/:id/attachments
 * Recibe el archivo como body binario (express.raw) y lo sube a la Media API
 * de Meta para enviarlo como imagen/audio/video/documento por WhatsApp.
 */
export const sendAgentAttachment = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const conversationId = parsedId.data;
  const parsed = attachmentQuerySchema.safeParse(req.query);
  if (!parsed.success) return problem(res, 400, 'Attachment parameters are invalid');

  const buffer = req.body as Buffer | undefined;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return problem(res, 400, 'Attachment body is empty');
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId }
  });
  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const client = await prisma.client.findUnique({ where: { id: conversation.clientId } });
  if (!client) return problem(res, 404, 'Conversation client not found');

  const { type, mediaType, filename, caption } = parsed.data;
  const uploaded = await uploadWhatsAppMedia(buffer, mediaType, filename);
  if (!uploaded.id) {
    return problem(res, 502, 'WhatsApp media upload failed', uploaded.error ?? 'Meta rejected the file');
  }

  const sent = await sendWhatsAppMedia(
    client.phone,
    type as WhatsAppMediaType,
    uploaded.id,
    caption,
    filename
  );
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'HUMAN_ACTIVE' }
  });
  const message = await recordOutboundMessage({
    conversationId: conversation.id,
    body: caption ?? `Archivo ${type} enviado.`,
    senderType: 'AGENT',
    deliveryStatus: sent ? 'SENT' : 'FAILED',
    type: type.toUpperCase(),
    mediaId: uploaded.id
  });

  if (!sent) return problem(res, 502, 'WhatsApp media message could not be sent');
  return res.status(201).json(message);
};

/**
 * POST /api/crm/conversations/start
 * Inicia un chat saliente con un número nuevo: crea/obtiene el cliente y la
 * conversación (HUMAN_ACTIVE, asignada al agente) y envía el primer mensaje.
 */
export const startConversation = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsed = startConversationSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Outreach data is invalid');

  const phone = parsed.data.phone;
  const client = await prisma.client.upsert({
    where: { phone },
    update: {},
    create: { phone }
  });

  let conversation = await prisma.conversation.findFirst({
    where: { clientId: client.id, status: { in: ['NEW', 'BOT_ACTIVE', 'HUMAN_ACTIVE', 'WAITING_CUSTOMER'] } }
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { clientId: client.id, status: 'HUMAN_ACTIVE', assignedUserId: req.user.id }
    });
  } else if (conversation.status !== 'HUMAN_ACTIVE') {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: 'HUMAN_ACTIVE', assignedUserId: conversation.assignedUserId ?? req.user.id }
    });
  }

  const sent = await sendWhatsAppMessage(phone, parsed.data.body);
  const message = await recordOutboundMessage({
    conversationId: conversation.id,
    body: parsed.data.body,
    senderType: 'AGENT',
    deliveryStatus: sent ? 'SENT' : 'FAILED'
  });

  if (!sent) {
    return problem(
      res,
      502,
      'WhatsApp message could not be sent',
      'Si el número nunca ha escrito al negocio, WhatsApp exige una plantilla aprobada (ventana de 24h).'
    );
  }
  return res.status(201).json({ conversation, message });
};

/**
 * GET /api/crm/media/:id
 * Proxy autenticado para visualizar/descargar el binario de un media de
 * WhatsApp (imagen, video, audio o documento recibido del cliente).
 */
export const getMedia = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = mediaIdSchema.safeParse(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Media ID is invalid');

  const media = await getWhatsAppMedia(parsedId.data);
  if (!media) return problem(res, 404, 'Media not found or WhatsApp credentials unavailable');

  const buffer = await downloadWhatsAppMedia(media.url);
  if (!buffer) return problem(res, 502, 'Media download failed');

  res.set('Content-Type', media.mimeType);
  res.set('Cache-Control', 'private, max-age=3600');
  return res.send(buffer);
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
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Notification ID is invalid');
  const notificationId = parsedId.data;
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
