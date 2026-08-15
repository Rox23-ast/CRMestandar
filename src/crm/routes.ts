import { Router } from 'express';
import { requireCrmUser, requireCrmRole } from '../core/auth/authMiddleware';
import { bootstrapAdmin, createUser, login } from './controllers/authController';
import {
  assignConversation,
  claimConversation,
  getConversation,
  getBusinessHours,
  getSlaPolicy,
  listConversations,
  listNotifications,
  markNotificationRead,
  reactivateBot,
  sendAgentMessage,
  streamCrmEvents,
  updateBusinessHours,
  updateConversationStatus,
  updateSlaPolicy
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
crmRouter.patch('/conversations/:id/status', updateConversationStatus);
crmRouter.post('/conversations/:id/messages', sendAgentMessage);
crmRouter.get('/settings/sla', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), getSlaPolicy);
crmRouter.put('/settings/sla', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateSlaPolicy);
crmRouter.get('/settings/business-hours', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), getBusinessHours);
crmRouter.put('/settings/business-hours', requireCrmRole('ADMIN', 'MARKETING_DIRECTOR'), updateBusinessHours);
crmRouter.get('/notifications', listNotifications);
crmRouter.patch('/notifications/:id/read', markNotificationRead);
crmRouter.get('/events', streamCrmEvents);
