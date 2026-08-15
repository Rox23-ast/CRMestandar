import { prisma } from '../../core/database/prisma';
import { publishCrmEvent } from './eventStream';

interface NotificationInput {
  userId?: string;
  role?: string;
  conversationId?: string;
  type: string;
  title: string;
  body: string;
}

export const createNotification = async (input: NotificationInput) => {
  const notification = await prisma.notification.create({ data: input });
  publishCrmEvent('notification.created', notification);
  return notification;
};
