import { Prisma, PrismaClient, Conversation } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { createNotification } from './notificationService';

export const ACTIVE_CONVERSATION_STATUSES = [
  'NEW',
  'BOT_ACTIVE',
  'HUMAN_ACTIVE',
  'WAITING_CUSTOMER',
  'RESOLVED'
] as const;

const MARKETING_ROLE = 'MARKETING_DIRECTOR';

export const DEFAULT_BUSINESS_STATUS = 'PENDIENTE_COTIZACION';

interface WeeklySlot {
  start: string;
  end: string;
}

type WeeklySchedule = Record<string, WeeklySlot | null>;

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  '0': null,
  '1': { start: '08:00', end: '18:00' },
  '2': { start: '08:00', end: '18:00' },
  '3': { start: '08:00', end: '18:00' },
  '4': { start: '08:00', end: '18:00' },
  '5': { start: '08:00', end: '18:00' },
  '6': null
};

interface AssignmentTarget {
  userId?: string;
  role?: string;
  reason: string;
  status?: string;
}

const parseTime = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

export const isWithinTimeSlot = (minutes: number, slot: WeeklySlot | null) => {
  if (!slot) return false;
  return minutes >= parseTime(slot.start) && minutes < parseTime(slot.end);
};

const getZonedDateParts = (date: Date, timezone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: weekdays[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
};

export const isWithinBusinessHours = async (date = new Date()) => {
  const config = await prisma.businessHoursConfig.findUnique({ where: { id: 'default' } });
  const timezone = config?.timezone ?? 'America/Bogota';
  const parts = getZonedDateParts(date, timezone);
  const exception = await prisma.businessHoursException.findUnique({ where: { date: parts.date } });

  if (exception) {
    if (!exception.isOpen || !exception.startTime || !exception.endTime) return false;
    return isWithinTimeSlot(parts.minutes, { start: exception.startTime, end: exception.endTime });
  }

  let schedule = DEFAULT_WEEKLY_SCHEDULE;
  if (config) {
    try {
      schedule = JSON.parse(config.weeklySchedule) as WeeklySchedule;
    } catch {
      schedule = DEFAULT_WEEKLY_SCHEDULE;
    }
  }
  const slot = schedule[String(parts.dayOfWeek)];
  return isWithinTimeSlot(parts.minutes, slot);
};

const getAssignmentTarget = async (
  tx: Prisma.TransactionClient | PrismaClient,
  now: Date
): Promise<AssignmentTarget> => {
  if (!(await isWithinBusinessHours(now))) {
    const directors = await tx.user.findMany({ where: { role: MARKETING_ROLE, isActive: true }, orderBy: { createdAt: 'asc' } });
    const director = directors[0];
    return director
      ? { userId: director.id, role: MARKETING_ROLE, reason: 'OUT_OF_HOURS' }
      : { role: MARKETING_ROLE, reason: 'OUT_OF_HOURS' };
  }

  const agents = await tx.user.findMany({ where: { role: 'AGENT', availabilityStatus: 'AVAILABLE', isActive: true } });
  const eligibleAgents = [];

  for (const agent of agents) {
    const activeCount = await tx.conversation.count({
      where: {
        assignedUserId: agent.id,
        status: { in: [...ACTIVE_CONVERSATION_STATUSES] }
      }
    });

    if (activeCount < agent.maxActiveConversations) {
      eligibleAgents.push(agent);
    }
  }

  eligibleAgents.sort((left, right) => {
    const leftTime = left.lastAssignedAt?.getTime() ?? 0;
    const rightTime = right.lastAssignedAt?.getTime() ?? 0;
    return leftTime - rightTime;
  });

  const agent = eligibleAgents[0];
  return agent
    ? { userId: agent.id, reason: 'ROUND_ROBIN' }
    : { role: MARKETING_ROLE, reason: 'NO_AVAILABLE_AGENT' };
};

const createAssignment = async (
  tx: Prisma.TransactionClient,
  conversationId: string,
  target: AssignmentTarget,
  assignedByUserId?: string
) => {
  await tx.conversationAssignment.updateMany({
    where: { conversationId, releasedAt: null },
    data: { releasedAt: new Date() }
  });

  const conversation = await tx.conversation.update({
    where: { id: conversationId },
    data: {
      assignedUserId: target.userId,
      assignedRole: target.role,
      status: target.status ?? 'BOT_ACTIVE'
    }
  });

  await tx.conversationAssignment.create({
    data: {
      conversationId,
      assignedUserId: target.userId,
      assignedRole: target.role,
      assignedByUserId,
      reason: target.reason
    }
  });

  if (target.userId) {
    await tx.user.update({ where: { id: target.userId }, data: { lastAssignedAt: new Date() } });
  }

  await tx.auditEvent.create({
    data: {
      conversationId,
      actorUserId: assignedByUserId,
      eventType: 'CONVERSATION_ASSIGNED',
      payload: JSON.stringify(target)
    }
  });

  return conversation;
};

const notifyAssignment = async (conversation: Conversation, target: AssignmentTarget) => {
  await createNotification({
    userId: target.userId,
    role: target.role,
    conversationId: conversation.id,
    type: 'CONVERSATION_ASSIGNED',
    title: target.userId ? 'Nueva conversación asignada' : 'Conversación pendiente de asignación',
    body: target.userId
      ? 'Tienes una nueva conversación para seguimiento.'
      : 'Hay una conversación pendiente de asignación por Marketing.'
  });
};

export const createOrGetConversation = async (phone: string, now = new Date()) => {
  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.upsert({
      where: { phone },
      update: {},
      create: { phone, botStep: 'START' }
    });
    const existing = await tx.conversation.findFirst({
      where: { clientId: client.id, status: { in: [...ACTIVE_CONVERSATION_STATUSES] } },
      orderBy: { updatedAt: 'desc' }
    });
    if (existing) return { conversation: existing, isNew: false, target: undefined };

    const target = await getAssignmentTarget(tx, now);
    const sla = await tx.slaPolicy.findUnique({ where: { id: 'default' } });
    const created = await tx.conversation.create({
      data: {
        clientId: client.id,
        status: 'BOT_ACTIVE',
        assignedUserId: target.userId,
        assignedRole: target.role,
        businessStatus: DEFAULT_BUSINESS_STATUS,
        firstResponseDueAt: new Date(now.getTime() + (sla?.firstResponseMinutes ?? 15) * 60 * 1000),
        nextFollowUpAt: new Date(now.getTime() + (sla?.followUpMinutes ?? 1440) * 60 * 1000)
      }
    });
    return { conversation: await createAssignment(tx, created.id, target), isNew: true, target };
  });

  if (result.isNew) {
    await notifyAssignment(result.conversation, result.target!);
  }
  return { conversation: result.conversation, isNew: result.isNew };
};

