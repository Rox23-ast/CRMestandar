import { Router } from 'express';
import { requireCrmUser, requireCrmRole } from '../core/auth/authMiddleware';
import { bootstrapAdmin, createUser, login } from './controllers/authController';
import {
  assignConversation,
  claimConversation,
  getConversation,
  listConversations,
  listNotifications,
  markNotificationRead,
  reactivateBot,
  sendAgentMessage,
  streamCrmEvents
} from './controllers/conversationController';

export const crmRouter = Router();

crmRouter.post('/auth/bootstrap', bootstrapAdmin);
crmRouter.post('/auth/login', login);
crmRouter.use(requireCrmUser);
crmRouter.post('/auth/users', requireCrmRole('ADMIN'), createUser);
crmRouter.get('/conversations', listConversations);
crmRouter.get('/conversations/:id', getConversation);
crmRouter.post('/conversations/:id/claim', claimConversation);
crmRouter.post('/conversations/:id/bot', reactivateBot);
crmRouter.post('/conversations/:id/assign', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), assignConversation);
crmRouter.post('/conversations/:id/messages', sendAgentMessage);
crmRouter.get('/notifications', listNotifications);
crmRouter.patch('/notifications/:id/read', markNotificationRead);
crmRouter.get('/events', streamCrmEvents);
