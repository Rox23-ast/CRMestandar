import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../../core/auth/authMiddleware';
import { prisma } from '../../core/database/prisma';
import { sendWhatsAppMessage, sendWhatsAppDocument, uploadWhatsAppMedia, sendWhatsAppMedia, getWhatsAppMedia, downloadWhatsAppMedia, sendWhatsAppTemplate, WhatsAppMediaType } from '../../bot/services/whatsappService';
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
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedUserId: z.string().uuid().optional(),
  businessStatus: z.string().optional(),
  source: z.enum(['ADS', 'ORGANIC']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  includeFinal: z.coerce.boolean().optional(),
  unreadOnly: z.coerce.boolean().optional()
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4096),
  replyToMessageId: z.string().uuid().optional()
});

const updateMessageSchema = z.object({
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

const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(120).nullable()
});

// MIME aceptados por la Media API de Meta por tipo de mensaje
// (documentos: cualquier MIME, se validan aparte solo por tamaño).
const WHATSAPP_ALLOWED_MEDIA_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png'],
  audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
  video: ['video/mp4', 'video/3gp']
};

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
              { name: { contains: search } }
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

  const include = {
    client: { select: { id: true, phone: true, name: true } },
    assignedUser: { select: { id: true, name: true, role: true } }
  };
  const orderBy: any = [{ priority: 'asc' }, { lastMessageAt: 'desc' }];

  // Conversaciones no leídas para este usuario: notificaciones sin readAt.
  // La persistencia vive en Notification.readAt; así el "no leído" sobrevive
  // a recargas y las conversaciones no leídas salen al inicio de la página 1.
  const unreadRows = await prisma.notification.findMany({
    where: {
      OR: [{ userId: req.user.id }, { role: req.user.role }],
      readAt: null,
      conversationId: { not: null }
    },
    select: { conversationId: true }
  });
  const unreadIds = [...new Set(unreadRows.map((row) => row.conversationId as string))];
  const unreadIdSet = new Set(unreadIds);

  // Filtro "solo no leídas" (disponible para todos los roles): restringe la
  // bandeja a las conversaciones con notificaciones sin leer de este usuario.
  if (parsed.data.unreadOnly) {
    const total = await prisma.conversation.count({
      where: { ...where, id: { in: unreadIds } }
    });
    const conversations = unreadIds.length > 0
      ? await prisma.conversation.findMany({
          where: { ...where, id: { in: unreadIds } },
          include,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      : [];

    return res.json({
      data: conversations.map((conversation) => ({ ...conversation, unread: true })),
      unreadCount: total,
      pagination: { page, pageSize, total }
    });
  }

  // Las no leídas solo se anteponen en la página 1; en las siguientes, el
  // skip descuenta las no leídas ya mostradas para no repetir ni saltar filas.
  const unreadOnFirstPage = Math.min(unreadIds.length, pageSize);
  const unreadConversations = page === 1 && unreadOnFirstPage > 0
    ? await prisma.conversation.findMany({
        where: { ...where, id: { in: unreadIds } },
        include,
        orderBy,
        take: pageSize
      })
    : [];

  const restWhere = page === 1 && unreadOnFirstPage > 0 ? { ...where, id: { notIn: unreadIds } } : where;
  const restSkip = Math.max(0, (page - 1) * pageSize - (page === 1 ? 0 : unreadOnFirstPage));
  const restTake = page === 1 ? pageSize - unreadConversations.length : pageSize;
  const [rest, total, unreadTotal] = await Promise.all([
    prisma.conversation.findMany({
      where: restWhere,
      include,
      orderBy,
      skip: restSkip,
      take: restTake
    }),
    prisma.conversation.count({ where }),
    unreadIds.length > 0
      ? prisma.conversation.count({ where: { ...where, id: { in: unreadIds } } })
      : Promise.resolve(0)
  ]);

  const conversations = [...unreadConversations, ...rest];

  return res.json({
    data: conversations.map((conversation) => ({ ...conversation, unread: unreadIdSet.has(conversation.id) })),
    unreadCount: unreadTotal,
    pagination: { page, pageSize, total }
  });
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

  // Abrir la conversación la marca como leída para este usuario (persistido
  // en Notification.readAt; es lo que usa listConversations para ordenar).
  await prisma.notification.updateMany({
    where: {
      conversationId,
      readAt: null,
      OR: [{ userId: req.user.id }, { role: req.user.role }]
    },
    data: { readAt: new Date() }
  });

  return res.json(conversation);
};

/**
 * PATCH /api/crm/conversations/:id/client
 * Registra/edita el nombre del cliente de la conversación.
 */
export const updateConversationClient = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Conversation ID is invalid');
  const parsed = updateClientSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Client name is invalid');

  const conversation = await prisma.conversation.findUnique({ where: { id: parsedId.data } });
  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const client = await prisma.client.update({
    where: { id: conversation.clientId },
    data: { name: parsed.data.name }
  });
  return res.json(client);
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

  // Respuesta a un mensaje concreto: valida que pertenezca a esta conversación
  // y usa su externalId para que WhatsApp lo muestre como cita.
  let replyToMessageId: string | null = null;
  let contextMessageId: string | undefined;
  if (parsed.data.replyToMessageId) {
    const replied = await prisma.message.findUnique({ where: { id: parsed.data.replyToMessageId } });
    if (!replied || replied.conversationId !== conversation.id) {
      return problem(res, 400, 'replyToMessageId no pertenece a esta conversación');
    }
    replyToMessageId = replied.id;
    contextMessageId = replied.externalId ?? undefined;
  }

  const sent = await sendWhatsAppMessage(client.phone, parsed.data.body, contextMessageId);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: 'HUMAN_ACTIVE' }
  });
  const message = await recordOutboundMessage({
    conversationId: conversation.id,
    body: parsed.data.body,
    senderType: 'AGENT',
    replyToMessageId,
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

  // Límites de la Media API de Meta: imagen 5MB, video/audio 16MB.
  const megabytes = buffer.length / (1024 * 1024);
  if (parsed.data.type === 'image' && megabytes > 5) {
    return problem(res, 413, 'Imagen demasiado grande', 'WhatsApp acepta imágenes de máximo 5 MB.');
  }
  if ((parsed.data.type === 'video' || parsed.data.type === 'audio') && megabytes > 16) {
    return problem(res, 413, 'Archivo demasiado grande', 'WhatsApp acepta videos y audios de máximo 16 MB.');
  }
  if (parsed.data.type === 'document' && megabytes > 60) {
    return problem(res, 413, 'Documento demasiado grande', 'El límite de subida es de 60 MB.');
  }

  // Formatos que acepta la Media API de Meta por tipo. Los documentos
  // admiten cualquier MIME, por eso no están en la lista.
  const allowedMediaTypes = WHATSAPP_ALLOWED_MEDIA_TYPES[parsed.data.type];
  if (allowedMediaTypes && !allowedMediaTypes.includes(parsed.data.mediaType.toLowerCase())) {
    return problem(
      res,
      415,
      'Formato no soportado',
      `WhatsApp no acepta ${parsed.data.mediaType} como ${parsed.data.type}. Formatos válidos: ${allowedMediaTypes.join(', ')}.`
    );
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
 * PATCH /api/crm/messages/:id
 * Edita el registro local de un mensaje enviado (OUTBOUND). WhatsApp no
 * permite editar mensajes ya entregados, así que el cambio solo se refleja
 * en el historial del CRM.
 */
export const updateMessage = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Message ID is invalid');
  const parsed = updateMessageSchema.safeParse(req.body);
  if (!parsed.success) return problem(res, 400, 'Message body is invalid');

  const message = await prisma.message.findUnique({ where: { id: parsedId.data } });
  if (!message) return problem(res, 404, 'Message not found');
  if (message.direction !== 'OUTBOUND') {
    return problem(res, 400, 'Only sent messages can be edited');
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { body: parsed.data.body }
  });
  return res.json(updated);
};

/**
 * DELETE /api/crm/messages/:id
 * Elimina el registro local de un mensaje enviado (OUTBOUND). El mensaje ya
 * entregado sigue visible para el cliente en WhatsApp.
 */
export const deleteMessage = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return problem(res, 401, 'Authentication required');
  const parsedId = parseConversationId(req.params.id);
  if (!parsedId.success) return problem(res, 400, 'Message ID is invalid');

  const message = await prisma.message.findUnique({ where: { id: parsedId.data } });
  if (!message) return problem(res, 404, 'Message not found');
  if (message.direction !== 'OUTBOUND') {
    return problem(res, 400, 'Only sent messages can be deleted');
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
  if (!conversation) return problem(res, 404, 'Conversation not found');
  if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id) {
    return problem(res, 403, 'Conversation is not assigned to this user');
  }

  await prisma.message.delete({ where: { id: message.id } });
  return res.status(204).send();
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
  const isFirstContact = !conversation;
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

  let sent = false;
  let templateUsed = false;

  // Primer contacto con un número que nunca ha escrito: WhatsApp exige una
  // plantilla aprobada (ventana de 24h). Si hay plantilla configurada se envía
  // por plantilla; si no, se intenta texto libre y se informa si Meta rechaza.
  if (isFirstContact) {
    const config = await prisma.botConfig.findFirst();
    if (config?.outreachTemplateName) {
      const variableCount = config.outreachTemplateVariables ?? 1;
      const parameters = [parsed.data.body, ...Array(Math.max(0, variableCount - 1)).fill('')];
      sent = await sendWhatsAppTemplate(
        phone,
        config.outreachTemplateName,
        config.outreachTemplateLanguage ?? 'es',
        parameters
      );
      templateUsed = true;
      if (!sent) {
        // La plantilla falló (nombre mal, rechazada, etc.): intentar texto libre.
        sent = await sendWhatsAppMessage(phone, parsed.data.body);
        templateUsed = false;
      }
    } else {
      sent = await sendWhatsAppMessage(phone, parsed.data.body);
    }
  } else {
    sent = await sendWhatsAppMessage(phone, parsed.data.body);
    if (!sent && isFirstContact === false) {
      // Texto libre rechazado fuera de ventana: reintentar con plantilla si existe.
      const config = await prisma.botConfig.findFirst();
      if (config?.outreachTemplateName) {
        const variableCount = config.outreachTemplateVariables ?? 1;
        const parameters = [parsed.data.body, ...Array(Math.max(0, variableCount - 1)).fill('')];
        sent = await sendWhatsAppTemplate(
          phone,
          config.outreachTemplateName,
          config.outreachTemplateLanguage ?? 'es',
          parameters
        );
        templateUsed = true;
      }
    }
  }

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
      templateUsed
        ? 'La plantilla configurada no pudo enviarse: revisa su nombre, idioma o estado en WhatsApp Manager.'
        : 'Si el número nunca ha escrito al negocio, WhatsApp exige una plantilla aprobada (ventana de 24h).'
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

  // Todos los roles autenticados pueden descargar media, pero un agente solo
  // el de conversaciones a las que tiene acceso (asignadas o cola de marketing).
  const message = await prisma.message.findFirst({ where: { mediaId: parsedId.data } });
  if (message) {
    const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
    if (!conversation) return problem(res, 404, 'Conversation not found');
    const canAccessQueue = !conversation.assignedUserId && conversation.assignedRole === 'MARKETING_DIRECTOR';
    if (!canSeeAllConversations(req.user.role) && conversation.assignedUserId !== req.user.id && !canAccessQueue) {
      return problem(res, 403, 'Insufficient permissions');
    }
  }

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