export const recordInboundMessage = async (input: {
  phone: string;
  body?: string;
  type?: string;
  mediaId?: string;
  externalId?: string;
}) => {
  if (input.externalId) {
    const existing = await prisma.message.findUnique({ where: { externalId: input.externalId } });
    if (existing) return { conversationId: existing.conversationId, duplicate: true, isNew: false };
  }

  const { conversation, isNew } = await createOrGetConversation(input.phone);
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      externalId: input.externalId,
      direction: 'INBOUND',
      senderType: 'CUSTOMER',
      type: input.type ?? 'TEXT',
      body: input.body,
      mediaId: input.mediaId,
      deliveryStatus: 'RECEIVED'
    }
  });

  await prisma.auditEvent.create({
    data: {
      conversationId: conversation.id,
      eventType: 'MESSAGE_RECEIVED',
      payload: JSON.stringify({ type: input.type ?? 'TEXT', externalId: input.externalId })
    }
  });

  const nextStatus = conversation.status === 'RESOLVED'
    ? conversation.assignedUserId ? 'HUMAN_ACTIVE' : 'BOT_ACTIVE'
    : conversation.status;

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, status: nextStatus }
  });

  if (conversation.assignedUserId || conversation.assignedRole) {
    await createNotification({
      userId: conversation.assignedUserId ?? undefined,
      role: conversation.assignedRole ?? undefined,
      conversationId: conversation.id,
      type: 'MESSAGE_RECEIVED',
      title: 'Nuevo mensaje de cliente',
      body: input.body ?? 'El cliente envió un archivo.'
    });
  }

  return { conversationId: conversation.id, status: nextStatus, duplicate: false, isNew };
};

export const recordOutboundMessage = async (input: {
  conversationId: string;
  body: string;
  senderType: 'BOT' | 'AGENT';
  deliveryStatus: string;
}) => {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: 'OUTBOUND',
      senderType: input.senderType,
      type: 'TEXT',
      body: input.body,
      deliveryStatus: input.deliveryStatus
    }
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: message.createdAt }
  });

  await prisma.auditEvent.create({
    data: {
      conversationId: input.conversationId,
      eventType: 'MESSAGE_SENT',
      payload: JSON.stringify({ senderType: input.senderType, deliveryStatus: input.deliveryStatus })
    }
  });

  return message;
};

export const takeConversation = async (conversationId: string, userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !['AGENT', 'ADMIN', MARKETING_ROLE].includes(user.role)) {
    throw new Error('USER_NOT_ALLOWED');
  }

  const conversation = await prisma.$transaction(async (tx) => {
    const current = await tx.conversation.findUnique({ where: { id: conversationId } });
    if (!current) throw new Error('CONVERSATION_NOT_FOUND');
    if (user.role === 'AGENT' && current.assignedUserId && current.assignedUserId !== userId) {
      throw new Error('CONVERSATION_ALREADY_ASSIGNED');
    }
    if (user.role === 'AGENT' && current.assignedRole === MARKETING_ROLE) {
      throw new Error('MARKETING_QUEUE_REQUIRES_DIRECTOR');
    }

    const target = { userId, reason: 'MANUAL_CLAIM', status: 'HUMAN_ACTIVE' };
    await createAssignment(tx, conversationId, target, userId);
    return tx.conversation.update({ where: { id: conversationId }, data: { status: 'HUMAN_ACTIVE' } });
  });

  await createNotification({
    userId,
    conversationId,
    type: 'CONVERSATION_CLAIMED',
    title: 'Conversación tomada',
    body: 'La conversación está ahora bajo tu atención humana.'
  });
  return conversation;
};

export const returnConversationToBot = async (conversationId: string, userId: string) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
  if (conversation.assignedUserId !== userId) throw new Error('USER_NOT_ALLOWED');

  return prisma.$transaction(async (tx) => {
    await tx.conversation.update({ where: { id: conversationId }, data: { status: 'BOT_ACTIVE' } });
    await tx.auditEvent.create({
      data: { conversationId, actorUserId: userId, eventType: 'BOT_REACTIVATED' }
    });
    return tx.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  });
};

export const manuallyAssignConversation = async (
  conversationId: string,
  targetUserId: string,
  assignedByUserId: string
) => {
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser || !['AGENT', MARKETING_ROLE].includes(targetUser.role) || !targetUser.isActive) {
    throw new Error('TARGET_USER_NOT_ALLOWED');
  }

  const conversation = await prisma.$transaction(async (tx) => {
    return createAssignment(tx, conversationId, { userId: targetUserId, reason: 'MANUAL_ASSIGNMENT', status: 'HUMAN_ACTIVE' }, assignedByUserId);
  });

  await notifyAssignment(conversation, { userId: targetUserId, reason: 'MANUAL_ASSIGNMENT' });
  return conversation;
};
